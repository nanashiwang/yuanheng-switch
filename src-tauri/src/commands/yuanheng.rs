use std::collections::BTreeSet;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::store::AppState;

const BASE_URL: &str = "https://cn.meta-api.vip";
const TOKEN_KEY: &str = "yuanheng_access_token";
const USER_ID_KEY: &str = "yuanheng_user_id";
const CACHE_KEY: &str = "yuanheng_connection_cache";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengAccount {
    pub username: String,
    pub display_name: String,
    pub group: String,
    pub remaining_usd: f64,
    pub used_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengConnectionStatus {
    pub connected: bool,
    pub base_url: String,
    pub user_id: Option<String>,
    pub account: Option<YuanhengAccount>,
    pub models: Vec<String>,
    pub announcement: Option<String>,
    pub last_synced_at: Option<i64>,
}

impl Default for YuanhengConnectionStatus {
    fn default() -> Self {
        Self {
            connected: false,
            base_url: BASE_URL.to_string(),
            user_id: None,
            account: None,
            models: Vec::new(),
            announcement: None,
            last_synced_at: None,
        }
    }
}

fn response_message(value: &Value) -> Option<String> {
    value
        .get("message")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
}

fn quota_to_usd(value: Option<&Value>) -> f64 {
    value.and_then(Value::as_f64).unwrap_or_default() / 500_000.0
}

fn parse_account(value: &Value) -> Result<YuanhengAccount, String> {
    if value.get("success").and_then(Value::as_bool) == Some(false) {
        return Err(response_message(value).unwrap_or_else(|| "元衡账号验证失败".to_string()));
    }
    let data = value
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "元衡账号响应缺少 data".to_string())?;
    Ok(YuanhengAccount {
        username: data
            .get("username")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        display_name: data
            .get("display_name")
            .or_else(|| data.get("displayName"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        group: data
            .get("group")
            .and_then(Value::as_str)
            .unwrap_or("default")
            .to_string(),
        remaining_usd: quota_to_usd(data.get("quota")),
        used_usd: quota_to_usd(data.get("used_quota")),
    })
}

fn collect_model_names(value: &Value, output: &mut BTreeSet<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_model_names(item, output);
            }
        }
        Value::Object(map) => {
            for key in ["model_name", "modelName", "model"] {
                if let Some(name) = map.get(key).and_then(Value::as_str) {
                    let name = name.trim();
                    if !name.is_empty() && name.len() <= 120 {
                        output.insert(name.to_string());
                    }
                }
            }
            if let Some(data) = map.get("data") {
                collect_model_names(data, output);
            }
        }
        _ => {}
    }
}

async fn fetch_json(
    client: &reqwest::Client,
    url: &str,
    token: Option<&str>,
    user_id: Option<&str>,
) -> Result<Value, String> {
    let mut request = client
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", "yuanheng-desktop/0.1");
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if let Some(user_id) = user_id {
        request = request.header("New-Api-User", user_id);
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("连接元衡失败: {e}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取元衡响应失败: {e}"))?;
    let value: Value = serde_json::from_str(&body)
        .map_err(|_| format!("元衡返回了非 JSON 响应 (HTTP {status})"))?;
    if !status.is_success() {
        return Err(
            response_message(&value).unwrap_or_else(|| format!("元衡请求失败 (HTTP {status})"))
        );
    }
    Ok(value)
}

