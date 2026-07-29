use std::collections::{BTreeSet, HashMap};
use std::time::Duration;
#[cfg(target_os = "macos")]
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::header::{HeaderMap, COOKIE, SET_COOKIE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::webview::{Cookie, NewWindowResponse};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use toml_edit::DocumentMut;

use crate::app_config::AppType;
use crate::provider::{
    ClaudeDesktopMode, ClaudeDesktopModelRoute, LocalProxyRequestOverrides, Provider, ProviderMeta,
};
use crate::services::ProviderService;
use crate::store::AppState;

const BASE_URL: &str = "https://cn.meta-api.vip";
const OPENAI_BASE_URL: &str = "https://cn.meta-api.vip/v1";
const TOPUP_URL: &str = "https://cn.meta-api.vip/console/topup";
const TOPUP_WINDOW_LABEL: &str = "yuanheng-topup";
const TOPUP_CLOSED_EVENT: &str = "yuanheng-topup-closed";
pub(crate) const MANAGED_PROVIDER_ID: &str = "yuanheng-managed";
const TOKEN_KEY: &str = "yuanheng_access_token";
const USER_ID_KEY: &str = "yuanheng_user_id";
const SESSION_COOKIE_KEY: &str = "yuanheng_session_cookie";
const PENDING_SESSION_COOKIE_KEY: &str = "yuanheng_pending_session_cookie";
const API_TOKEN_KEY: &str = "yuanheng_api_token";
const API_TOKEN_ID_KEY: &str = "yuanheng_api_token_id";
const API_TOKEN_GROUP_KEY: &str = "yuanheng_api_token_group";
const CACHE_KEY: &str = "yuanheng_connection_cache";
const PREVIOUS_PROVIDER_KEY_PREFIX: &str = "yuanheng_previous_provider_";
const PREVIOUS_HERMES_MODEL_KEY: &str = "yuanheng_previous_hermes_model";
const PREVIOUS_WORKBUDDY_CONFIG_KEY: &str = "yuanheng_previous_workbuddy_config";
const WORKBUDDY_MODEL_KEY: &str = "yuanheng_workbuddy_model";
const WORKBUDDY_GROUP_KEY: &str = "yuanheng_workbuddy_group";
const CHATGPT_DESKTOP_NAMESPACE: &str = "chatgpt-desktop";
const LOCAL_PROXY_TOKEN: &str = "PROXY_MANAGED";
const NO_PREVIOUS_VALUE: &str = "__none__";

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
    #[serde(default)]
    pub groups: Vec<YuanhengGroupOption>,
    #[serde(default)]
    pub model_groups: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub reasoning_levels: HashMap<String, Vec<String>>,
    pub announcement: Option<String>,
    pub last_synced_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengGroupOption {
    pub id: String,
    pub description: String,
    pub ratio: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengAuthResult {
    pub requires_two_factor: bool,
    pub connection: Option<YuanhengConnectionStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengToolStatus {
    pub app: String,
    pub supported: bool,
    pub configured: bool,
    pub needs_update: bool,
    pub model: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub reasoning: Option<String>,
    pub recommended_model: Option<String>,
    pub message: Option<String>,
    pub runtime_warning: Option<String>,
    pub runtime_status: Option<YuanhengRuntimeStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengRuntimeStatus {
    pub state: String,
    pub title: String,
    pub message: String,
    pub downloaded_bytes: u64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengToolConfigureResult {
    pub app: String,
    pub configured: bool,
    pub model: Option<String>,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengDisconnectResult {
    pub disconnected: bool,
    pub restored_tools: Vec<String>,
    pub removed_tools: Vec<String>,
    pub retained_tools: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengDiagnosticCheck {
    pub id: String,
    pub status: String,
    pub title: String,
    pub message: String,
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengDiagnosticReport {
    pub status: String,
    pub checked_at: i64,
    pub ready_tools: usize,
    pub attention_tools: Vec<String>,
    pub checks: Vec<YuanhengDiagnosticCheck>,
}

impl Default for YuanhengConnectionStatus {
    fn default() -> Self {
        Self {
            connected: false,
            base_url: BASE_URL.to_string(),
            user_id: None,
            account: None,
            models: Vec::new(),
            groups: Vec::new(),
            model_groups: HashMap::new(),
            reasoning_levels: HashMap::new(),
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

fn parse_user_models(value: &Value) -> Result<Vec<String>, String> {
    if value.get("success").and_then(Value::as_bool) == Some(false) {
        return Err(response_message(value).unwrap_or_else(|| "读取账号模型失败".to_string()));
    }
    let models = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| "账号模型响应格式异常".to_string())?;
    Ok(models
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|model| !model.is_empty() && model.len() <= 120)
        .map(str::to_string)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect())
}

fn parse_user_groups(value: &Value) -> Result<Vec<YuanhengGroupOption>, String> {
    if value.get("success").and_then(Value::as_bool) == Some(false) {
        return Err(response_message(value).unwrap_or_else(|| "读取账号分组失败".to_string()));
    }
    let groups = value
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "账号分组响应格式异常".to_string())?;
    let mut result = groups
        .iter()
        .map(|(id, details)| YuanhengGroupOption {
            id: id.to_string(),
            description: details
                .get("desc")
                .and_then(Value::as_str)
                .unwrap_or(id)
                .to_string(),
            ratio: details.get("ratio").and_then(Value::as_f64),
        })
        .collect::<Vec<_>>();
    result.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(result)
}

fn yuanheng_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建元衡客户端失败: {e}"))
}

fn with_session(
    mut request: reqwest::RequestBuilder,
    session_cookie: Option<&str>,
    user_id: Option<&str>,
) -> reqwest::RequestBuilder {
    if let Some(cookie) = session_cookie {
        request = request.header(COOKIE, cookie);
    }
    if let Some(user_id) = user_id {
        request = request.header("New-Api-User", user_id);
    }
    request
}

async fn parse_json_response(response: reqwest::Response) -> Result<(Value, HeaderMap), String> {
    let status = response.status();
    let headers = response.headers().clone();
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
    Ok((value, headers))
}

async fn fetch_json(
    client: &reqwest::Client,
    url: &str,
    session_cookie: Option<&str>,
    user_id: Option<&str>,
) -> Result<Value, String> {
    let request = client
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", "yuanheng-desktop/0.1");
    let response = with_session(request, session_cookie, user_id)
        .send()
        .await
        .map_err(|e| format!("连接元衡失败: {e}"))?;
    parse_json_response(response).await.map(|(value, _)| value)
}

async fn fetch_user_models(
    client: &reqwest::Client,
    session_cookie: &str,
    user_id: &str,
    group: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut request = client
        .get(format!("{BASE_URL}/api/user/models"))
        .header("Accept", "application/json")
        .header("User-Agent", "yuanheng-desktop/0.1");
    if let Some(group) = group {
        request = request.query(&[("group", group)]);
    }
    let response = with_session(request, Some(session_cookie), Some(user_id))
        .send()
        .await
        .map_err(|e| format!("读取账号模型失败: {e}"))?;
    let (value, _) = parse_json_response(response).await?;
    parse_user_models(&value)
}

fn parse_api_models(value: &Value) -> Result<Vec<String>, String> {
    let models = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| "元衡模型接口响应格式异常".to_string())?;
    let names = models
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str))
        .filter(|model| !model.trim().is_empty())
        .map(str::to_string)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    if names.is_empty() {
        return Err("当前账号没有可用模型".to_string());
    }
    Ok(names)
}

async fn fetch_api_models(
    client: &reqwest::Client,
    api_token: &str,
) -> Result<Vec<String>, String> {
    let response = client
        .get(format!("{OPENAI_BASE_URL}/models"))
        .header("Accept", "application/json")
        .header("User-Agent", "yuanheng-desktop/0.1")
        .bearer_auth(api_token)
        .send()
        .await
        .map_err(|e| format!("连接元衡模型接口失败: {e}"))?;
    let (value, _) = parse_json_response(response).await?;
    parse_api_models(&value)
}

async fn verify_api_token(client: &reqwest::Client, api_token: &str) -> Result<(), String> {
    fetch_api_models(client, api_token).await.map(|_| ())
}

async fn post_json(
    client: &reqwest::Client,
    url: &str,
    body: &Value,
    session_cookie: Option<&str>,
    user_id: Option<&str>,
) -> Result<(Value, HeaderMap), String> {
    let request = client
        .post(url)
        .header("Accept", "application/json")
        .header("User-Agent", "yuanheng-desktop/0.1")
        .json(body);
    let response = with_session(request, session_cookie, user_id)
        .send()
        .await
        .map_err(|e| format!("连接元衡失败: {e}"))?;
    parse_json_response(response).await
}

async fn delete_json(
    client: &reqwest::Client,
    url: &str,
    session_cookie: &str,
    user_id: &str,
) -> Result<Value, String> {
    let request = client
        .delete(url)
        .header("Accept", "application/json")
        .header("User-Agent", "yuanheng-desktop/0.1");
    let response = with_session(request, Some(session_cookie), Some(user_id))
        .send()
        .await
        .map_err(|e| format!("连接元衡失败: {e}"))?;
    parse_json_response(response).await.map(|(value, _)| value)
}

fn ensure_api_success(value: &Value, fallback: &str) -> Result<(), String> {
    if value.get("success").and_then(Value::as_bool) == Some(true) {
        Ok(())
    } else {
        Err(response_message(value).unwrap_or_else(|| fallback.to_string()))
    }
}

fn extract_cookie(headers: &HeaderMap, cookie_name: &str) -> Option<String> {
    headers
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|header| header.to_str().ok())
        .filter_map(|header| header.split(';').next())
        .filter_map(|pair| {
            let (name, value) = pair.trim().split_once('=')?;
            (name == cookie_name && !value.is_empty()).then(|| format!("{name}={value}"))
        })
        .next_back()
}

fn parse_announcement_response(value: &Value) -> Option<String> {
    value
        .get("data")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|notice| !notice.is_empty())
        .map(str::to_string)
}

async fn fetch_announcement(client: &reqwest::Client) -> Result<Option<String>, String> {
    let value = fetch_json(client, &format!("{BASE_URL}/api/notice"), None, None).await?;
    Ok(parse_announcement_response(&value))
}

fn session_cookie_for_webview(raw: &str) -> Result<Cookie<'static>, String> {
    let (name, value) = raw
        .trim()
        .split_once('=')
        .ok_or_else(|| "元衡登录 Cookie 格式无效，请重新登录".to_string())?;
    if name != "session" || value.is_empty() {
        return Err("元衡登录状态无效，请重新登录".to_string());
    }

    let mut cookie = Cookie::new(name.to_string(), value.to_string());
    cookie.set_domain("cn.meta-api.vip");
    cookie.set_path("/");
    cookie.set_secure(true);
    cookie.set_http_only(true);
    Ok(cookie)
}

fn parse_auth_response(value: &Value) -> Result<(bool, Option<String>), String> {
    ensure_api_success(value, "元衡登录失败")?;
    let data = value
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "元衡登录响应缺少 data".to_string())?;
    let requires_two_factor = data
        .get("require_2fa")
        .or_else(|| data.get("require2fa"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if requires_two_factor {
        return Ok((true, None));
    }
    let user_id = data
        .get("id")
        .and_then(|id| {
            id.as_i64()
                .filter(|id| *id > 0)
                .map(|id| id.to_string())
                .or_else(|| id.as_str().filter(|id| !id.is_empty()).map(str::to_string))
        })
        .ok_or_else(|| "元衡登录响应缺少用户 ID".to_string())?;
    Ok((false, Some(user_id)))
}

fn validate_credentials(username: &str, password: &str) -> Result<(), String> {
    if username.is_empty() || username.chars().count() > 20 || username.contains(['\n', '\r']) {
        return Err("用户名不能为空且不能超过 20 个字符".to_string());
    }
    if !(8..=20).contains(&password.chars().count()) || password.contains(['\n', '\r']) {
        return Err("密码长度必须为 8 到 20 个字符".to_string());
    }
    Ok(())
}

fn device_token_name(device_name: Option<&str>) -> String {
    const PREFIX: &str = "元衡桌面端 - ";
    const MAX_BYTES: usize = 50;
    let device_name = device_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("当前设备");
    let mut name = PREFIX.to_string();
    for character in device_name.chars() {
        if name.len() + character.len_utf8() > MAX_BYTES {
            break;
        }
        name.push(character);
    }
    name
}

fn find_device_token_id(
    value: &Value,
    expected_name: &str,
    expected_group: &str,
    now: i64,
) -> Option<i64> {
    value
        .pointer("/data/items")
        .and_then(Value::as_array)?
        .iter()
        .filter(|item| item.get("name").and_then(Value::as_str) == Some(expected_name))
        .filter(|item| item.get("group").and_then(Value::as_str) == Some(expected_group))
        .filter(|item| item.get("status").and_then(Value::as_i64).unwrap_or(1) == 1)
        .filter(|item| {
            item.get("expired_time")
                .and_then(Value::as_i64)
                .is_none_or(|expired| expired <= 0 || expired > now)
        })
        .filter(|item| {
            item.get("unlimited_quota")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .filter_map(|item| item.get("id").and_then(Value::as_i64))
        .max()
}

fn normalize_api_token(raw: &str) -> Result<String, String> {
    let token = raw.trim();
    if token.is_empty() || token.len() > 4096 || token.contains(['\n', '\r']) {
        return Err("元衡返回了无效的工具凭据".to_string());
    }
    if token.starts_with("sk-") {
        Ok(token.to_string())
    } else {
        Ok(format!("sk-{token}"))
    }
}

fn token_cache_for_stored_group(group: Option<&str>, token: String) -> HashMap<String, String> {
    let mut cache = HashMap::new();
    if let Some(group) = group.map(str::trim).filter(|group| !group.is_empty()) {
        cache.insert(group.to_string(), token);
    }
    cache
}

async fn ensure_device_api_token(
    client: &reqwest::Client,
    session_cookie: &str,
    user_id: &str,
    group: &str,
) -> Result<(String, i64), String> {
    let detected_name = crate::services::sync_protocol::detect_system_device_name();
    let token_name = device_token_name(detected_name.as_deref());
    let list_url = format!("{BASE_URL}/api/token/?p=1&size=100");
    let mut list = fetch_json(client, &list_url, Some(session_cookie), Some(user_id)).await?;
    ensure_api_success(&list, "读取元衡工具凭据失败")?;
    let now = chrono::Utc::now().timestamp();
    let token_id = if let Some(id) = find_device_token_id(&list, &token_name, group, now) {
        id
    } else {
        let (created, _) = post_json(
            client,
            &format!("{BASE_URL}/api/token/"),
            &json!({
                "name": token_name.as_str(),
                "expired_time": -1,
                "remain_quota": 0,
                "unlimited_quota": true,
                "model_limits_enabled": false,
                "group": group
            }),
            Some(session_cookie),
            Some(user_id),
        )
        .await?;
        ensure_api_success(&created, "创建本机工具凭据失败")?;
        list = fetch_json(client, &list_url, Some(session_cookie), Some(user_id)).await?;
        ensure_api_success(&list, "读取新建工具凭据失败")?;
        find_device_token_id(&list, &token_name, group, now)
            .ok_or_else(|| "本机工具凭据已创建，但未能读取凭据编号".to_string())?
    };

    let key_value = fetch_json(
        client,
        &format!("{BASE_URL}/api/token/{token_id}/key"),
        Some(session_cookie),
        Some(user_id),
    )
    .await?;
    ensure_api_success(&key_value, "读取本机工具凭据失败")?;
    let key = key_value
        .pointer("/data/key")
        .and_then(Value::as_str)
        .ok_or_else(|| "元衡工具凭据响应缺少 key".to_string())?;
    Ok((normalize_api_token(key)?, token_id))
}

const REASONING_LEVELS: &[&str] = &[
    "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
];

fn normalize_reasoning_levels(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut levels = Vec::new();
    for value in values {
        let level = value.trim().to_ascii_lowercase();
        if REASONING_LEVELS.contains(&level.as_str()) && !levels.contains(&level) {
            levels.push(level);
        }
    }
    levels
}

fn fallback_reasoning_levels(model: &str) -> Vec<String> {
    let model = model.to_ascii_lowercase();
    if model.contains("claude") {
        return ["low", "medium", "high", "max"]
            .into_iter()
            .map(str::to_string)
            .collect();
    }
    if model.starts_with("gpt-")
        || model.starts_with("o1")
        || model.starts_with("o3")
        || model.starts_with("o4")
        || model.contains("codex")
        || model == "k3"
    {
        return ["low", "medium", "high", "xhigh"]
            .into_iter()
            .map(str::to_string)
            .collect();
    }
    if model.contains("gemini") {
        return ["low", "medium", "high"]
            .into_iter()
            .map(str::to_string)
            .collect();
    }
    Vec::new()
}

fn catalog_reasoning_levels() -> HashMap<String, Vec<String>> {
    let Some(codex_dir) = dirs::home_dir().map(|home| home.join(".codex")) else {
        return HashMap::new();
    };
    let Ok(entries) = std::fs::read_dir(codex_dir) else {
        return HashMap::new();
    };
    let mut paths: Vec<_> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            path.is_file()
                && name.ends_with(".json")
                && ((name.contains("model") && name.contains("catalog"))
                    || name == "models_cache.json")
        })
        .collect();
    paths.sort_by_key(|path| {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if name == "model-catalog.cn-meta-api.json" {
            0
        } else if name == "cc-switch-model-catalog.json" {
            1
        } else if name == "yuanheng-switch-model-catalog.json" {
            2
        } else if name == "models_cache.json" {
            3
        } else {
            4
        }
    });

    let mut result = HashMap::new();
    for path in paths {
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(catalog) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let Some(models) = catalog.get("models").and_then(Value::as_array) else {
            continue;
        };
        for model in models {
            let Some(slug) = model.get("slug").and_then(Value::as_str) else {
                continue;
            };
            let values = model
                .get("supported_reasoning_levels")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    item.get("effort")
                        .and_then(Value::as_str)
                        .or_else(|| item.as_str())
                        .map(str::to_string)
                });
            let levels = normalize_reasoning_levels(values);
            if !levels.is_empty() {
                result.entry(slug.to_ascii_lowercase()).or_insert(levels);
            }
        }
    }
    result
}

