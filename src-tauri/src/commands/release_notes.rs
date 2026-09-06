use std::time::Duration;

const RELEASE_MANIFEST_URL: &str = "https://cn.meta-api.vip/desktop/update/latest.json";
const MAX_MANIFEST_BYTES: usize = 128 * 1024;

async fn read_release_notes(mut response: reqwest::Response) -> Result<serde_json::Value, String> {
    if !response.status().is_success() {
        return Err(format!(
            "更新公告暂时无法同步（HTTP {}）",
            response.status()
        ));
    }
    if response.content_length().unwrap_or(0) > MAX_MANIFEST_BYTES as u64 {
        return Err("更新公告响应过大".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "读取更新公告失败".to_string())?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_MANIFEST_BYTES {
            return Err("更新公告响应过大".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "更新公告格式错误".to_string())?;
    // Older manifests have no rolling feed. The UI retains its bundled/cache data.
    Ok(manifest
        .get_mut("release_notes")
        .map(serde_json::Value::take)
        .unwrap_or(serde_json::Value::Null))
}

/// Anonymous read of a fixed first-party endpoint, even when already up to date.
/// No arbitrary URL, redirects, login cookie, API key or machine identifier.
#[tauri::command]
pub async fn get_desktop_release_notes() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("YuanHeng-Desktop-Announcements")
        .build()
        .map_err(|_| "初始化公告连接失败".to_string())?;
    let response = client
        .get(RELEASE_MANIFEST_URL)
        .send()
        .await
        .map_err(|_| "更新公告暂时无法同步，请稍后重试".to_string())?;
    read_release_notes(response).await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(body: String, status: axum::http::StatusCode) -> reqwest::Response {
        // In-memory bodies: no listener, server task or external network in tests.
        axum::http::Response::builder()
            .status(status)
            .body(body)
            .unwrap()
            .into()
    }

    #[tokio::test]
    async fn reads_only_release_notes_and_supports_legacy_manifests() {
        let value = read_release_notes(response(
            r#"{"version":"1.0.0","platforms":{},"release_notes":[{"version":"1.0.0"}]}"#.into(),
            axum::http::StatusCode::OK,
        ))
        .await
        .unwrap();
        assert_eq!(value[0]["version"], "1.0.0");
        assert!(read_release_notes(response(
            r#"{"notes":"legacy"}"#.into(),
            axum::http::StatusCode::OK
        ))
        .await
        .unwrap()
        .is_null());
    }

    #[tokio::test]
    async fn rejects_errors_invalid_json_and_oversized_responses() {
        for (body, status) in [
            ("invalid".to_string(), axum::http::StatusCode::OK),
            ("{}".to_string(), axum::http::StatusCode::BAD_GATEWAY),
            ("{}".to_string(), axum::http::StatusCode::FOUND),
            (
                " ".repeat(MAX_MANIFEST_BYTES + 1),
                axum::http::StatusCode::OK,
            ),
        ] {
            assert!(read_release_notes(response(body, status)).await.is_err());
        }
    }
}