async fn sync_connection(token: &str, user_id: &str) -> Result<YuanhengConnectionStatus, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建元衡客户端失败: {e}"))?;
    let account_value = fetch_json(
        &client,
        &format!("{BASE_URL}/api/user/self"),
        Some(token),
        Some(user_id),
    )
    .await?;
    let account = parse_account(&account_value)?;

    let pricing = fetch_json(
        &client,
        &format!("{BASE_URL}/api/pricing"),
        Some(token),
        Some(user_id),
    )
    .await
    .ok();
    let mut model_names = BTreeSet::new();
    if let Some(pricing) = pricing.as_ref() {
        collect_model_names(pricing, &mut model_names);
    }

    let notice = fetch_json(&client, &format!("{BASE_URL}/api/notice"), None, None)
        .await
        .ok()
        .and_then(|value| {
            value
                .get("data")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .filter(|value| !value.trim().is_empty());

    Ok(YuanhengConnectionStatus {
        connected: true,
        base_url: BASE_URL.to_string(),
        user_id: Some(user_id.to_string()),
        account: Some(account),
        models: model_names.into_iter().collect(),
        announcement: notice,
        last_synced_at: Some(chrono::Utc::now().timestamp()),
    })
}

fn read_cached_status(state: &AppState) -> Result<YuanhengConnectionStatus, String> {
    let token = state.db.get_setting(TOKEN_KEY).map_err(|e| e.to_string())?;
    if token.as_deref().unwrap_or_default().is_empty() {
        return Ok(YuanhengConnectionStatus::default());
    }
    let cached = state.db.get_setting(CACHE_KEY).map_err(|e| e.to_string())?;
    let mut status: YuanhengConnectionStatus = cached
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default();
    status.connected = true;
    status.base_url = BASE_URL.to_string();
    Ok(status)
}

#[tauri::command]
pub fn get_yuanheng_connection(
    state: State<'_, AppState>,
) -> Result<YuanhengConnectionStatus, String> {
    read_cached_status(&state)
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn connect_yuanheng(
    state: State<'_, AppState>,
    accessToken: String,
    userId: String,
) -> Result<YuanhengConnectionStatus, String> {
    let token = accessToken.trim();
    let user_id = userId.trim();
    if token.is_empty() || token.len() > 4096 || token.contains(['\n', '\r']) {
        return Err("访问令牌格式无效".to_string());
    }
    if user_id.is_empty()
        || user_id.len() > 32
        || !user_id.chars().all(|value| value.is_ascii_digit())
    {
        return Err("用户 ID 必须是数字".to_string());
    }

    let status = sync_connection(token, user_id).await?;
    state
        .db
        .set_setting(TOKEN_KEY, token)
        .map_err(|e| e.to_string())?;
    state
        .db
        .set_setting(USER_ID_KEY, user_id)
        .map_err(|e| e.to_string())?;
    state
        .db
        .set_setting(
            CACHE_KEY,
            &serde_json::to_string(&status).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    Ok(status)
}

#[tauri::command]
pub async fn refresh_yuanheng_connection(
    state: State<'_, AppState>,
) -> Result<YuanhengConnectionStatus, String> {
    let token = state
        .db
        .get_setting(TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "元衡尚未连接".to_string())?;
    let user_id = state
        .db
        .get_setting(USER_ID_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "元衡用户 ID 缺失".to_string())?;
    let status = sync_connection(&token, &user_id).await?;
    state
        .db
        .set_setting(
            CACHE_KEY,
            &serde_json::to_string(&status).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    Ok(status)
}

#[tauri::command]
pub fn disconnect_yuanheng(state: State<'_, AppState>) -> Result<bool, String> {
    for key in [TOKEN_KEY, USER_ID_KEY, CACHE_KEY] {
        state.db.set_setting(key, "").map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_newapi_account_quota() {
        let account = parse_account(&serde_json::json!({
            "success": true,
            "data": {
                "username": "nanashi",
                "display_name": "Nana",
                "group": "vip",
                "quota": 1_000_000,
                "used_quota": 250_000
            }
        }))
        .unwrap();
        assert_eq!(account.group, "vip");
        assert_eq!(account.remaining_usd, 2.0);
        assert_eq!(account.used_usd, 0.5);
    }

    #[test]
    fn extracts_models_without_unrelated_names() {
        let mut models = BTreeSet::new();
        collect_model_names(
            &serde_json::json!({
                "data": [
                    { "model_name": "gpt-5.6" },
                    { "model": "claude-opus-4-6", "name": "not-a-model" }
                ]
            }),
            &mut models,
        );
        assert_eq!(models.len(), 2);
        assert!(models.contains("gpt-5.6"));
        assert!(!models.contains("not-a-model"));
    }
}