fn reasoning_levels_for_models(models: &[String]) -> HashMap<String, Vec<String>> {
    let catalog = catalog_reasoning_levels();
    models
        .iter()
        .filter_map(|model| {
            let levels = catalog
                .get(&model.to_ascii_lowercase())
                .cloned()
                .unwrap_or_else(|| fallback_reasoning_levels(model));
            (!levels.is_empty()).then_some((model.clone(), levels))
        })
        .collect()
}

async fn sync_connection(
    client: &reqwest::Client,
    session_cookie: &str,
    user_id: &str,
) -> Result<YuanhengConnectionStatus, String> {
    let account_value = fetch_json(
        client,
        &format!("{BASE_URL}/api/user/self"),
        Some(session_cookie),
        Some(user_id),
    )
    .await?;
    let account = parse_account(&account_value)?;

    let pricing = fetch_json(
        client,
        &format!("{BASE_URL}/api/pricing"),
        Some(session_cookie),
        Some(user_id),
    )
    .await
    .ok();
    let mut model_names = BTreeSet::new();
    if let Some(pricing) = pricing.as_ref() {
        collect_model_names(pricing, &mut model_names);
    }

    let groups_result = fetch_json(
        client,
        &format!("{BASE_URL}/api/user/self/groups"),
        Some(session_cookie),
        Some(user_id),
    )
    .await
    .and_then(|value| parse_user_groups(&value));
    if let Err(error) = &groups_result {
        log::warn!("元衡账号分组同步失败，使用当前分组回退: {error}");
    }
    let groups = groups_result.unwrap_or_else(|_| {
        vec![YuanhengGroupOption {
            id: account.group.clone(),
            description: "当前账号分组".to_string(),
            ratio: None,
        }]
    });

    match fetch_user_models(client, session_cookie, user_id, None).await {
        Ok(models) if !models.is_empty() => {
            log::info!("已同步元衡账号全部模型: {} 个", models.len());
            model_names = models.into_iter().collect();
        }
        Ok(_) => log::warn!("元衡账号模型目录为空，使用定价目录回退"),
        Err(error) => log::warn!("元衡账号模型同步失败，使用定价目录回退: {error}"),
    }

    let group_model_tasks = groups.iter().map(|group| {
        let group_id = group.id.clone();
        async move {
            let models = fetch_user_models(client, session_cookie, user_id, Some(&group_id)).await;
            (group_id, models)
        }
    });
    let mut model_groups: HashMap<String, Vec<String>> = HashMap::new();
    for (group, models) in futures::future::join_all(group_model_tasks).await {
        let Ok(models) = models else {
            continue;
        };
        for model in models {
            model_names.insert(model.clone());
            model_groups.entry(model).or_default().push(group.clone());
        }
    }
    for groups in model_groups.values_mut() {
        groups.sort();
        groups.dedup();
    }

    let notice = match fetch_announcement(client).await {
        Ok(notice) => notice,
        Err(error) => {
            log::warn!("元衡平台公告同步失败: {error}");
            None
        }
    };

    let models: Vec<String> = model_names.into_iter().collect();
    let reasoning_levels = reasoning_levels_for_models(&models);

    Ok(YuanhengConnectionStatus {
        connected: true,
        base_url: BASE_URL.to_string(),
        user_id: Some(user_id.to_string()),
        account: Some(account),
        models,
        groups,
        model_groups,
        reasoning_levels,
        announcement: notice,
        last_synced_at: Some(chrono::Utc::now().timestamp()),
    })
}

