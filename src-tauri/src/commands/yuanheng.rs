use std::collections::{BTreeSet, HashMap};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::State;

use crate::app_config::AppType;
use crate::provider::{ClaudeDesktopMode, ClaudeDesktopModelRoute, Provider, ProviderMeta};
use crate::services::ProviderService;
use crate::store::AppState;

const BASE_URL: &str = "https://cn.meta-api.vip";
const OPENAI_BASE_URL: &str = "https://cn.meta-api.vip/v1";
const MANAGED_PROVIDER_ID: &str = "yuanheng-managed";
const TOKEN_KEY: &str = "yuanheng_access_token";
const USER_ID_KEY: &str = "yuanheng_user_id";
const CACHE_KEY: &str = "yuanheng_connection_cache";
const PREVIOUS_PROVIDER_KEY_PREFIX: &str = "yuanheng_previous_provider_";
const PREVIOUS_HERMES_MODEL_KEY: &str = "yuanheng_previous_hermes_model";
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
    pub announcement: Option<String>,
    pub last_synced_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YuanhengToolStatus {
    pub app: String,
    pub supported: bool,
    pub configured: bool,
    pub needs_update: bool,
    pub model: Option<String>,
    pub recommended_model: Option<String>,
    pub message: Option<String>,
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

fn recommended_model(app: &AppType, models: &[String]) -> Option<String> {
    let score = |model: &str| {
        let lower = model.to_ascii_lowercase();
        match app {
            AppType::Claude | AppType::ClaudeDesktop => {
                if lower.contains("claude") {
                    100
                } else if matches!(app, AppType::Claude) {
                    1
                } else {
                    0
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

fn provider_meta(app: &AppType, model: &str) -> ProviderMeta {
    let mut meta = ProviderMeta {
        common_config_enabled: Some(true),
        api_format: Some(
            match app {
                AppType::Claude | AppType::ClaudeDesktop => "anthropic",
                AppType::Codex | AppType::GrokBuild => "openai_responses",
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
        meta.claude_desktop_mode = Some(ClaudeDesktopMode::Direct);
        meta.claude_desktop_model_routes.insert(
            model.to_string(),
            ClaudeDesktopModelRoute {
                model: model.to_string(),
                label_override: Some("元衡".to_string()),
                supports_1m: None,
            },
        );
    }
    meta
}

fn managed_provider(app: &AppType, token: &str, model: &str) -> Result<Provider, String> {
    if matches!(app, AppType::ClaudeDesktop)
        && !crate::claude_desktop_config::is_claude_safe_model_id(model)
    {
        return Err("Claude Desktop 需要账号中存在 Claude 模型".to_string());
    }

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
                "model_provider = \"yuanheng\"\nmodel = {}\ndisable_response_storage = true\n\n[model_providers.yuanheng]\nname = \"元衡\"\nbase_url = {}\nwire_api = \"responses\"\nrequires_openai_auth = true\n",
                toml_string(model),
                toml_string(OPENAI_BASE_URL)
            )
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
    provider.notes = Some("由元衡桌面端自动维护".to_string());
    provider.icon = Some("yuanheng".to_string());
    provider.meta = Some(provider_meta(app, model));
    Ok(provider)
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

fn tool_status(
    state: &AppState,
    app: AppType,
    models: &[String],
    token: Option<&str>,
) -> YuanhengToolStatus {
    let recommended = recommended_model(&app, models);
    let provider = ProviderService::list(state, app.clone())
        .ok()
        .and_then(|providers| providers.get(MANAGED_PROVIDER_ID).cloned());
    let live_selected = app.is_additive_mode()
        || ProviderService::current(state, app.clone())
            .map(|current| current == MANAGED_PROVIDER_ID)
            .unwrap_or(false);
    let credentials_current = provider.as_ref().is_some_and(|item| {
        let serialized = item.settings_config.to_string();
        token.is_some_and(|token| serialized.contains(token)) && serialized.contains(BASE_URL)
    });
    let needs_update = provider.is_some() && (!live_selected || !credentials_current);
    let configured = provider.is_some() && !needs_update;
    let model = provider
        .as_ref()
        .and_then(|item| provider_model(item, &app));
    let supported = recommended.is_some();
    let message = if !supported {
        Some(
            match app {
                AppType::ClaudeDesktop => "账号中没有 Claude Desktop 可用的 Claude 模型",
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
    YuanhengToolStatus {
        app: app.as_str().to_string(),
        supported,
        configured,
        needs_update,
        model,
        recommended_model: recommended,
        message,
    }
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

fn disconnect_yuanheng_inner(state: &AppState) -> Result<YuanhengDisconnectResult, String> {
    let mut result = YuanhengDisconnectResult {
        disconnected: true,
        ..Default::default()
    };
    for app in AppType::all() {
        match remove_managed_tool(state, app.clone()) {
            Ok(Some(true)) => result.restored_tools.push(app.as_str().to_string()),
            Ok(Some(false)) => result.removed_tools.push(app.as_str().to_string()),
            Ok(None) => {}
            Err(error) => {
                result.retained_tools.push(app.as_str().to_string());
                result.warnings.push(format!("{}: {error}", app.as_str()));
            }
        }
    }
    for key in [TOKEN_KEY, USER_ID_KEY, CACHE_KEY] {
        state.db.set_setting(key, "").map_err(|e| e.to_string())?;
    }
    Ok(result)
}

fn configure_tool(
    state: &AppState,
    app: AppType,
    token: &str,
    models: &[String],
    requested_model: Option<&str>,
) -> Result<YuanhengToolConfigureResult, String> {
    let model = if let Some(model) = requested_model
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if !models.iter().any(|item| item == model) {
            return Err(format!("模型 {model} 不在当前账号目录中"));
        }
        model.to_string()
    } else {
        recommended_model(&app, models).ok_or_else(|| "当前账号没有兼容模型".to_string())?
    };
    remember_tool_state(state, &app)?;
    let provider = managed_provider(&app, token, &model)?;
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
pub fn get_yuanheng_tool_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<YuanhengToolStatus>, String> {
    let connection = read_cached_status(&state)?;
    let token = state.db.get_setting(TOKEN_KEY).map_err(|e| e.to_string())?;
    Ok(AppType::all()
        .map(|app| tool_status(&state, app, &connection.models, token.as_deref()))
        .collect())
}

#[allow(non_snake_case)]
#[tauri::command]
pub fn configure_yuanheng_tools(
    state: State<'_, AppState>,
    apps: Vec<String>,
    models: Option<HashMap<String, String>>,
) -> Result<Vec<YuanhengToolConfigureResult>, String> {
    if apps.is_empty() || apps.len() > 8 {
        return Err("请选择 1 到 8 个 AI 工具".to_string());
    }
    let token = state
        .db
        .get_setting(TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "请先连接元衡账号".to_string())?;
    let connection = read_cached_status(&state)?;
    let requested_models = models.unwrap_or_default();
    let mut results = Vec::new();
    let mut seen = BTreeSet::new();
    for app_name in apps {
        if !seen.insert(app_name.clone()) {
            continue;
        }
        let app = match app_name.parse::<AppType>() {
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
        };
        match configure_tool(
            &state,
            app.clone(),
            &token,
            &connection.models,
            requested_models.get(app.as_str()).map(String::as_str),
        ) {
            Ok(result) => results.push(result),
            Err(error) => results.push(YuanhengToolConfigureResult {
                app: app.as_str().to_string(),
                configured: false,
                model: None,
                warnings: Vec::new(),
                error: Some(error),
            }),
        }
    }
    Ok(results)
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
pub fn disconnect_yuanheng(state: State<'_, AppState>) -> Result<YuanhengDisconnectResult, String> {
    disconnect_yuanheng_inner(&state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use serial_test::serial;
    use std::sync::Arc;

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
    fn builds_hidden_managed_configs_for_each_tool() {
        let cases = [
            (AppType::Claude, "claude-sonnet-4-6"),
            (AppType::ClaudeDesktop, "claude-sonnet-4-6"),
            (AppType::Codex, "gpt-5.6"),
            (AppType::Gemini, "gemini-3-pro"),
            (AppType::GrokBuild, "grok-4"),
            (AppType::OpenCode, "gpt-5.6"),
            (AppType::OpenClaw, "gpt-5.6"),
            (AppType::Hermes, "gpt-5.6"),
        ];
        for (app, model) in cases {
            let provider = managed_provider(&app, "sk-test", model).unwrap();
            assert_eq!(provider.id, MANAGED_PROVIDER_ID);
            assert_eq!(provider.name, "元衡");
            assert_eq!(provider_model(&provider, &app).as_deref(), Some(model));
            assert!(provider.settings_config.to_string().contains("sk-test"));
        }
    }

    #[test]
    fn managed_configs_pass_strict_tool_validators() {
        let desktop =
            managed_provider(&AppType::ClaudeDesktop, "sk-test", "claude-sonnet-4-6").unwrap();
        crate::claude_desktop_config::validate_provider(&desktop).unwrap();

        let codex = managed_provider(&AppType::Codex, "sk-test", "gpt-5.6").unwrap();
        crate::codex_config::validate_config_toml(
            codex.settings_config["config"].as_str().unwrap(),
        )
        .unwrap();

        let gemini = managed_provider(&AppType::Gemini, "sk-test", "gemini-3-pro").unwrap();
        crate::gemini_config::validate_gemini_settings(&gemini.settings_config).unwrap();

        let grok = managed_provider(&AppType::GrokBuild, "sk-test", "grok-4").unwrap();
        crate::grok_config::validate_config_toml(grok.settings_config["config"].as_str().unwrap())
            .unwrap();
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
}
