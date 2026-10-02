//! On-demand, bounded checks. Never generates a model request, changes Windows
//! features or exports the local gateway credential.
use super::yuanheng::YuanhengDiagnosticCheck;
use crate::database::Database;
use std::time::Duration;

fn check(id: &str, ok: bool, title: &str, message: &str) -> YuanhengDiagnosticCheck {
    YuanhengDiagnosticCheck {
        id: id.into(),
        status: if ok { "ok" } else { "warning" }.into(),
        title: title.into(),
        message: message.into(),
        action: None,
    }
}

pub(crate) async fn gateway(db: &Database) -> YuanhengDiagnosticCheck {
    let result = tokio::time::timeout(Duration::from_secs(5), probe_gateway(db)).await;
    let (ok, message) = match result {
        Ok(Ok(())) => (true, "已验证本机网关认证及模型目录；未发送模型请求，不代表实际推理或 Claude 桌面连接已成功。"),
        Ok(Err("auth")) => (false, "本机网关拒绝桌面凭据；检查 Claude Desktop 配置，勿发送或公开密钥。"),
        Ok(Err("profile")) => (false, "未找到可安全检查的本机桌面网关配置；未访问外部地址。"),
        Ok(Err("mapping")) => (false, "本机网关响应异常或模型目录不可用；真实推理未验证，请查看脱敏诊断。"),
        _ => (false, "本机桌面网关探测超时或连接失败；Core 运行不等于桌面链路可用。"),
    };
    check(
        "claude_desktop_gateway",
        ok,
        "Claude Desktop 本机网关检查",
        message,
    )
}

async fn probe_gateway(db: &Database) -> Result<(), &'static str> {
    let (base, token) =
        crate::claude_desktop_config::local_gateway_probe_config(db).map_err(|_| "profile")?;
    probe_local_models(&base, &token).await
}

async fn probe_local_models(base: &str, token: &str) -> Result<(), &'static str> {
    let url = probe_url(base).ok_or("profile")?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|_| "connection")?;
    let mut response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "connection")?;
    if matches!(response.status().as_u16(), 401 | 403) {
        return Err("auth");
    }
    if response.status().as_u16() != 200 {
        return Err("mapping");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "connection")? {
        if bytes.len().saturating_add(chunk.len()) > 64 * 1024 {
            return Err("mapping");
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| "mapping")?;
    if value
        .get("data")
        .and_then(|v| v.as_array())
        .is_none_or(|v| v.is_empty())
    {
        return Err("mapping");
    }
    Ok(())
}

fn probe_url(base: &str) -> Option<url::Url> {
    let mut url = url::Url::parse(base).ok()?;
    // Do not let a hand-edited profile exfiltrate the credential or trigger an
    // arbitrary local endpoint. This check is not a generic connectivity test.
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1" | "[::1]" | "localhost"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path().trim_end_matches('/') != "/claude-desktop"
    {
        return None;
    }
    url.set_path("/claude-desktop/v1/models");
    Some(url)
}

#[cfg(any(windows, test))]
fn environment_check(
    result: Result<super::claude_workspace_setup::WorkspacePreparation, String>,
) -> YuanhengDiagnosticCheck {
    let (ok, message) = match result {
        Ok(state) => (
            state.phase == super::claude_workspace_setup::WorkspacePhase::Ready,
            state.message,
        ),
        Err(_) => (
            false,
            "Windows 运行环境状态未能确认；请在工具管理中重新检查，未知不等于未启用。".into(),
        ),
    };
    check(
        "claude_desktop_environment",
        ok,
        "Claude Desktop Windows 运行环境",
        &message,
    )
}

pub(crate) async fn windows_environment() -> Option<YuanhengDiagnosticCheck> {
    #[cfg(windows)]
    {
        // Same read-only state machine as install/launch: a pending reboot must
        // not be green here while the preparation dialog says it is not ready.
        Some(environment_check(
            super::claude_workspace_setup::get_claude_workspace_preparation().await,
        ))
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn probe_cannot_send_credentials_to_remote_or_arbitrary_local_paths() {
        for bad in [
            "https://example.com/claude-desktop",
            "http://127.0.0.1.evil/claude-desktop",
            "http://user:secret@127.0.0.1/claude-desktop",
            "http://127.0.0.1/claude-desktop?key=secret",
            "http://127.0.0.1/__yuanheng/core/shutdown",
            "http://127.0.0.1:15721",
        ] {
            assert!(probe_url(bad).is_none(), "{bad}");
        }
        assert_eq!(
            probe_url("http://127.0.0.1:15721/claude-desktop/")
                .unwrap()
                .as_str(),
            "http://127.0.0.1:15721/claude-desktop/v1/models"
        );
    }

    #[test]
    fn unknown_is_not_disabled_and_enabled_does_not_claim_inference_works() {
        use super::super::claude_workspace_setup::{WorkspacePhase, WorkspacePreparation};
        let unknown = environment_check(Err("private raw error".into()));
        assert_eq!(unknown.status, "warning");
        assert!(unknown.message.contains("未知不等于未启用"));
        assert!(!unknown.message.contains("private"));
        for phase in [
            WorkspacePhase::RestartRequired,
            WorkspacePhase::Preparing,
            WorkspacePhase::Unknown,
        ] {
            assert_eq!(
                environment_check(Ok(WorkspacePreparation {
                    phase,
                    message: "not ready".into()
                }))
                .status,
                "warning"
            );
        }
        let ready = environment_check(Ok(WorkspacePreparation {
            phase: WorkspacePhase::Ready,
            message: "仅基础环境通过，不代表模型成功".into(),
        }));
        assert_eq!(ready.status, "ok");
        assert!(ready.message.contains("不代表模型成功"));
    }

    #[tokio::test]
    async fn gateway_probe_only_gets_models_and_never_follows_redirects() {
        for (status, body, expected) in [
            ("200 OK", r#"{"data":[{"id":"route"}]}"#, Ok(())),
            ("401 Unauthorized", "secret raw upstream error", Err("auth")),
            ("302 Found", "", Err("mapping")),
            ("200 OK", r#"{"data":[]}"#, Err("mapping")),
            ("200 OK", "invalid", Err("mapping")),
        ] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                loop {
                    let mut chunk = [0u8; 1024];
                    let n = socket.read(&mut chunk).await.unwrap();
                    assert!(n > 0 && bytes.len() < 8192);
                    bytes.extend_from_slice(&chunk[..n]);
                    if bytes.windows(4).any(|s| s == b"\r\n\r\n") {
                        break;
                    }
                }
                let request = String::from_utf8(bytes).unwrap().to_ascii_lowercase();
                assert!(request.starts_with("get /claude-desktop/v1/models http/1.1"));
                assert!(request.contains("authorization: bearer synthetic-probe-token"));
                let response = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nLocation: http://{address}/must-not-follow\r\nConnection: close\r\n\r\n{body}", body.len());
                socket.write_all(response.as_bytes()).await.unwrap();
            });
            let result = probe_local_models(
                &format!("http://{address}/claude-desktop"),
                "synthetic-probe-token",
            )
            .await;
            server.await.unwrap();
            assert_eq!(result, expected);
        }
    }
}