fn persist_connection(
    state: &AppState,
    session_cookie: &str,
    user_id: &str,
    api_token: &str,
    api_token_id: i64,
    status: &YuanhengConnectionStatus,
) -> Result<(), String> {
    let api_token_group = status
        .account
        .as_ref()
        .map(|account| account.group.trim())
        .filter(|group| !group.is_empty())
        .unwrap_or("default");
    for (key, value) in [
        (SESSION_COOKIE_KEY, session_cookie),
        (USER_ID_KEY, user_id),
        (API_TOKEN_KEY, api_token),
        (API_TOKEN_GROUP_KEY, api_token_group),
    ] {
        state
            .db
            .set_setting(key, value)
            .map_err(|e| e.to_string())?;
    }
    state
        .db
        .set_setting(API_TOKEN_ID_KEY, &api_token_id.to_string())
        .map_err(|e| e.to_string())?;
    state
        .db
        .set_setting(
            CACHE_KEY,
            &serde_json::to_string(status).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    for key in [TOKEN_KEY, PENDING_SESSION_COOKIE_KEY] {
        state.db.set_setting(key, "").map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn finish_authenticated_session(
    state: &AppState,
    client: &reqwest::Client,
    session_cookie: &str,
    user_id: &str,
) -> Result<YuanhengConnectionStatus, String> {
    let status = sync_connection(client, session_cookie, user_id).await?;
    let group = status
        .account
        .as_ref()
        .map(|account| account.group.trim())
        .filter(|group| !group.is_empty())
        .unwrap_or("default");
    let (api_token, api_token_id) =
        ensure_device_api_token(client, session_cookie, user_id, group).await?;
    persist_connection(
        state,
        session_cookie,
        user_id,
        &api_token,
        api_token_id,
        &status,
    )?;
    Ok(status)
}

async fn login_with_credentials(
    state: &AppState,
    username: &str,
    password: &str,
) -> Result<YuanhengAuthResult, String> {
    validate_credentials(username, password)?;
    let client = yuanheng_client()?;
    let (value, headers) = post_json(
        &client,
        &format!("{BASE_URL}/api/user/login"),
        &json!({ "username": username, "password": password }),
        None,
        None,
    )
    .await?;
    let (requires_two_factor, user_id) = parse_auth_response(&value)?;
    let session_cookie = extract_cookie(&headers, "session")
        .ok_or_else(|| "元衡登录成功，但未返回有效会话".to_string())?;
    if requires_two_factor {
        state
            .db
            .set_setting(PENDING_SESSION_COOKIE_KEY, &session_cookie)
            .map_err(|e| e.to_string())?;
        return Ok(YuanhengAuthResult {
            requires_two_factor: true,
            connection: None,
        });
    }
    let user_id = user_id.ok_or_else(|| "元衡登录响应缺少用户 ID".to_string())?;
    let status = finish_authenticated_session(state, &client, &session_cookie, &user_id).await?;
    Ok(YuanhengAuthResult {
        requires_two_factor: false,
        connection: Some(status),
    })
}

fn read_cached_status(state: &AppState) -> Result<YuanhengConnectionStatus, String> {
    let session = state
        .db
        .get_setting(SESSION_COOKIE_KEY)
        .map_err(|e| e.to_string())?;
    let token = state
        .db
        .get_setting(API_TOKEN_KEY)
        .map_err(|e| e.to_string())?;
    let user_id = state
        .db
        .get_setting(USER_ID_KEY)
        .map_err(|e| e.to_string())?;
    if [session.as_deref(), token.as_deref(), user_id.as_deref()]
        .into_iter()
        .any(|value| value.unwrap_or_default().is_empty())
    {
        return Ok(YuanhengConnectionStatus::default());
    }
    let cached = state.db.get_setting(CACHE_KEY).map_err(|e| e.to_string())?;
    let mut status: YuanhengConnectionStatus = cached
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default();
    status.connected = true;
    status.base_url = BASE_URL.to_string();
    status.reasoning_levels = reasoning_levels_for_models(&status.models);
    Ok(status)
}

fn recommended_model(app: &AppType, models: &[String]) -> Option<String> {
    let score = |model: &str| {
        let lower = model.to_ascii_lowercase();
        match app {
            AppType::Claude | AppType::ClaudeDesktop => {
                if lower.contains("claude") {
                    120
                } else if ["image", "audio", "ocr", "kolors", "sensevoice", "imagen"]
                    .iter()
                    .any(|keyword| lower.contains(keyword))
                {
                    0
                } else if lower.contains("deepseek-v4-pro") {
                    115
                } else if lower.contains("deepseek") {
                    110
                } else if lower == "k3" || lower.contains("gpt") {
                    105
                } else if ["qwen", "glm", "hunyuan", "grok", "gemini"]
                    .iter()
                    .any(|keyword| lower.contains(keyword))
                {
                    90
                } else {
                    1
                }
            }
            AppType::Gemini => {
                if lower.contains("gemini") {
                    100
                } else {
                    1
                }
            }
            AppType::GrokBuild => {
                if lower.contains("grok") {
                    100
                } else {
                    1
                }
            }
            AppType::Codex => {
                if lower.contains("gpt-5.6") {
                    110
                } else if lower.contains("gpt-5.5") {
                    105
                } else if lower.contains("gpt-5") {
                    100
                } else if lower.contains("codex") {
                    90
                } else {
                    1
                }
            }
            AppType::OpenCode | AppType::OpenClaw | AppType::Hermes => {
                if lower.contains("gpt-5.6") {
                    110
                } else if lower.contains("gpt-5.5") {
                    105
                } else if lower.contains("gpt") {
                    100
                } else if lower.contains("claude") {
                    90
                } else if lower.contains("gemini") {
                    80
                } else {
                    1
                }
            }
        }
    };

    models
        .iter()
        .enumerate()
        .filter_map(|(index, model)| {
            let score = score(model);
            (score > 0).then_some((score, index, model))
        })
        .max_by_key(|(score, index, _)| (*score, std::cmp::Reverse(*index)))
        .map(|(_, _, model)| model.clone())
}

fn toml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn yuanheng_claude_api_format(model: &str) -> &'static str {
    let model = model.to_ascii_lowercase();
    if model.contains("claude") {
        return "anthropic";
    }
    let openai_reasoning_model = model
        .strip_prefix("gpt-")
        .and_then(|rest| rest.chars().next())
        .is_some_and(|version| version.is_ascii_digit() && version >= '5')
        || (model.starts_with('o') && model.as_bytes().get(1).is_some_and(u8::is_ascii_digit));
    if openai_reasoning_model {
        "openai_responses"
    } else {
        "openai_chat"
    }
}

fn provider_meta(app: &AppType, model: &str, reasoning: &str) -> ProviderMeta {
    let claude_api_format = yuanheng_claude_api_format(model);
    let mut meta = ProviderMeta {
        common_config_enabled: Some(true),
        api_format: Some(
            match app {
                AppType::Claude | AppType::ClaudeDesktop => claude_api_format,
                AppType::Codex => claude_api_format,
                AppType::GrokBuild => "openai_responses",
                AppType::Gemini => "gemini_native",
                AppType::OpenCode | AppType::OpenClaw | AppType::Hermes => "openai_chat",
            }
            .to_string(),
        ),
        ..ProviderMeta::default()
    };
    if matches!(app, AppType::Claude | AppType::ClaudeDesktop) {
        meta.api_key_field = Some("ANTHROPIC_AUTH_TOKEN".to_string());
    }
    if matches!(app, AppType::ClaudeDesktop) {
        meta.claude_desktop_mode = Some(ClaudeDesktopMode::Proxy);
        meta.claude_desktop_model_routes.insert(
            "claude-sonnet-5".to_string(),
            ClaudeDesktopModelRoute {
                model: model.to_string(),
                label_override: Some("元衡 AI".to_string()),
                supports_1m: Some(true),
            },
        );
        meta.local_proxy_request_overrides = match reasoning {
            "auto" => None,
            _ if claude_api_format == "anthropic" => Some(LocalProxyRequestOverrides {
                body: Some(json!({ "output_config": { "effort": reasoning } })),
                ..Default::default()
            }),
            _ if claude_api_format == "openai_responses" => Some(LocalProxyRequestOverrides {
                body: Some(json!({ "reasoning": { "effort": reasoning } })),
                ..Default::default()
            }),
            _ => Some(LocalProxyRequestOverrides {
                body: Some(json!({ "reasoning_effort": reasoning })),
                ..Default::default()
            }),
        };
    }
    meta
}

fn managed_provider(
    app: &AppType,
    token: &str,
    model: &str,
    group: &str,
    reasoning: &str,
) -> Result<Provider, String> {
    let settings = match app {
        AppType::Claude | AppType::ClaudeDesktop => json!({
            "env": {
                "ANTHROPIC_BASE_URL": BASE_URL,
                "ANTHROPIC_AUTH_TOKEN": token,
                "ANTHROPIC_API_KEY": "",
                "ANTHROPIC_MODEL": model,
                "ANTHROPIC_DEFAULT_HAIKU_MODEL": model,
                "ANTHROPIC_DEFAULT_SONNET_MODEL": model,
                "ANTHROPIC_DEFAULT_OPUS_MODEL": model
            }
        }),
        AppType::Codex => json!({
            "auth": { "OPENAI_API_KEY": token },
            "config": format!(
                "model_provider = \"yuanheng\"\nmodel = {}\n{}disable_response_storage = true\n\n[model_providers.yuanheng]\nname = \"元衡\"\nbase_url = {}\nwire_api = \"responses\"\nrequires_openai_auth = true\n",
                toml_string(model),
                if reasoning == "auto" {
                    String::new()
                } else {
                    format!("model_reasoning_effort = {}\n", toml_string(reasoning))
                },
                toml_string(OPENAI_BASE_URL)
            ),
            "modelCatalog": {
                "models": [{
                    "model": model,
                    "displayName": model,
                    "contextWindow": 200_000
                }]
            }
        }),
        AppType::Gemini => json!({
            "env": {
                "GEMINI_API_KEY": token,
                "GOOGLE_GEMINI_BASE_URL": BASE_URL,
                "GEMINI_MODEL": model
            }
        }),
        AppType::GrokBuild => json!({
            "config": format!(
                "[models]\ndefault = {}\n\n[model.{}]\nmodel = {}\nbase_url = {}\nname = \"元衡\"\napi_key = {}\napi_backend = \"responses\"\ncontext_window = 400000\n",
                toml_string(model),
                toml_string(model),
                toml_string(model),
                toml_string(OPENAI_BASE_URL),
                toml_string(token)
            )
        }),
        AppType::OpenCode => {
            let mut models = Map::new();
            models.insert(model.to_string(), json!({ "name": model }));
            json!({
                "npm": "@ai-sdk/openai-compatible",
                "name": "元衡",
                "options": {
                    "baseURL": OPENAI_BASE_URL,
                    "apiKey": token,
                    "setCacheKey": true
                },
                "models": models
            })
        }
        AppType::OpenClaw => json!({
            "baseUrl": OPENAI_BASE_URL,
            "apiKey": token,
            "api": "openai-completions",
            "models": [{
                "id": model,
                "name": model,
                "contextWindow": 200000
            }]
        }),
        AppType::Hermes => json!({
            "name": "yuanheng",
            "base_url": OPENAI_BASE_URL,
            "api_key": token,
            "api_mode": "chat_completions",
            "models": [{ "id": model, "name": model }]
        }),
    };

    let mut provider = Provider::with_id(
        MANAGED_PROVIDER_ID.to_string(),
        "元衡".to_string(),
        settings,
        Some(BASE_URL.to_string()),
    );
    provider.category = Some("managed".to_string());
    provider.notes = Some(format!(
        "由元衡桌面端自动维护 | group={group} | reasoning={reasoning}"
    ));
    provider.icon = Some("yuanheng".to_string());
    provider.meta = Some(provider_meta(app, model, reasoning));
    Ok(provider)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum CodexSurface {
    Terminal,
    Desktop,
}

impl CodexSurface {
    fn namespace(self) -> &'static str {
        match self {
            Self::Terminal => AppType::Codex.as_str(),
            Self::Desktop => CHATGPT_DESKTOP_NAMESPACE,
        }
    }

    fn route_prefix(self) -> &'static str {
        match self {
            Self::Terminal => "codex",
            Self::Desktop => CHATGPT_DESKTOP_NAMESPACE,
        }
    }
}

fn codex_terminal_profile_path() -> std::path::PathBuf {
    crate::services::codex_session_bridge::codex_session_profile_path()
}

fn managed_codex_provider_for_namespace(
    state: &AppState,
    namespace: &str,
) -> Result<Option<Provider>, String> {
    state
        .db
        .get_provider_by_id(MANAGED_PROVIDER_ID, namespace)
        .map_err(|error| error.to_string())
}

fn save_managed_codex_provider(
    state: &AppState,
    namespace: &str,
    provider: &Provider,
) -> Result<(), String> {
    state
        .db
        .save_provider(namespace, provider)
        .map_err(|error| error.to_string())?;
    state
        .db
        .set_current_provider(namespace, MANAGED_PROVIDER_ID)
        .map_err(|error| error.to_string())
}

fn combined_codex_catalog_settings(state: &AppState) -> Result<Value, String> {
    let mut models = Vec::new();
    let mut seen = BTreeSet::new();
    for namespace in [AppType::Codex.as_str(), CHATGPT_DESKTOP_NAMESPACE] {
        let Some(provider) = managed_codex_provider_for_namespace(state, namespace)? else {
            continue;
        };
        let entries = provider
            .settings_config
            .pointer("/modelCatalog/models")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for entry in entries {
            let Some(model) = entry.get("model").and_then(Value::as_str) else {
                continue;
            };
            if seen.insert(model.to_string()) {
                models.push(entry);
            }
        }
    }
    Ok(json!({ "modelCatalog": { "models": models } }))
}

fn set_codex_reasoning_field(config_text: &str, reasoning: Option<&str>) -> Result<String, String> {
    let mut document = config_text
        .parse::<DocumentMut>()
        .map_err(|error| format!("解析 Codex 配置失败: {error}"))?;
    if let Some(reasoning) = reasoning {
        document["model_reasoning_effort"] = toml_edit::value(reasoning);
    } else {
        document.as_table_mut().remove("model_reasoning_effort");
    }
    Ok(document.to_string())
}

fn codex_surface_route_config(
    provider: &Provider,
    proxy_base_url: &str,
    catalog_settings: &Value,
    surface: CodexSurface,
) -> Result<String, String> {
    let config_text = provider
        .settings_config
        .get("config")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex 配置缺少 config 字段".to_string())?;
    let config_text =
        crate::codex_config::update_codex_toml_field(config_text, "base_url", proxy_base_url)?;
    let config_text =
        crate::codex_config::update_codex_toml_field(&config_text, "wire_api", "responses")?;
    let placeholder_auth = json!({ "OPENAI_API_KEY": LOCAL_PROXY_TOKEN });
    let config_text =
        crate::codex_config::prepare_codex_provider_live_config(&placeholder_auth, &config_text)
            .map_err(|error| error.to_string())?;
    let configured_reasoning = provider_reasoning(provider).unwrap_or_else(|| "auto".to_string());
    let reasoning_override = match (surface, configured_reasoning.as_str()) {
        (CodexSurface::Terminal, "auto") => Some("medium"),
        (_, "auto") => None,
        (_, level) => Some(level),
    };
    let config_text = set_codex_reasoning_field(&config_text, reasoning_override)?;
    crate::codex_config::prepare_codex_config_text_with_model_catalog(
        catalog_settings,
        &config_text,
        crate::codex_config::CodexCatalogToolProfile::ProxyChat,
    )
    .map_err(|error| error.to_string())
}

async fn write_codex_surface_configs(state: &AppState) -> Result<(), String> {
    let terminal = managed_codex_provider_for_namespace(state, AppType::Codex.as_str())?
        .ok_or_else(|| "Codex 终端配置不存在".to_string())?;
    let desktop = managed_codex_provider_for_namespace(state, CHATGPT_DESKTOP_NAMESPACE)?
        .ok_or_else(|| "ChatGPT Desktop 配置不存在".to_string())?;
    let proxy_status = state.proxy_service.get_status().await?;
    if !proxy_status.running || proxy_status.port == 0 {
        return Err("本地模型路由尚未启动".to_string());
    }
    let proxy_origin = format!("http://127.0.0.1:{}", proxy_status.port);
    let catalog_settings = combined_codex_catalog_settings(state)?;

    let terminal_config = codex_surface_route_config(
        &terminal,
        &format!(
            "{proxy_origin}/{}/v1",
            CodexSurface::Terminal.route_prefix()
        ),
        &catalog_settings,
        CodexSurface::Terminal,
    )?;
    crate::config::write_text_file(&codex_terminal_profile_path(), &terminal_config)
        .map_err(|error| format!("写入 Codex 终端独立配置失败: {error}"))?;

    let desktop_route = codex_surface_route_config(
        &desktop,
        &format!("{proxy_origin}/{}/v1", CodexSurface::Desktop.route_prefix()),
        &catalog_settings,
        CodexSurface::Desktop,
    )?;
    let current_live = crate::codex_config::read_codex_config_text().unwrap_or_default();
    let merged = crate::services::provider::update_toml_common_config_snippet(
        &current_live,
        &desktop_route,
        true,
    )
    .map_err(|error| error.to_string())?;
    let desktop_reasoning = provider_reasoning(&desktop).unwrap_or_else(|| "auto".to_string());
    let merged = if desktop_reasoning == "auto" {
        set_codex_reasoning_field(&merged, None)?
    } else {
        merged
    };
    crate::codex_config::write_codex_live_config_atomic(Some(&merged))
        .map_err(|error| format!("写入 ChatGPT Desktop 独立配置失败: {error}"))
}

fn set_codex_available_models(provider: &mut Provider, selected: &str, models: &[String]) {
    let mut seen = BTreeSet::new();
    let entries = std::iter::once(selected)
        .chain(models.iter().map(String::as_str))
        .map(str::trim)
        .filter(|model| !model.is_empty())
        .filter(|model| seen.insert((*model).to_string()))
        .map(|model| {
            json!({
                "model": model,
                "displayName": model,
                "contextWindow": 200_000
            })
        })
        .collect::<Vec<_>>();
    provider.settings_config["modelCatalog"] = json!({ "models": entries });
}

async fn configure_codex_surface(
    state: &AppState,
    surface: CodexSurface,
    token: &str,
    model: &str,
    available_models: &[String],
    group: &str,
    reasoning: &str,
) -> Result<YuanhengToolConfigureResult, String> {
    // Both surfaces eventually write Codex's live config, so preserve the
    // original provider before either one is configured for the first time.
    remember_tool_state(state, &AppType::Codex)?;

    let mut selected = managed_provider(&AppType::Codex, token, model, group, reasoning)?;
    set_codex_available_models(&mut selected, model, available_models);
    selected.settings_config["yuanhengSurface"] = json!(match surface {
        CodexSurface::Terminal => "terminal",
        CodexSurface::Desktop => "desktop",
    });
    let terminal_before = managed_codex_provider_for_namespace(state, AppType::Codex.as_str())?;
    let desktop_before = managed_codex_provider_for_namespace(state, CHATGPT_DESKTOP_NAMESPACE)?;

    let terminal = if surface == CodexSurface::Terminal {
        selected.clone()
    } else {
        terminal_before
            .clone()
            .or_else(|| desktop_before.clone())
            .unwrap_or_else(|| selected.clone())
    };
    let desktop = if surface == CodexSurface::Desktop {
        selected
    } else {
        desktop_before
            .or_else(|| terminal_before.clone())
            .unwrap_or_else(|| terminal.clone())
    };

    save_managed_codex_provider(state, AppType::Codex.as_str(), &terminal)?;
    save_managed_codex_provider(state, CHATGPT_DESKTOP_NAMESPACE, &desktop)?;
    crate::settings::set_current_provider(&AppType::Codex, Some(MANAGED_PROVIDER_ID))
        .map_err(|error| error.to_string())?;
    write_codex_surface_configs(state).await?;

    Ok(YuanhengToolConfigureResult {
        app: surface.namespace().to_string(),
        configured: true,
        model: Some(model.to_string()),
        warnings: Vec::new(),
        error: None,
    })
}

fn provider_note_value(provider: &Provider, key: &str) -> Option<String> {
    provider
        .notes
        .as_deref()
        .and_then(|notes| {
            notes.split('|').find_map(|part| {
                let (name, value) = part.trim().split_once('=')?;
                (name.trim() == key).then_some(value)
            })
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn provider_group(provider: &Provider) -> Option<String> {
    provider_note_value(provider, "group")
}

fn provider_reasoning(provider: &Provider) -> Option<String> {
    provider_note_value(provider, "reasoning").or_else(|| Some("auto".to_string()))
}

fn provider_schema_current(provider: &Provider, app: &AppType) -> bool {
    match app {
        AppType::ClaudeDesktop => {
            let Some(model) = provider_model(provider, app) else {
                return false;
            };
            let Some(meta) = provider.meta.as_ref() else {
                return false;
            };
            meta.api_format.as_deref() == Some(yuanheng_claude_api_format(&model))
                && meta
                    .claude_desktop_model_routes
                    .get("claude-sonnet-5")
                    .and_then(|route| route.label_override.as_deref())
                    == Some("元衡 AI")
        }
        AppType::Codex => {
            let Some(model) = provider_model(provider, app) else {
                return false;
            };
            let api_format_current = provider
                .meta
                .as_ref()
                .and_then(|meta| meta.api_format.as_deref())
                == Some(yuanheng_claude_api_format(&model));
            let catalog_has_model = provider
                .settings_config
                .pointer("/modelCatalog/models")
                .and_then(Value::as_array)
                .is_some_and(|models| {
                    models.iter().any(|item| {
                        item.get("model").and_then(Value::as_str) == Some(model.as_str())
                    })
                });
            api_format_current && catalog_has_model
        }
        _ => true,
    }
}

fn codex_catalog_covers_available_models(provider: &Provider, models: &[String]) -> bool {
    let configured = provider
        .settings_config
        .pointer("/modelCatalog/models")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("model").and_then(Value::as_str))
                .collect::<BTreeSet<_>>()
        })
        .unwrap_or_default();
    !models.is_empty()
        && models
            .iter()
            .all(|model| configured.contains(model.as_str()))
}

fn codex_surface_matches(provider: &Provider, surface: CodexSurface) -> bool {
    provider
        .settings_config
        .get("yuanhengSurface")
        .and_then(Value::as_str)
        == Some(match surface {
            CodexSurface::Terminal => "terminal",
            CodexSurface::Desktop => "desktop",
        })
}

fn provider_has_credentials(provider: &Provider, app: &AppType) -> bool {
    let settings = &provider.settings_config;
    let non_empty = |pointer: &str| {
        settings
            .pointer(pointer)
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
    };
    let serialized = settings.to_string();
    let has_base_url = serialized.contains(BASE_URL);
    let has_token = match app {
        AppType::Claude | AppType::ClaudeDesktop => non_empty("/env/ANTHROPIC_AUTH_TOKEN"),
        AppType::Codex => non_empty("/auth/OPENAI_API_KEY"),
        AppType::Gemini => non_empty("/env/GEMINI_API_KEY"),
        AppType::GrokBuild => {
            settings
                .get("config")
                .and_then(Value::as_str)
                .is_some_and(|config| {
                    config.contains("api_key = \"") && !config.contains("api_key = \"\"")
                })
        }
        AppType::OpenCode => non_empty("/options/apiKey"),
        AppType::OpenClaw => non_empty("/apiKey"),
        AppType::Hermes => non_empty("/api_key"),
    };
    has_base_url && has_token
}

fn provider_model(provider: &Provider, app: &AppType) -> Option<String> {
    let settings = &provider.settings_config;
    match app {
        AppType::Claude | AppType::ClaudeDesktop => settings
            .pointer("/env/ANTHROPIC_MODEL")
            .and_then(Value::as_str)
            .map(str::to_string),
        AppType::Codex => settings
            .get("config")
            .and_then(Value::as_str)
            .and_then(|config| config.parse::<toml::Value>().ok())
            .and_then(|config| {
                config
                    .get("model")
                    .and_then(toml::Value::as_str)
                    .map(str::to_string)
            }),
        AppType::Gemini => settings
            .pointer("/env/GEMINI_MODEL")
            .and_then(Value::as_str)
            .map(str::to_string),
        AppType::GrokBuild => settings
            .get("config")
            .and_then(Value::as_str)
            .and_then(crate::grok_config::extract_model_config)
            .map(|config| config.model),
        AppType::OpenCode => settings
            .get("models")
            .and_then(Value::as_object)
            .and_then(|models| models.keys().next().cloned()),
        AppType::OpenClaw | AppType::Hermes => settings
            .get("models")
            .and_then(Value::as_array)
            .and_then(|models| models.first())
            .and_then(|model| model.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

#[cfg(target_os = "macos")]
fn format_download_size(bytes: u64) -> String {
    const MIB: f64 = 1024.0 * 1024.0;
    if bytes < 1024 * 1024 {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / MIB)
    }
}

#[cfg(target_os = "macos")]
fn claude_desktop_runtime_status_from(
    application_support: &std::path::Path,
    now: SystemTime,
) -> Option<YuanhengRuntimeStatus> {
    let mut newest_partial: Option<(u64, SystemTime)> = None;

    for data_dir in ["Claude-3p", "Claude"] {
        let versions_dir = application_support.join(data_dir).join("claude-code");
        let Ok(versions) = std::fs::read_dir(versions_dir) else {
            continue;
        };
        for version in versions.flatten() {
            let version_path = version.path();
            if version_path.join(".verified").is_file() {
                continue;
            }
            let Ok(entries) = std::fs::read_dir(&version_path) else {
                continue;
            };
            for entry in entries.flatten() {
                if !entry.file_name().to_string_lossy().ends_with(".partial") {
                    continue;
                }
                let Ok(metadata) = entry.metadata() else {
                    continue;
                };
                let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
                if newest_partial
                    .as_ref()
                    .is_none_or(|(_, current)| modified > *current)
                {
                    newest_partial = Some((metadata.len(), modified));
                }
            }
        }
    }

    let (downloaded_bytes, modified) = newest_partial?;
    let is_active = now.duration_since(modified).unwrap_or_default() <= Duration::from_secs(120);
    let size = format_download_size(downloaded_bytes);
    let (state, title, message) = if is_active {
        (
            "downloading",
            "Claude 组件正在下载",
            format!("已下载 {size}。请保持 Claude Desktop 打开，元衡每 30 秒自动检测一次。"),
        )
    } else {
        (
            "stalled",
            "Claude 组件下载已停滞",
            format!("当前已下载 {size}。若 Claude Desktop 已打开，请完全退出后重新打开；如仍无变化，请检查网络能否访问 downloads.claude.ai。"),
        )
    };

    Some(YuanhengRuntimeStatus {
        state: state.to_string(),
        title: title.to_string(),
        message,
        downloaded_bytes,
        updated_at: modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
    })
}

#[cfg(target_os = "macos")]
fn claude_desktop_runtime_status() -> Option<YuanhengRuntimeStatus> {
    let application_support = dirs::home_dir()?
        .join("Library")
        .join("Application Support");
    claude_desktop_runtime_status_from(&application_support, SystemTime::now())
}

#[cfg(not(target_os = "macos"))]
fn claude_desktop_runtime_status() -> Option<YuanhengRuntimeStatus> {
    None
}

fn tool_status(state: &AppState, app: AppType, models: &[String]) -> YuanhengToolStatus {
    let recommended = recommended_model(&app, models);
    let provider = ProviderService::list(state, app.clone())
        .ok()
        .and_then(|providers| providers.get(MANAGED_PROVIDER_ID).cloned());
    let live_selected = app.is_additive_mode()
        || ProviderService::current(state, app.clone())
            .map(|current| current == MANAGED_PROVIDER_ID)
            .unwrap_or(false);
    let credentials_current = provider
        .as_ref()
        .is_some_and(|item| provider_has_credentials(item, &app));
    let provider_schema_current = provider.as_ref().is_some_and(|item| {
        provider_schema_current(item, &app)
            && (!matches!(app, AppType::Codex)
                || (codex_catalog_covers_available_models(item, models)
                    && codex_surface_matches(item, CodexSurface::Terminal)))
    });
    let surface_config_current = !matches!(app, AppType::Codex)
        || std::fs::read_to_string(codex_terminal_profile_path())
            .ok()
            .is_some_and(|config| config.contains("/codex/v1"));
    let schema_current = provider_schema_current && surface_config_current;
    let needs_update =
        provider.is_some() && (!live_selected || !credentials_current || !schema_current);
    let configured = provider.is_some() && !needs_update;
    let model = provider
        .as_ref()
        .and_then(|item| provider_model(item, &app));
    let group = provider.as_ref().and_then(provider_group);
    let reasoning = provider.as_ref().and_then(provider_reasoning);
    let supported = recommended.is_some();
    let message = if !supported {
        Some(
            match app {
                AppType::ClaudeDesktop => "账号中暂时没有适合 Claude Desktop 的文本模型",
                _ => "账号中暂时没有可用模型",
            }
            .to_string(),
        )
    } else if configured {
        Some("元衡配置已写入".to_string())
    } else if needs_update {
        Some("账号或模型已变化，需要重新配置".to_string())
    } else {
        None
    };
    let runtime_status = matches!(app, AppType::ClaudeDesktop)
        .then(claude_desktop_runtime_status)
        .flatten();
    YuanhengToolStatus {
        app: app.as_str().to_string(),
        supported,
        configured,
        needs_update,
        model,
        group,
        reasoning,
        recommended_model: recommended,
        message,
        runtime_warning: runtime_status.as_ref().map(|status| status.message.clone()),
        runtime_status,
    }
}

fn workbuddy_config_path() -> std::path::PathBuf {
    crate::config::get_home_dir()
        .join(".workbuddy")
        .join("models.json")
}

fn read_workbuddy_config() -> Option<Value> {
    let content = std::fs::read_to_string(workbuddy_config_path()).ok()?;
    serde_json::from_str(&content).ok()
}

fn workbuddy_config_matches(value: &Value, model: &str) -> bool {
    let Some(item) = value
        .get("models")
        .and_then(Value::as_array)
        .and_then(|models| models.first())
    else {
        return false;
    };
    let expected_url = format!("{OPENAI_BASE_URL}/chat/completions");
    item.get("id").and_then(Value::as_str) == Some(model)
        && item.get("url").and_then(Value::as_str) == Some(expected_url.as_str())
        && item
            .get("apiKey")
            .and_then(Value::as_str)
            .is_some_and(|token| !token.trim().is_empty())
        && value
            .get("availableModels")
            .and_then(Value::as_array)
            .is_some_and(|models| models.iter().any(|item| item.as_str() == Some(model)))
}

fn workbuddy_status(state: &AppState, models: &[String]) -> YuanhengToolStatus {
    let recommended = recommended_model(&AppType::OpenCode, models);
    let stored_model = state
        .db
        .get_setting(WORKBUDDY_MODEL_KEY)
        .ok()
        .flatten()
        .filter(|model| !model.is_empty());
    let stored_group = state
        .db
        .get_setting(WORKBUDDY_GROUP_KEY)
        .ok()
        .flatten()
        .filter(|group| !group.is_empty());
    let was_managed = state
        .db
        .get_setting(PREVIOUS_WORKBUDDY_CONFIG_KEY)
        .ok()
        .flatten()
        .is_some_and(|value| !value.is_empty());
    let configured = was_managed
        && stored_model.as_deref().is_some_and(|model| {
            models.iter().any(|item| item == model)
                && read_workbuddy_config()
                    .as_ref()
                    .is_some_and(|value| workbuddy_config_matches(value, model))
        });
    let supported = recommended.is_some();
    YuanhengToolStatus {
        app: "workbuddy".to_string(),
        supported,
        configured,
        needs_update: was_managed && !configured,
        model: stored_model,
        group: stored_group,
        reasoning: Some("auto".to_string()),
        recommended_model: recommended,
        message: if !supported {
            Some("账号中暂时没有可用于 WorkBuddy 的文本模型".to_string())
        } else if configured {
            Some("WorkBuddy 自定义模型已写入".to_string())
        } else if was_managed {
            Some("WorkBuddy 配置已变化，需要重新配置".to_string())
        } else {
            None
        },
        runtime_warning: None,
        runtime_status: None,
    }
}

fn chatgpt_desktop_status(state: &AppState, models: &[String]) -> YuanhengToolStatus {
    let stored = managed_codex_provider_for_namespace(state, CHATGPT_DESKTOP_NAMESPACE)
        .ok()
        .flatten();
    let legacy = managed_codex_provider_for_namespace(state, AppType::Codex.as_str())
        .ok()
        .flatten();
    let display_provider = stored.as_ref().or(legacy.as_ref());
    let route_current = crate::codex_config::read_codex_config_text()
        .ok()
        .and_then(|config| crate::codex_config::extract_codex_base_url(&config))
        .is_some_and(|url| url.contains("/chatgpt-desktop/v1"));
    let schema_current = stored.as_ref().is_some_and(|provider| {
        provider_schema_current(provider, &AppType::Codex)
            && codex_catalog_covers_available_models(provider, models)
            && codex_surface_matches(provider, CodexSurface::Desktop)
    });
    let configured = stored.is_some() && schema_current && route_current;
    let needs_update = display_provider.is_some() && !configured;
    let recommended = recommended_model(&AppType::Codex, models);
    YuanhengToolStatus {
        app: CHATGPT_DESKTOP_NAMESPACE.to_string(),
        supported: recommended.is_some(),
        configured,
        needs_update,
        model: display_provider.and_then(|provider| provider_model(provider, &AppType::Codex)),
        group: display_provider.and_then(provider_group),
        reasoning: display_provider.and_then(provider_reasoning),
        recommended_model: recommended,
        message: if configured {
            Some("ChatGPT Desktop 独立模型配置已写入".to_string())
        } else if needs_update {
            Some("需要迁移为独立桌面配置".to_string())
        } else {
            None
        },
        runtime_warning: None,
        runtime_status: None,
    }
}

fn all_tool_statuses(
    state: &AppState,
    connection: &YuanhengConnectionStatus,
) -> Vec<YuanhengToolStatus> {
    let mut statuses = AppType::all()
        .map(|app| tool_status(state, app, &connection.models))
        .collect::<Vec<_>>();
    statuses.push(chatgpt_desktop_status(state, &connection.models));
    statuses.push(workbuddy_status(state, &connection.models));
    statuses
}

fn previous_provider_key(app: &AppType) -> String {
    format!("{PREVIOUS_PROVIDER_KEY_PREFIX}{}", app.as_str())
}

fn remember_tool_state(state: &AppState, app: &AppType) -> Result<(), String> {
    if matches!(app, AppType::Hermes) {
        let existing = state
            .db
            .get_setting(PREVIOUS_HERMES_MODEL_KEY)
            .map_err(|e| e.to_string())?;
        if existing.as_deref().unwrap_or_default().is_empty() {
            let model = crate::hermes_config::get_model_config().map_err(|e| e.to_string())?;
            let serialized = model
                .map(|value| serde_json::to_string(&value).map_err(|e| e.to_string()))
                .transpose()?
                .unwrap_or_else(|| NO_PREVIOUS_VALUE.to_string());
            state
                .db
                .set_setting(PREVIOUS_HERMES_MODEL_KEY, &serialized)
                .map_err(|e| e.to_string())?;
        }
    }

    if app.is_additive_mode() {
        return Ok(());
    }

    let key = previous_provider_key(app);
    let existing = state.db.get_setting(&key).map_err(|e| e.to_string())?;
    if !existing.as_deref().unwrap_or_default().is_empty() {
        return Ok(());
    }
    let current = ProviderService::current(state, app.clone()).map_err(|e| e.to_string())?;
    let previous = if current.is_empty() || current == MANAGED_PROVIDER_ID {
        NO_PREVIOUS_VALUE
    } else {
        current.as_str()
    };
    state
        .db
        .set_setting(&key, previous)
        .map_err(|e| e.to_string())
}

fn remember_workbuddy_state(state: &AppState) -> Result<(), String> {
    let existing = state
        .db
        .get_setting(PREVIOUS_WORKBUDDY_CONFIG_KEY)
        .map_err(|e| e.to_string())?;
    if existing.as_deref().is_some_and(|value| !value.is_empty()) {
        return Ok(());
    }
    let previous = match std::fs::read_to_string(workbuddy_config_path()) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => NO_PREVIOUS_VALUE.to_string(),
        Err(error) => return Err(format!("备份 WorkBuddy 配置失败: {error}")),
    };
    state
        .db
        .set_setting(PREVIOUS_WORKBUDDY_CONFIG_KEY, &previous)
        .map_err(|e| e.to_string())
}

#[cfg(unix)]
fn protect_workbuddy_config() -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(
        workbuddy_config_path(),
        std::fs::Permissions::from_mode(0o600),
    )
    .map_err(|error| format!("设置 WorkBuddy 配置权限失败: {error}"))
}

#[cfg(not(unix))]
fn protect_workbuddy_config() -> Result<(), String> {
    Ok(())
}

fn configure_workbuddy(
    state: &AppState,
    token: &str,
    model: &str,
    group: &str,
) -> Result<YuanhengToolConfigureResult, String> {
    remember_workbuddy_state(state)?;
    let config = json!({
        "models": [{
            "id": model,
            "name": model,
            "vendor": "元衡",
            "url": format!("{OPENAI_BASE_URL}/chat/completions"),
            "apiKey": token,
            "maxInputTokens": 200000,
            "maxOutputTokens": 8192,
            "supportsToolCall": true,
            "supportsImages": true
        }],
        "availableModels": [model]
    });
    crate::config::write_json_file(&workbuddy_config_path(), &config)
        .map_err(|error| format!("写入 WorkBuddy 配置失败: {error}"))?;
    protect_workbuddy_config()?;
    state
        .db
        .set_setting(WORKBUDDY_MODEL_KEY, model)
        .map_err(|e| e.to_string())?;
    state
        .db
        .set_setting(WORKBUDDY_GROUP_KEY, group)
        .map_err(|e| e.to_string())?;
    Ok(YuanhengToolConfigureResult {
        app: "workbuddy".to_string(),
        configured: true,
        model: Some(model.to_string()),
        warnings: Vec::new(),
        error: None,
    })
}

fn restore_workbuddy_config(state: &AppState) -> Result<Option<bool>, String> {
    let previous = state
        .db
        .get_setting(PREVIOUS_WORKBUDDY_CONFIG_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    if previous.is_empty() {
        return Ok(None);
    }
    let stored_model = state
        .db
        .get_setting(WORKBUDDY_MODEL_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let current_is_managed = !stored_model.is_empty()
        && read_workbuddy_config()
            .as_ref()
            .is_some_and(|value| workbuddy_config_matches(value, &stored_model));
    if !current_is_managed {
        return Err("WorkBuddy 配置已被外部修改，元衡未覆盖当前文件".to_string());
    }

    let restored = if previous == NO_PREVIOUS_VALUE {
        match std::fs::remove_file(workbuddy_config_path()) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("移除 WorkBuddy 元衡配置失败: {error}")),
        }
        false
    } else {
        crate::config::write_text_file(&workbuddy_config_path(), &previous)
            .map_err(|error| format!("恢复 WorkBuddy 配置失败: {error}"))?;
        protect_workbuddy_config()?;
        true
    };
    for key in [
        PREVIOUS_WORKBUDDY_CONFIG_KEY,
        WORKBUDDY_MODEL_KEY,
        WORKBUDDY_GROUP_KEY,
    ] {
        state.db.set_setting(key, "").map_err(|e| e.to_string())?;
    }
    Ok(Some(restored))
}

fn restore_hermes_model(state: &AppState) -> Result<(), String> {
    let stored = state
        .db
        .get_setting(PREVIOUS_HERMES_MODEL_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    if stored.is_empty() {
        let mut current = crate::hermes_config::get_model_config()
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        if current.provider.as_deref() == Some(MANAGED_PROVIDER_ID) {
            current.provider = None;
            current.default = None;
            crate::hermes_config::set_model_config(&current).map_err(|e| e.to_string())?;
        }
    } else if stored == NO_PREVIOUS_VALUE {
        crate::hermes_config::set_model_config(&Default::default()).map_err(|e| e.to_string())?;
    } else {
        let previous = serde_json::from_str(&stored).map_err(|e| e.to_string())?;
        crate::hermes_config::set_model_config(&previous).map_err(|e| e.to_string())?;
    }
    state
        .db
        .set_setting(PREVIOUS_HERMES_MODEL_KEY, "")
        .map_err(|e| e.to_string())
}

fn remove_managed_tool(state: &AppState, app: AppType) -> Result<Option<bool>, String> {
    let providers = ProviderService::list(state, app.clone()).map_err(|e| e.to_string())?;
    if !providers.contains_key(MANAGED_PROVIDER_ID) {
        return Ok(None);
    }

    if app.is_additive_mode() {
        ProviderService::delete(state, app.clone(), MANAGED_PROVIDER_ID)
            .map_err(|e| e.to_string())?;
        if matches!(app, AppType::Hermes) {
            restore_hermes_model(state)?;
        }
        return Ok(Some(false));
    }

    let current = ProviderService::current(state, app.clone()).map_err(|e| e.to_string())?;
    if current != MANAGED_PROVIDER_ID {
        ProviderService::delete(state, app.clone(), MANAGED_PROVIDER_ID)
            .map_err(|e| e.to_string())?;
        state
            .db
            .set_setting(&previous_provider_key(&app), "")
            .map_err(|e| e.to_string())?;
        return Ok(Some(false));
    }

    let previous = state
        .db
        .get_setting(&previous_provider_key(&app))
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    if previous.is_empty() || previous == NO_PREVIOUS_VALUE || !providers.contains_key(&previous) {
        return Err("没有可安全恢复的原配置，元衡配置已保留".to_string());
    }

    ProviderService::switch(state, app.clone(), &previous).map_err(|e| e.to_string())?;
    ProviderService::delete(state, app.clone(), MANAGED_PROVIDER_ID).map_err(|e| e.to_string())?;
    state
        .db
        .set_setting(&previous_provider_key(&app), "")
        .map_err(|e| e.to_string())?;
    Ok(Some(true))
}

fn remove_codex_surface_artifacts(state: &AppState) -> Result<bool, String> {
    let desktop_provider = managed_codex_provider_for_namespace(state, CHATGPT_DESKTOP_NAMESPACE)?;
    let profile_path = codex_terminal_profile_path();
    let profile_should_remove = match std::fs::read_to_string(&profile_path) {
        Ok(content)
            if content.contains("model_provider = \"yuanheng\"")
                && content.contains("/codex/v1") =>
        {
            true
        }
        Ok(_) => {
            return Err("Codex 终端独立配置已被外部修改，元衡未删除该文件".to_string());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(format!("读取 Codex 终端独立配置失败: {error}")),
    };

    if desktop_provider.is_some() {
        state
            .db
            .delete_provider(CHATGPT_DESKTOP_NAMESPACE, MANAGED_PROVIDER_ID)
            .map_err(|error| error.to_string())?;
    }
    if profile_should_remove {
        std::fs::remove_file(&profile_path)
            .map_err(|error| format!("移除 Codex 终端独立配置失败: {error}"))?;
    }

    Ok(desktop_provider.is_some() || profile_should_remove)
}

fn disconnect_yuanheng_inner(state: &AppState) -> Result<YuanhengDisconnectResult, String> {
    let mut result = YuanhengDisconnectResult {
        disconnected: true,
        ..Default::default()
    };
    let mut codex_restored = false;
    for app in AppType::all() {
        match remove_managed_tool(state, app.clone()) {
            Ok(Some(true)) => {
                codex_restored |= matches!(app, AppType::Codex);
                result.restored_tools.push(app.as_str().to_string());
            }
            Ok(Some(false)) => {
                codex_restored |= matches!(app, AppType::Codex);
                result.removed_tools.push(app.as_str().to_string());
            }
            Ok(None) => {}
            Err(error) => {
                result.retained_tools.push(app.as_str().to_string());
                result.warnings.push(format!("{}: {error}", app.as_str()));
            }
        }
    }
    if codex_restored {
        match remove_codex_surface_artifacts(state) {
            Ok(true) => result
                .removed_tools
                .push(CHATGPT_DESKTOP_NAMESPACE.to_string()),
            Ok(false) => {}
            Err(error) => {
                result
                    .retained_tools
                    .push(CHATGPT_DESKTOP_NAMESPACE.to_string());
                result
                    .warnings
                    .push(format!("{CHATGPT_DESKTOP_NAMESPACE}: {error}"));
            }
        }
    }
    match restore_workbuddy_config(state) {
        Ok(Some(true)) => result.restored_tools.push("workbuddy".to_string()),
        Ok(Some(false)) => result.removed_tools.push("workbuddy".to_string()),
        Ok(None) => {}
        Err(error) => {
            result.retained_tools.push("workbuddy".to_string());
            result.warnings.push(format!("workbuddy: {error}"));
        }
    }
    for key in [
        TOKEN_KEY,
        USER_ID_KEY,
        SESSION_COOKIE_KEY,
        PENDING_SESSION_COOKIE_KEY,
        API_TOKEN_KEY,
        API_TOKEN_ID_KEY,
        API_TOKEN_GROUP_KEY,
        CACHE_KEY,
    ] {
        state.db.set_setting(key, "").map_err(|e| e.to_string())?;
    }
    Ok(result)
}

fn resolve_tool_model(
    app: AppType,
    models: &[String],
    requested_model: Option<&str>,
) -> Result<String, String> {
    if let Some(model) = requested_model
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if !models.iter().any(|item| item == model) {
            return Err(format!("模型 {model} 不在当前账号目录中"));
        }
        Ok(model.to_string())
    } else {
        recommended_model(&app, models).ok_or_else(|| "当前账号没有兼容模型".to_string())
    }
}

fn preferred_group_for_model(
    connection: &YuanhengConnectionStatus,
    model: &str,
    requested_group: Option<&str>,
) -> Result<String, String> {
    let available = connection
        .model_groups
        .get(model)
        .cloned()
        .unwrap_or_default();
    if available.is_empty() {
        if let Some(group) = requested_group
            .map(str::trim)
            .filter(|group| !group.is_empty())
        {
            return Ok(group.to_string());
        }
        return connection
            .account
            .as_ref()
            .map(|account| account.group.clone())
            .filter(|group| !group.is_empty())
            .ok_or_else(|| format!("模型 {model} 当前没有可用令牌分组"));
    }
    if let Some(group) = requested_group
        .map(str::trim)
        .filter(|group| !group.is_empty())
    {
        if available.iter().any(|item| item == group) {
            return Ok(group.to_string());
        }
        return Err(format!("模型 {model} 不支持分组 {group}"));
    }
    if available.iter().any(|group| group == "auto") {
        return Ok("auto".to_string());
    }
    if let Some(account_group) = connection.account.as_ref().map(|account| &account.group) {
        if available.iter().any(|group| group == account_group) {
            return Ok(account_group.clone());
        }
    }
    connection
        .groups
        .iter()
        .filter(|group| available.iter().any(|item| item == &group.id))
        .min_by(|left, right| {
            left.ratio
                .unwrap_or(f64::INFINITY)
                .partial_cmp(&right.ratio.unwrap_or(f64::INFINITY))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|group| group.id.clone())
        .ok_or_else(|| format!("模型 {model} 当前没有可用令牌分组"))
}

fn resolve_reasoning_level(
    requested: Option<&str>,
    model: &str,
    supported: &HashMap<String, Vec<String>>,
) -> Result<String, String> {
    let level = requested
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("auto");
    if level == "auto" {
        return Ok(level.to_string());
    }
    if !REASONING_LEVELS.contains(&level) {
        return Err(format!("不支持的推理等级: {level}"));
    }
    let fallback;
    let levels = if let Some(levels) = supported.get(model) {
        levels
    } else {
        fallback = fallback_reasoning_levels(model);
        &fallback
    };
    if levels.iter().any(|item| item == level) {
        Ok(level.to_string())
    } else if levels.is_empty() {
        Err(format!("模型 {model} 未声明可调推理等级，请使用自动"))
    } else {
        Err(format!(
            "模型 {model} 不支持 {level}，可选：{}",
            levels.join("、")
        ))
    }
}

fn configure_tool(
    state: &AppState,
    app: AppType,
    token: &str,
    models: &[String],
    requested_model: Option<&str>,
    group: &str,
    reasoning: &str,
) -> Result<YuanhengToolConfigureResult, String> {
    let model = resolve_tool_model(app.clone(), models, requested_model)?;
    remember_tool_state(state, &app)?;
    let provider = managed_provider(&app, token, &model, group, reasoning)?;
    let exists = ProviderService::list(state, app.clone())
        .map_err(|e| e.to_string())?
        .contains_key(MANAGED_PROVIDER_ID);
    if exists {
        ProviderService::update(state, app.clone(), None, provider).map_err(|e| e.to_string())?;
    } else {
        ProviderService::add(state, app.clone(), provider, true).map_err(|e| e.to_string())?;
    }
    let switch_result = ProviderService::switch(state, app.clone(), MANAGED_PROVIDER_ID)
        .map_err(|e| e.to_string())?;
    Ok(YuanhengToolConfigureResult {
        app: app.as_str().to_string(),
        configured: true,
        model: Some(model),
        warnings: switch_result.warnings,
        error: None,
    })
}

#[tauri::command]
pub fn get_yuanheng_connection(
    state: State<'_, AppState>,
) -> Result<YuanhengConnectionStatus, String> {
    read_cached_status(&state)
}

#[tauri::command]
pub async fn get_yuanheng_announcement() -> Result<Option<String>, String> {
    fetch_announcement(&yuanheng_client()?).await
}

#[tauri::command]
pub fn get_yuanheng_tool_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<YuanhengToolStatus>, String> {
    let connection = read_cached_status(&state)?;
    Ok(all_tool_statuses(&state, &connection))
}

async fn diagnose_yuanheng_inner(state: &AppState) -> Result<YuanhengDiagnosticReport, String> {
    let connection = read_cached_status(state)?;
    let mut checks = Vec::new();

    if !connection.connected {
        checks.push(YuanhengDiagnosticCheck {
            id: "connection".to_string(),
            status: "error".to_string(),
            title: "尚未连接元衡".to_string(),
            message: "登录后会自动创建本机凭据并检查工具配置。".to_string(),
            action: Some("login".to_string()),
        });
        return Ok(YuanhengDiagnosticReport {
            status: "error".to_string(),
            checked_at: chrono::Utc::now().timestamp(),
            ready_tools: 0,
            attention_tools: Vec::new(),
            checks,
        });
    }

    let session_cookie = state
        .db
        .get_setting(SESSION_COOKIE_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let user_id = state
        .db
        .get_setting(USER_ID_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let api_token = state
        .db
        .get_setting(API_TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let client = yuanheng_client()?;

    if session_cookie.is_empty() || user_id.is_empty() {
        checks.push(YuanhengDiagnosticCheck {
            id: "session".to_string(),
            status: "error".to_string(),
            title: "登录状态不完整".to_string(),
            message: "请重新登录元衡账号。".to_string(),
            action: Some("login".to_string()),
        });
    } else {
        let account_url = format!("{BASE_URL}/api/user/self");
        match fetch_json(&client, &account_url, Some(&session_cookie), Some(&user_id)).await {
            Ok(value) if parse_account(&value).is_ok() => checks.push(YuanhengDiagnosticCheck {
                id: "session".to_string(),
                status: "ok".to_string(),
                title: "账号连接正常".to_string(),
                message: "登录状态有效。".to_string(),
                action: None,
            }),
            _ => checks.push(YuanhengDiagnosticCheck {
                id: "session".to_string(),
                status: "error".to_string(),
                title: "登录状态已失效".to_string(),
                message: "请退出后重新登录元衡账号。".to_string(),
                action: Some("login".to_string()),
            }),
        }
    }

    if api_token.is_empty() {
        checks.push(YuanhengDiagnosticCheck {
            id: "credential".to_string(),
            status: "error".to_string(),
            title: "本机凭据缺失".to_string(),
            message: "可以自动重新创建本机工具凭据。".to_string(),
            action: Some("repair_credentials".to_string()),
        });
    } else {
        match verify_api_token(&client, &api_token).await {
            Ok(()) => checks.push(YuanhengDiagnosticCheck {
                id: "credential".to_string(),
                status: "ok".to_string(),
                title: "API 连接正常".to_string(),
                message: "本机凭据可访问模型接口。".to_string(),
                action: None,
            }),
            Err(_) => checks.push(YuanhengDiagnosticCheck {
                id: "credential".to_string(),
                status: "error".to_string(),
                title: "本机凭据已失效".to_string(),
                message: "可以自动重新同步本机工具凭据。".to_string(),
                action: Some("repair_credentials".to_string()),
            }),
        }
    }

    let tool_statuses = all_tool_statuses(state, &connection);
    let ready_tools = tool_statuses.iter().filter(|item| item.configured).count();
    let attention_tools: Vec<String> = tool_statuses
        .iter()
        .filter(|item| item.needs_update)
        .map(|item| item.app.clone())
        .collect();
    if !attention_tools.is_empty() {
        checks.push(YuanhengDiagnosticCheck {
            id: "tools".to_string(),
            status: "warning".to_string(),
            title: "部分工具配置需要恢复".to_string(),
            message: format!("检测到 {} 个工具配置发生变化。", attention_tools.len()),
            action: Some("repair_tools".to_string()),
        });
    } else if ready_tools > 0 {
        checks.push(YuanhengDiagnosticCheck {
            id: "tools".to_string(),
            status: "ok".to_string(),
            title: "工具配置正常".to_string(),
            message: format!("{ready_tools} 个工具已经就绪。"),
            action: None,
        });
    } else {
        checks.push(YuanhengDiagnosticCheck {
            id: "tools".to_string(),
            status: "warning".to_string(),
            title: "尚未配置 AI 工具".to_string(),
            message: "选择本机已安装的工具后即可一键配置。".to_string(),
            action: Some("configure_tools".to_string()),
        });
    }

    let status = if checks.iter().any(|item| item.status == "error") {
        "error"
    } else if checks.iter().any(|item| item.status == "warning") {
        "warning"
    } else {
        "ok"
    };
    Ok(YuanhengDiagnosticReport {
        status: status.to_string(),
        checked_at: chrono::Utc::now().timestamp(),
        ready_tools,
        attention_tools,
        checks,
    })
}

#[tauri::command]
pub async fn get_yuanheng_diagnostics(
    state: State<'_, AppState>,
) -> Result<YuanhengDiagnosticReport, String> {
    diagnose_yuanheng_inner(&state).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn export_yuanheng_diagnostics(
    state: State<'_, AppState>,
    filePath: String,
) -> Result<String, String> {
    if filePath.trim().is_empty() {
        return Err("请选择诊断文件保存位置".to_string());
    }
    let report = diagnose_yuanheng_inner(&state).await?;
    let document = json!({
        "product": "YuanHeng Desktop",
        "version": env!("CARGO_PKG_VERSION"),
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "platform": std::env::consts::OS,
        "architecture": std::env::consts::ARCH,
        "report": report
    });
    let content = serde_json::to_string_pretty(&document).map_err(|e| e.to_string())?;
    std::fs::write(&filePath, content).map_err(|e| format!("写入诊断文件失败: {e}"))?;
    Ok(filePath)
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn configure_yuanheng_tools(
    state: State<'_, AppState>,
    apps: Vec<String>,
    models: Option<HashMap<String, String>>,
    groups: Option<HashMap<String, String>>,
    reasoning: Option<HashMap<String, String>>,
) -> Result<Vec<YuanhengToolConfigureResult>, String> {
    if apps.is_empty() || apps.len() > 10 {
        return Err("请选择 1 到 10 个 AI 工具".to_string());
    }
    let control_token = state
        .db
        .get_setting(API_TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "请先连接元衡账号".to_string())?;
    let control_token_group = state
        .db
        .get_setting(API_TOKEN_GROUP_KEY)
        .map_err(|e| e.to_string())?;
    let session_cookie = state
        .db
        .get_setting(SESSION_COOKIE_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "元衡登录状态缺失，请重新登录".to_string())?;
    let user_id = state
        .db
        .get_setting(USER_ID_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "元衡用户 ID 缺失".to_string())?;
    let client = yuanheng_client()?;
    let connection = read_cached_status(&state)?;
    let requested_models = models.unwrap_or_default();
    let requested_groups = groups.unwrap_or_default();
    let requested_reasoning = reasoning.unwrap_or_default();
    // 旧版本没有记录令牌所属分组，不能用当前账号分组反推，否则会把 default
    // 令牌误用于新选择的分组。缺少记录时按目标分组重新读取令牌。
    let mut token_cache =
        token_cache_for_stored_group(control_token_group.as_deref(), control_token);
    let mut results = Vec::new();
    let mut seen = BTreeSet::new();
    for app_name in apps {
        if !seen.insert(app_name.clone()) {
            continue;
        }
        let is_workbuddy = app_name == "workbuddy";
        let is_chatgpt_desktop = app_name == CHATGPT_DESKTOP_NAMESPACE;
        let app = match app_name.as_str() {
            CHATGPT_DESKTOP_NAMESPACE => AppType::Codex,
            "workbuddy" => AppType::OpenCode,
            _ => match app_name.parse::<AppType>() {
                Ok(app) => app,
                Err(error) => {
                    results.push(YuanhengToolConfigureResult {
                        app: app_name,
                        configured: false,
                        model: None,
                        warnings: Vec::new(),
                        error: Some(error.to_string()),
                    });
                    continue;
                }
            },
        };
        let model = match resolve_tool_model(
            app.clone(),
            &connection.models,
            requested_models.get(&app_name).map(String::as_str),
        ) {
            Ok(model) => model,
            Err(error) => {
                results.push(YuanhengToolConfigureResult {
                    app: app_name.clone(),
                    configured: false,
                    model: None,
                    warnings: Vec::new(),
                    error: Some(error),
                });
                continue;
            }
        };
        let group = match preferred_group_for_model(
            &connection,
            &model,
            requested_groups.get(&app_name).map(String::as_str),
        ) {
            Ok(group) => group,
            Err(error) => {
                results.push(YuanhengToolConfigureResult {
                    app: app_name.clone(),
                    configured: false,
                    model: Some(model),
                    warnings: Vec::new(),
                    error: Some(error),
                });
                continue;
            }
        };
        let reasoning = match resolve_reasoning_level(
            requested_reasoning.get(&app_name).map(String::as_str),
            &model,
            &connection.reasoning_levels,
        ) {
            Ok(reasoning) => reasoning,
            Err(error) => {
                results.push(YuanhengToolConfigureResult {
                    app: app_name.clone(),
                    configured: false,
                    model: Some(model),
                    warnings: Vec::new(),
                    error: Some(error),
                });
                continue;
            }
        };
        let token = if let Some(token) = token_cache.get(&group) {
            token.clone()
        } else {
            match ensure_device_api_token(&client, &session_cookie, &user_id, &group).await {
                Ok((token, _)) => {
                    token_cache.insert(group.clone(), token.clone());
                    token
                }
                Err(error) => {
                    results.push(YuanhengToolConfigureResult {
                        app: app_name.clone(),
                        configured: false,
                        model: Some(model),
                        warnings: Vec::new(),
                        error: Some(format!("创建 {group} 分组凭据失败: {error}")),
                    });
                    continue;
                }
            }
        };
        if !is_workbuddy
            && matches!(&app, AppType::ClaudeDesktop | AppType::Codex)
            && !state.proxy_service.is_running().await
        {
            if let Err(error) = state.proxy_service.start().await {
                results.push(YuanhengToolConfigureResult {
                    app: app_name.clone(),
                    configured: false,
                    model: None,
                    warnings: Vec::new(),
                    error: Some(format!("本地模型路由启动失败: {error}")),
                });
                continue;
            }
        }
        let configured = if is_workbuddy {
            configure_workbuddy(&state, &token, &model, &group)
        } else if matches!(&app, AppType::Codex) {
            configure_codex_surface(
                &state,
                if is_chatgpt_desktop {
                    CodexSurface::Desktop
                } else {
                    CodexSurface::Terminal
                },
                &token,
                &model,
                &connection.models,
                &group,
                &reasoning,
            )
            .await
        } else {
            configure_tool(
                &state,
                app.clone(),
                &token,
                &connection.models,
                Some(&model),
                &group,
                &reasoning,
            )
        };
        match configured {
            Ok(mut result) => {
                result.app = app_name.clone();
                result.warnings.push(format!("使用令牌分组：{group}"));
                if app_name == AppType::Codex.as_str() {
                    crate::services::codex_session_bridge::update_codex_session_model(
                        &model, &reasoning,
                    );
                }
                results.push(result);
            }
            Err(error) => results.push(YuanhengToolConfigureResult {
                app: app_name,
                configured: false,
                model: None,
                warnings: Vec::new(),
                error: Some(error),
            }),
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn login_yuanheng(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<YuanhengAuthResult, String> {
    login_with_credentials(&state, username.trim(), &password).await
}

#[tauri::command]
pub async fn register_yuanheng(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<YuanhengAuthResult, String> {
    let username = username.trim();
    validate_credentials(username, &password)?;
    let client = yuanheng_client()?;
    let (value, _) = post_json(
        &client,
        &format!("{BASE_URL}/api/user/register"),
        &json!({ "username": username, "password": password.as_str() }),
        None,
        None,
    )
    .await?;
    ensure_api_success(&value, "元衡注册失败")?;
    login_with_credentials(&state, username, &password).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn verify_yuanheng_two_factor(
    state: State<'_, AppState>,
    code: String,
) -> Result<YuanhengAuthResult, String> {
    let code = code.trim();
    if code.is_empty() || code.len() > 64 || code.contains(['\n', '\r']) {
        return Err("请输入有效的两步验证码或备用码".to_string());
    }
    let pending_cookie = state
        .db
        .get_setting(PENDING_SESSION_COOKIE_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "两步验证会话已过期，请重新登录".to_string())?;
    let client = yuanheng_client()?;
    let (value, headers) = post_json(
        &client,
        &format!("{BASE_URL}/api/user/login/2fa"),
        &json!({ "code": code }),
        Some(&pending_cookie),
        None,
    )
    .await?;
    let (requires_two_factor, user_id) = parse_auth_response(&value)?;
    if requires_two_factor {
        return Err("元衡仍要求两步验证，请重新输入验证码".to_string());
    }
    let session_cookie = extract_cookie(&headers, "session")
        .ok_or_else(|| "两步验证成功，但未返回有效会话".to_string())?;
    let user_id = user_id.ok_or_else(|| "元衡登录响应缺少用户 ID".to_string())?;
    let status = finish_authenticated_session(&state, &client, &session_cookie, &user_id).await?;
    Ok(YuanhengAuthResult {
        requires_two_factor: false,
        connection: Some(status),
    })
}

#[tauri::command]
pub async fn refresh_yuanheng_connection(
    state: State<'_, AppState>,
) -> Result<YuanhengConnectionStatus, String> {
    let session_cookie = state
        .db
        .get_setting(SESSION_COOKIE_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "元衡尚未连接".to_string())?;
    let user_id = state
        .db
        .get_setting(USER_ID_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "元衡用户 ID 缺失".to_string())?;
    let client = yuanheng_client()?;
    finish_authenticated_session(&state, &client, &session_cookie, &user_id).await
}

#[tauri::command]
pub async fn rotate_yuanheng_device_token(
    state: State<'_, AppState>,
) -> Result<YuanhengConnectionStatus, String> {
    let session_cookie = state
        .db
        .get_setting(SESSION_COOKIE_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "元衡尚未连接".to_string())?;
    let user_id = state
        .db
        .get_setting(USER_ID_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "元衡用户 ID 缺失".to_string())?;
    let previous_token_id = state
        .db
        .get_setting(API_TOKEN_ID_KEY)
        .map_err(|e| e.to_string())?
        .and_then(|value| value.parse::<i64>().ok());
    let client = yuanheng_client()?;
    let status = sync_connection(&client, &session_cookie, &user_id).await?;
    let group = status
        .account
        .as_ref()
        .map(|account| account.group.trim())
        .filter(|group| !group.is_empty())
        .unwrap_or("default");
    let detected_name = crate::services::sync_protocol::detect_system_device_name();
    let token_name = device_token_name(detected_name.as_deref());
    let (created, _) = post_json(
        &client,
        &format!("{BASE_URL}/api/token/"),
        &json!({
            "name": token_name.as_str(),
            "expired_time": -1,
            "remain_quota": 0,
            "unlimited_quota": true,
            "model_limits_enabled": false,
            "group": group
        }),
        Some(&session_cookie),
        Some(&user_id),
    )
    .await?;
    ensure_api_success(&created, "重新创建本机凭据失败")?;

    let list = fetch_json(
        &client,
        &format!("{BASE_URL}/api/token/?p=1&size=100"),
        Some(&session_cookie),
        Some(&user_id),
    )
    .await?;
    ensure_api_success(&list, "读取新建凭据失败")?;
    let now = chrono::Utc::now().timestamp();
    let token_id = find_device_token_id(&list, &token_name, group, now)
        .filter(|id| Some(*id) != previous_token_id)
        .ok_or_else(|| "本机凭据已创建，但未能读取新凭据编号".to_string())?;
    let key_value = fetch_json(
        &client,
        &format!("{BASE_URL}/api/token/{token_id}/key"),
        Some(&session_cookie),
        Some(&user_id),
    )
    .await?;
    ensure_api_success(&key_value, "读取新建凭据失败")?;
    let key = key_value
        .pointer("/data/key")
        .and_then(Value::as_str)
        .ok_or_else(|| "元衡工具凭据响应缺少 key".to_string())?;
    let api_token = normalize_api_token(key)?;
    persist_connection(
        &state,
        &session_cookie,
        &user_id,
        &api_token,
        token_id,
        &status,
    )?;

    if let Some(previous_token_id) = previous_token_id.filter(|id| *id != token_id) {
        match delete_json(
            &client,
            &format!("{BASE_URL}/api/token/{previous_token_id}"),
            &session_cookie,
            &user_id,
        )
        .await
        {
            Ok(value) => {
                if let Err(error) = ensure_api_success(&value, "撤销旧凭据失败") {
                    log::warn!("[YuanHeng] {error}");
                }
            }
            Err(error) => log::warn!("[YuanHeng] 撤销旧凭据失败: {error}"),
        }
    }

    Ok(status)
}

#[tauri::command]
pub async fn open_yuanheng_topup(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let connection = read_cached_status(&state)?;
    if !connection.connected {
        return Err("请先登录元衡账号".to_string());
    }

    let session_cookie = state
        .db
        .get_setting(SESSION_COOKIE_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let user_id = state
        .db
        .get_setting(USER_ID_KEY)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    if session_cookie.is_empty() || user_id.is_empty() {
        return Err("元衡登录状态不完整，请重新登录".to_string());
    }

    // 打开钱包前先验证会话，并只把页面启动所需的最小用户信息写入隔离 WebView。
    let user_value = fetch_json(
        &yuanheng_client()?,
        &format!("{BASE_URL}/api/user/self"),
        Some(&session_cookie),
        Some(&user_id),
    )
    .await?;
    ensure_api_success(&user_value, "元衡登录状态已失效")?;
    let user_data = user_value
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "元衡账号信息不完整".to_string())?;
    let user_seed = json!({
        "id": user_data.get("id").cloned().unwrap_or_else(|| json!(user_id)),
        "username": user_data
            .get("username")
            .cloned()
            .unwrap_or_else(|| json!(connection.account.as_ref().map(|item| item.username.clone()).unwrap_or_default())),
        "role": user_data.get("role").cloned().unwrap_or_else(|| json!(1)),
    });
    let user_seed_json = serde_json::to_string(&user_seed).map_err(|e| e.to_string())?;
    let user_seed_literal = serde_json::to_string(&user_seed_json).map_err(|e| e.to_string())?;
    let init_script = format!(
        r#"if (window.location.origin === {base_origin}) {{
          window.localStorage.setItem("user", {user_seed});
        }}"#,
        base_origin = serde_json::to_string(BASE_URL).map_err(|e| e.to_string())?,
        user_seed = user_seed_literal,
    );
    let cookie = session_cookie_for_webview(&session_cookie)?;
    let topup_url = TOPUP_URL
        .parse()
        .map_err(|e| format!("充值地址无效: {e}"))?;

    if let Some(window) = app.get_webview_window(TOPUP_WINDOW_LABEL) {
        window.set_cookie(cookie).map_err(|e| e.to_string())?;
        window.navigate(topup_url).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(true);
    }

    let opener_app = app.clone();
    let window = WebviewWindowBuilder::new(
        &app,
        TOPUP_WINDOW_LABEL,
        WebviewUrl::External(
            "about:blank"
                .parse()
                .map_err(|e| format!("初始化充值窗口失败: {e}"))?,
        ),
    )
    .title("元衡充值")
    .inner_size(1080.0, 760.0)
    .min_inner_size(860.0, 620.0)
    .center()
    .resizable(true)
    .visible(false)
    .incognito(true)
    .initialization_script(init_script)
    .on_new_window(move |url, _| {
        if matches!(url.scheme(), "http" | "https") {
            if let Err(error) = opener_app.opener().open_url(url.as_str(), None::<String>) {
                log::error!("打开支付页面失败: {error}");
            }
        }
        NewWindowResponse::Deny
    })
    .build()
    .map_err(|e| format!("创建充值窗口失败: {e}"))?;

    window.set_cookie(cookie).map_err(|e| e.to_string())?;
    window.navigate(topup_url).map_err(|e| e.to_string())?;

    let event_app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let _ = event_app.emit(TOPUP_CLOSED_EVENT, ());
        }
    });
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn disconnect_yuanheng(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<YuanhengDisconnectResult, String> {
    if let Some(window) = app.get_webview_window(TOPUP_WINDOW_LABEL) {
        let _ = window.close();
    }
    disconnect_yuanheng_inner(&state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use serial_test::serial;
    use std::sync::Arc;

    #[test]
    fn creates_session_cookie_for_isolated_webview() {
        let cookie = session_cookie_for_webview("session=abc123").unwrap();

        assert_eq!(cookie.name(), "session");
        assert_eq!(cookie.value(), "abc123");
        assert_eq!(cookie.domain(), Some("cn.meta-api.vip"));
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(cookie.secure(), Some(true));
        assert_eq!(cookie.http_only(), Some(true));
    }

    #[test]
    fn rejects_invalid_session_cookie_for_webview() {
        assert!(session_cookie_for_webview("").is_err());
        assert!(session_cookie_for_webview("token=abc123").is_err());
        assert!(session_cookie_for_webview("session=").is_err());
    }

    #[test]
    fn parses_public_announcement_response() {
        assert_eq!(
            parse_announcement_response(&json!({ "data": "  新公告  " })).as_deref(),
            Some("新公告")
        );
        assert_eq!(parse_announcement_response(&json!({ "data": " " })), None);
        assert_eq!(parse_announcement_response(&json!({ "data": null })), None);
    }

    struct TestHome {
        _dir: tempfile::TempDir,
        previous_test_home: Option<std::ffi::OsString>,
    }

    impl TestHome {
        fn new() -> Self {
            let dir = tempfile::tempdir().expect("tempdir");
            let previous_test_home = std::env::var_os("YUANHENG_SWITCH_TEST_HOME");
            std::env::set_var("YUANHENG_SWITCH_TEST_HOME", dir.path());
            crate::settings::reload_settings().expect("reload isolated settings");
            Self {
                _dir: dir,
                previous_test_home,
            }
        }
    }

    impl Drop for TestHome {
        fn drop(&mut self) {
            match self.previous_test_home.take() {
                Some(value) => std::env::set_var("YUANHENG_SWITCH_TEST_HOME", value),
                None => std::env::remove_var("YUANHENG_SWITCH_TEST_HOME"),
            }
            let _ = crate::settings::reload_settings();
        }
    }

    fn isolated_state() -> (TestHome, AppState) {
        let home = TestHome::new();
        let db = Arc::new(Database::memory().expect("in-memory database"));
        (home, AppState::new(db))
    }

    #[test]
    fn extracts_latest_session_cookie() {
        let mut headers = HeaderMap::new();
        headers.append(
            SET_COOKIE,
            "session=pending; Path=/; HttpOnly".parse().unwrap(),
        );
        headers.append(
            SET_COOKIE,
            "session=authenticated; Path=/; HttpOnly".parse().unwrap(),
        );
        assert_eq!(
            extract_cookie(&headers, "session").as_deref(),
            Some("session=authenticated")
        );
    }

    #[test]
    fn parses_two_factor_login_response() {
        let parsed = parse_auth_response(&json!({
            "success": true,
            "data": { "require_2fa": true }
        }))
        .unwrap();
        assert_eq!(parsed, (true, None));

        let parsed = parse_auth_response(&json!({
            "success": true,
            "data": { "id": 1024, "username": "nanashi" }
        }))
        .unwrap();
        assert_eq!(parsed, (false, Some("1024".to_string())));
    }

    #[test]
    fn builds_safe_device_token_name_and_normalizes_key() {
        let name = device_token_name(Some("测试设备名称非常非常长-MacBook-Pro"));
        assert!(name.starts_with("元衡桌面端 - "));
        assert!(name.len() <= 50);
        assert_eq!(normalize_api_token("raw-key").unwrap(), "sk-raw-key");
        assert_eq!(normalize_api_token("sk-ready").unwrap(), "sk-ready");
    }

    #[test]
    fn only_reuses_control_token_for_its_persisted_group() {
        assert!(token_cache_for_stored_group(None, "default-token".to_string()).is_empty());
        let cache = token_cache_for_stored_group(Some(" EMOXIA "), "emoxia-token".to_string());
        assert_eq!(
            cache.get("EMOXIA").map(String::as_str),
            Some("emoxia-token")
        );
        assert!(!cache.contains_key("default"));
    }

    #[test]
    fn finds_latest_usable_device_token() {
        let value = json!({
            "success": true,
            "data": {
                "items": [
                    { "id": 1, "name": "device", "group": "default", "status": 1, "expired_time": -1, "unlimited_quota": true },
                    { "id": 2, "name": "device", "group": "default", "status": 2, "expired_time": -1, "unlimited_quota": true },
                    { "id": 3, "name": "device", "group": "default", "status": 1, "expired_time": -1, "unlimited_quota": true },
                    { "id": 4, "name": "device", "group": "vip", "status": 1, "expired_time": -1, "unlimited_quota": true }
                ]
            }
        });
        assert_eq!(
            find_device_token_id(&value, "device", "default", 100),
            Some(3)
        );
    }

    #[test]
    #[serial]
    fn legacy_access_token_does_not_count_as_logged_in() {
        let (_home, state) = isolated_state();
        state.db.set_setting(TOKEN_KEY, "legacy-token").unwrap();
        state
            .db
            .set_setting(
                CACHE_KEY,
                &serde_json::to_string(&YuanhengConnectionStatus {
                    connected: true,
                    ..Default::default()
                })
                .unwrap(),
            )
            .unwrap();

        assert!(!read_cached_status(&state).unwrap().connected);
    }

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

    #[test]
    fn parses_live_api_model_catalog() {
        let models = parse_api_models(&serde_json::json!({
            "data": [
                { "id": "deepseek-v3.2", "object": "model" },
                { "id": "gpt-5.6", "object": "model" },
                { "id": "deepseek-v3.2", "object": "model" },
                { "name": "ignored" }
            ]
        }))
        .unwrap();
        assert_eq!(models, vec!["deepseek-v3.2", "gpt-5.6"]);
    }

    #[test]
    fn parses_account_models_and_groups() {
        let models = parse_user_models(&json!({
            "success": true,
            "data": ["gpt-5.6-sol", "deepseek-v4-pro", "gpt-5.6-sol"]
        }))
        .unwrap();
        assert_eq!(models, vec!["deepseek-v4-pro", "gpt-5.6-sol"]);

        let groups = parse_user_groups(&json!({
            "success": true,
            "data": {
                "vip": { "desc": "VIP", "ratio": 0.5 },
                "default": { "desc": "默认分组", "ratio": 1.0 }
            }
        }))
        .unwrap();
        assert_eq!(groups[0].id, "default");
        assert_eq!(groups[1].ratio, Some(0.5));
    }

    #[test]
    fn chooses_a_usable_group_for_each_model() {
        let mut connection = YuanhengConnectionStatus {
            account: Some(YuanhengAccount {
                group: "default".to_string(),
                ..Default::default()
            }),
            groups: vec![
                YuanhengGroupOption {
                    id: "default".to_string(),
                    description: "默认分组".to_string(),
                    ratio: Some(1.0),
                },
                YuanhengGroupOption {
                    id: "svip".to_string(),
                    description: "SVIP".to_string(),
                    ratio: Some(0.5),
                },
                YuanhengGroupOption {
                    id: "vip".to_string(),
                    description: "VIP".to_string(),
                    ratio: Some(0.8),
                },
            ],
            model_groups: HashMap::from([(
                "gpt-5.6-sol".to_string(),
                vec!["svip".to_string(), "vip".to_string()],
            )]),
            ..Default::default()
        };

        assert_eq!(
            preferred_group_for_model(&connection, "gpt-5.6-sol", None).unwrap(),
            "svip"
        );
        assert_eq!(
            preferred_group_for_model(&connection, "gpt-5.6-sol", Some("vip")).unwrap(),
            "vip"
        );
        assert!(
            preferred_group_for_model(&connection, "gpt-5.6-sol", Some("default"))
                .unwrap_err()
                .contains("不支持分组")
        );

        connection
            .model_groups
            .get_mut("gpt-5.6-sol")
            .unwrap()
            .push("auto".to_string());
        assert_eq!(
            preferred_group_for_model(&connection, "gpt-5.6-sol", None).unwrap(),
            "auto"
        );
    }

    #[test]
    fn recommends_models_by_tool_protocol() {
        let models = vec![
            "deepseek-chat".to_string(),
            "claude-sonnet-4-6".to_string(),
            "gemini-3-pro".to_string(),
            "gpt-5.6".to_string(),
        ];
        assert_eq!(
            recommended_model(&AppType::Claude, &models).as_deref(),
            Some("claude-sonnet-4-6")
        );
        assert_eq!(
            recommended_model(&AppType::ClaudeDesktop, &models).as_deref(),
            Some("claude-sonnet-4-6")
        );
        assert_eq!(
            recommended_model(&AppType::Gemini, &models).as_deref(),
            Some("gemini-3-pro")
        );
        assert_eq!(
            recommended_model(&AppType::Codex, &models).as_deref(),
            Some("gpt-5.6")
        );
    }

    #[test]
    fn recommends_text_model_for_claude_terminal_without_claude_models() {
        let models = vec![
            "FunAudioLLM/SenseVoiceSmall".to_string(),
            "deepseek-ai/DeepSeek-OCR".to_string(),
            "k3".to_string(),
            "gpt-5.4".to_string(),
            "deepseek-v4-flash".to_string(),
            "deepseek-v4-pro".to_string(),
        ];
        assert_eq!(
            recommended_model(&AppType::Claude, &models).as_deref(),
            Some("deepseek-v4-pro")
        );
        assert_eq!(
            recommended_model(&AppType::ClaudeDesktop, &models).as_deref(),
            Some("deepseek-v4-pro")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reports_claude_desktop_download_progress_and_stall() {
        let support = tempfile::tempdir().expect("tempdir");
        let version_dir = support.path().join("Claude-3p/claude-code/2.1.217");
        std::fs::create_dir_all(&version_dir).expect("create version dir");
        let partial = version_dir.join("download.zst.partial");
        std::fs::File::create(&partial)
            .expect("create partial")
            .set_len(13 * 1024 * 1024)
            .expect("size partial");

        let now = SystemTime::now();
        let downloading = claude_desktop_runtime_status_from(support.path(), now)
            .expect("partial download should be reported");
        assert_eq!(downloading.state, "downloading");
        assert_eq!(downloading.downloaded_bytes, 13 * 1024 * 1024);
        assert!(downloading.message.contains("13.0 MB"));

        let stalled =
            claude_desktop_runtime_status_from(support.path(), now + Duration::from_secs(121))
                .expect("stalled download should be reported");
        assert_eq!(stalled.state, "stalled");

        std::fs::write(version_dir.join(".verified"), "ready").expect("mark verified");
        assert!(claude_desktop_runtime_status_from(support.path(), now).is_none());
    }

    #[test]
    fn builds_hidden_managed_configs_for_each_tool() {
        let cases = [
            (AppType::Claude, "claude-sonnet-4-6"),
            (AppType::ClaudeDesktop, "deepseek-v4-pro"),
            (AppType::Codex, "gpt-5.6"),
            (AppType::Gemini, "gemini-3-pro"),
            (AppType::GrokBuild, "grok-4"),
            (AppType::OpenCode, "gpt-5.6"),
            (AppType::OpenClaw, "gpt-5.6"),
            (AppType::Hermes, "gpt-5.6"),
        ];
        for (app, model) in cases {
            let provider = managed_provider(&app, "sk-test", model, "default", "auto").unwrap();
            assert_eq!(provider.id, MANAGED_PROVIDER_ID);
            assert_eq!(provider.name, "元衡");
            assert_eq!(provider_model(&provider, &app).as_deref(), Some(model));
            assert!(provider.settings_config.to_string().contains("sk-test"));
        }
    }

    #[test]
    fn managed_configs_pass_strict_tool_validators() {
        let desktop =
            managed_provider(&AppType::ClaudeDesktop, "sk-test", "k3", "default", "high").unwrap();
        crate::claude_desktop_config::validate_provider(&desktop).unwrap();
        assert_eq!(
            desktop
                .meta
                .as_ref()
                .and_then(|meta| meta.claude_desktop_mode.clone()),
            Some(ClaudeDesktopMode::Proxy)
        );
        assert_eq!(
            crate::claude_desktop_config::proxy_model_routes(&desktop).unwrap()[0].upstream_model,
            "k3"
        );
        let desktop_meta = desktop.meta.as_ref().unwrap();
        assert_eq!(desktop_meta.api_format.as_deref(), Some("openai_chat"));
        assert_eq!(
            desktop_meta.claude_desktop_model_routes["claude-sonnet-5"]
                .label_override
                .as_deref(),
            Some("元衡 AI")
        );
        assert_eq!(
            desktop_meta
                .local_proxy_request_overrides
                .as_ref()
                .and_then(|overrides| overrides.body.as_ref())
                .and_then(|body| body.get("reasoning_effort"))
                .and_then(Value::as_str),
            Some("high")
        );

        let desktop_gpt = managed_provider(
            &AppType::ClaudeDesktop,
            "sk-test",
            "gpt-5.6-sol",
            "default",
            "high",
        )
        .unwrap();
        let gpt_meta = desktop_gpt.meta.as_ref().unwrap();
        assert_eq!(gpt_meta.api_format.as_deref(), Some("openai_responses"));
        assert_eq!(
            gpt_meta
                .local_proxy_request_overrides
                .as_ref()
                .and_then(|overrides| overrides.body.as_ref())
                .and_then(|body| body.pointer("/reasoning/effort"))
                .and_then(Value::as_str),
            Some("high")
        );

        let desktop_claude = managed_provider(
            &AppType::ClaudeDesktop,
            "sk-test",
            "claude-sonnet-4-6",
            "default",
            "high",
        )
        .unwrap();
        let claude_meta = desktop_claude.meta.as_ref().unwrap();
        assert_eq!(claude_meta.api_format.as_deref(), Some("anthropic"));
        assert_eq!(
            claude_meta
                .local_proxy_request_overrides
                .as_ref()
                .and_then(|overrides| overrides.body.as_ref())
                .and_then(|body| body.pointer("/output_config/effort"))
                .and_then(Value::as_str),
            Some("high")
        );

        let codex =
            managed_provider(&AppType::Codex, "sk-test", "gpt-5.6", "default", "high").unwrap();
        assert!(codex.settings_config["config"]
            .as_str()
            .unwrap()
            .contains("model_reasoning_effort = \"high\""));
        assert_eq!(provider_group(&codex).as_deref(), Some("default"));
        assert_eq!(provider_reasoning(&codex).as_deref(), Some("high"));
        let codex_chat =
            managed_provider(&AppType::Codex, "sk-test", "k3", "default", "high").unwrap();
        assert_eq!(
            codex_chat.settings_config["modelCatalog"]["models"][0]["model"],
            "k3"
        );
        assert_eq!(
            codex_chat
                .meta
                .as_ref()
                .and_then(|meta| meta.api_format.as_deref()),
            Some("openai_chat")
        );
        assert!(provider_schema_current(&codex_chat, &AppType::Codex));
        let mut full_catalog = codex_chat.clone();
        set_codex_available_models(
            &mut full_catalog,
            "k3",
            &[
                "gpt-5.6-sol".to_string(),
                "deepseek-v4-pro".to_string(),
                "k3".to_string(),
            ],
        );
        let models = full_catalog.settings_config["modelCatalog"]["models"]
            .as_array()
            .unwrap();
        assert_eq!(models.len(), 3);
        assert_eq!(models[0]["model"], "k3");
        assert_eq!(models[1]["model"], "gpt-5.6-sol");
        let mut legacy_codex_chat = codex_chat.clone();
        legacy_codex_chat.meta.as_mut().unwrap().api_format = Some("openai_responses".to_string());
        assert!(!provider_schema_current(
            &legacy_codex_chat,
            &AppType::Codex
        ));
        let mut missing_catalog = codex_chat.clone();
        missing_catalog
            .settings_config
            .as_object_mut()
            .unwrap()
            .remove("modelCatalog");
        assert!(!provider_schema_current(&missing_catalog, &AppType::Codex));
        assert!(provider_schema_current(&desktop, &AppType::ClaudeDesktop));
        let mut legacy_desktop = desktop.clone();
        legacy_desktop
            .meta
            .as_mut()
            .unwrap()
            .claude_desktop_model_routes
            .get_mut("claude-sonnet-5")
            .unwrap()
            .label_override = Some("k3".to_string());
        assert!(!provider_schema_current(
            &legacy_desktop,
            &AppType::ClaudeDesktop
        ));
        crate::codex_config::validate_config_toml(
            codex.settings_config["config"].as_str().unwrap(),
        )
        .unwrap();

        let gemini = managed_provider(
            &AppType::Gemini,
            "sk-test",
            "gemini-3-pro",
            "default",
            "auto",
        )
        .unwrap();
        crate::gemini_config::validate_gemini_settings(&gemini.settings_config).unwrap();

        let grok =
            managed_provider(&AppType::GrokBuild, "sk-test", "grok-4", "default", "auto").unwrap();
        crate::grok_config::validate_config_toml(grok.settings_config["config"].as_str().unwrap())
            .unwrap();
    }

    #[test]
    fn validates_reasoning_levels() {
        let supported = HashMap::from([(
            "k3".to_string(),
            vec!["minimal", "low", "medium", "high", "xhigh"]
                .into_iter()
                .map(str::to_string)
                .collect(),
        )]);
        for level in ["auto", "minimal", "low", "medium", "high", "xhigh"] {
            assert_eq!(
                resolve_reasoning_level(Some(level), "k3", &supported).unwrap(),
                level
            );
        }
        assert_eq!(
            resolve_reasoning_level(None, "k3", &supported).unwrap(),
            "auto"
        );
        assert!(resolve_reasoning_level(Some("max"), "k3", &supported).is_err());
        assert!(resolve_reasoning_level(Some("extreme"), "k3", &supported).is_err());
        assert!(resolve_reasoning_level(Some("high"), "deepseek-v4-pro", &supported).is_err());
    }

    #[test]
    fn provides_model_specific_reasoning_fallbacks() {
        assert_eq!(
            fallback_reasoning_levels("claude-opus-4-7"),
            vec!["low", "medium", "high", "max"]
        );
        assert_eq!(
            fallback_reasoning_levels("gpt-5.5"),
            vec!["low", "medium", "high", "xhigh"]
        );
        assert!(fallback_reasoning_levels("deepseek-v4-pro").is_empty());
    }

    #[test]
    fn selects_claude_protocol_by_model_family() {
        assert_eq!(yuanheng_claude_api_format("claude-opus-4-7"), "anthropic");
        assert_eq!(
            yuanheng_claude_api_format("gpt-5.6-sol"),
            "openai_responses"
        );
        assert_eq!(yuanheng_claude_api_format("o3-mini"), "openai_responses");
        assert_eq!(yuanheng_claude_api_format("k3"), "openai_chat");
        assert_eq!(yuanheng_claude_api_format("deepseek-v4-pro"), "openai_chat");
    }

    #[test]
    #[serial]
    fn codex_surfaces_keep_independent_models_and_routes() {
        let (_home, state) = isolated_state();
        let terminal = managed_provider(
            &AppType::Codex,
            "terminal-token",
            "gpt-5.6-sol",
            "premium",
            "xhigh",
        )
        .unwrap();
        let desktop =
            managed_provider(&AppType::Codex, "desktop-token", "k3", "default", "high").unwrap();
        save_managed_codex_provider(&state, AppType::Codex.as_str(), &terminal).unwrap();
        save_managed_codex_provider(&state, CHATGPT_DESKTOP_NAMESPACE, &desktop).unwrap();

        let stored_terminal = managed_codex_provider_for_namespace(&state, AppType::Codex.as_str())
            .unwrap()
            .unwrap();
        let stored_desktop =
            managed_codex_provider_for_namespace(&state, CHATGPT_DESKTOP_NAMESPACE)
                .unwrap()
                .unwrap();
        assert_eq!(
            provider_model(&stored_terminal, &AppType::Codex).as_deref(),
            Some("gpt-5.6-sol")
        );
        assert_eq!(
            provider_model(&stored_desktop, &AppType::Codex).as_deref(),
            Some("k3")
        );

        let catalog = combined_codex_catalog_settings(&state).unwrap();
        assert_eq!(
            catalog["modelCatalog"]["models"].as_array().unwrap().len(),
            2
        );
        let terminal_config = codex_surface_route_config(
            &stored_terminal,
            "http://127.0.0.1:15721/codex/v1",
            &catalog,
            CodexSurface::Terminal,
        )
        .unwrap();
        let desktop_config = codex_surface_route_config(
            &stored_desktop,
            "http://127.0.0.1:15721/chatgpt-desktop/v1",
            &catalog,
            CodexSurface::Desktop,
        )
        .unwrap();
        assert!(terminal_config.contains("/codex/v1"));
        assert!(terminal_config.contains("model = \"gpt-5.6-sol\""));
        assert!(desktop_config.contains("/chatgpt-desktop/v1"));
        assert!(desktop_config.contains("model = \"k3\""));
    }

    #[test]
    #[serial]
    fn removes_owned_codex_surface_artifacts() {
        let (_home, state) = isolated_state();
        let desktop = managed_provider(&AppType::Codex, "token", "k3", "default", "high").unwrap();
        save_managed_codex_provider(&state, CHATGPT_DESKTOP_NAMESPACE, &desktop).unwrap();
        crate::config::write_text_file(
            &codex_terminal_profile_path(),
            "model_provider = \"yuanheng\"\nbase_url = \"http://127.0.0.1:15721/codex/v1\"\n",
        )
        .unwrap();

        assert!(remove_codex_surface_artifacts(&state).unwrap());
        assert!(
            managed_codex_provider_for_namespace(&state, CHATGPT_DESKTOP_NAMESPACE)
                .unwrap()
                .is_none()
        );
        assert!(!codex_terminal_profile_path().exists());
    }

    #[tokio::test]
    #[serial]
    async fn diagnostics_guides_disconnected_users_to_login() {
        let (_home, state) = isolated_state();

        let report = diagnose_yuanheng_inner(&state).await.unwrap();

        assert_eq!(report.status, "error");
        assert_eq!(report.ready_tools, 0);
        assert_eq!(report.checks.len(), 1);
        assert_eq!(report.checks[0].id, "connection");
        assert_eq!(report.checks[0].action.as_deref(), Some("login"));
    }

    #[test]
    #[serial]
    fn disconnect_restores_previous_exclusive_tool_config() {
        let (_home, state) = isolated_state();
        let previous = Provider::with_id(
            "previous".to_string(),
            "原配置".to_string(),
            json!({
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "old-token",
                    "ANTHROPIC_BASE_URL": "https://api.example.com",
                    "ANTHROPIC_MODEL": "claude-old"
                }
            }),
            None,
        );
        ProviderService::add(&state, AppType::Claude, previous, true).unwrap();
        configure_tool(
            &state,
            AppType::Claude,
            "yuanheng-token",
            &["claude-sonnet-4-6".to_string()],
            None,
            "default",
            "auto",
        )
        .unwrap();

        let result = disconnect_yuanheng_inner(&state).unwrap();

        assert_eq!(result.restored_tools, vec!["claude"]);
        assert!(result.retained_tools.is_empty());
        assert_eq!(
            ProviderService::current(&state, AppType::Claude).unwrap(),
            "previous"
        );
        assert!(!ProviderService::list(&state, AppType::Claude)
            .unwrap()
            .contains_key(MANAGED_PROVIDER_ID));
        let live = std::fs::read_to_string(crate::config::get_claude_settings_path()).unwrap();
        assert!(live.contains("old-token"));
        assert!(!live.contains("yuanheng-token"));
    }

    #[test]
    #[serial]
    fn disconnect_removes_additive_tool_credentials() {
        let (_home, state) = isolated_state();
        configure_tool(
            &state,
            AppType::OpenCode,
            "yuanheng-token",
            &["gpt-5.6".to_string()],
            None,
            "default",
            "auto",
        )
        .unwrap();

        let result = disconnect_yuanheng_inner(&state).unwrap();

        assert!(result.removed_tools.contains(&"opencode".to_string()));
        assert!(!ProviderService::list(&state, AppType::OpenCode)
            .unwrap()
            .contains_key(MANAGED_PROVIDER_ID));
        let live =
            std::fs::read_to_string(crate::opencode_config::get_opencode_config_path()).unwrap();
        assert!(!live.contains("yuanheng-token"));
        assert!(!live.contains(MANAGED_PROVIDER_ID));
    }

    #[test]
    #[serial]
    fn disconnect_restores_hermes_model_selection() {
        let (_home, state) = isolated_state();
        let previous = crate::hermes_config::HermesModelConfig {
            default: Some("old-model".to_string()),
            provider: Some("old-provider".to_string()),
            ..Default::default()
        };
        crate::hermes_config::set_model_config(&previous).unwrap();
        configure_tool(
            &state,
            AppType::Hermes,
            "yuanheng-token",
            &["gpt-5.6".to_string()],
            None,
            "default",
            "auto",
        )
        .unwrap();

        let result = disconnect_yuanheng_inner(&state).unwrap();
        let restored = crate::hermes_config::get_model_config().unwrap().unwrap();

        assert!(result.removed_tools.contains(&"hermes".to_string()));
        assert_eq!(restored.provider.as_deref(), Some("old-provider"));
        assert_eq!(restored.default.as_deref(), Some("old-model"));
        let live = std::fs::read_to_string(crate::hermes_config::get_hermes_config_path()).unwrap();
        assert!(!live.contains("yuanheng-token"));
    }

    #[test]
    #[serial]
    fn workbuddy_config_uses_chat_endpoint_and_restores_previous_file() {
        let (_home, state) = isolated_state();
        let path = workbuddy_config_path();
        crate::config::write_text_file(&path, r#"{"models":[],"availableModels":[]}"#).unwrap();

        let configured = configure_workbuddy(&state, "yuanheng-token", "k3", "vip").unwrap();
        assert!(configured.configured);
        let live = read_workbuddy_config().unwrap();
        assert_eq!(
            live.pointer("/models/0/url").and_then(Value::as_str),
            Some("https://cn.meta-api.vip/v1/chat/completions")
        );
        assert!(workbuddy_config_matches(&live, "k3"));
        let status = workbuddy_status(&state, &["k3".to_string()]);
        assert!(status.configured);
        assert_eq!(status.group.as_deref(), Some("vip"));

        let result = disconnect_yuanheng_inner(&state).unwrap();
        assert!(result.restored_tools.contains(&"workbuddy".to_string()));
        assert_eq!(
            std::fs::read_to_string(path).unwrap(),
            r#"{"models":[],"availableModels":[]}"#
        );
    }
}
