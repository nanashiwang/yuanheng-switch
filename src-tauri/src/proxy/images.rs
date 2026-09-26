//! Opaque, single-attempt Images API transport. In particular, Codex image edits
//! contain JSON image references; treating them as chat or requiring multipart
//! would destroy the request. Never map models, sanitize media or fail over here.

use super::{
    forwarder::{validate_codex_official_authorization, ActiveConnectionGuard},
    http_client,
    providers::{is_codex_official_provider, AuthStrategy, CodexAdapter, ProviderAdapter},
    server::ProxyState,
    ProxyError,
};
use crate::{app_config::AppType, provider::Provider};
use axum::{
    body::{Body, Bytes},
    extract::{rejection::BytesRejection, DefaultBodyLimit, OriginalUri, State},
    http::{HeaderMap, HeaderValue, Uri},
    response::{IntoResponse, Response},
    routing::post,
    Router,
};
use futures::StreamExt;
use std::time::Duration;

const IMAGE_REQUEST_LIMIT: usize = 200 * 1024 * 1024;
const IMAGE_RESPONSE_LIMIT: usize = 256 * 1024 * 1024;
const IMAGE_TIMEOUT: Duration = Duration::from_secs(15 * 60);

pub(super) fn routes() -> Router<ProxyState> {
    let mut router = Router::new();
    for prefix in ["", "/v1", "/v1/v1", "/codex/v1"] {
        for operation in ["generations", "edits"] {
            router = router.route(&format!("{prefix}/images/{operation}"), post(handle_images));
        }
    }
    router.layer(DefaultBodyLimit::max(IMAGE_REQUEST_LIMIT))
}

async fn handle_images(
    State(state): State<ProxyState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Response {
    let request_id = uuid::Uuid::new_v4().to_string();
    let guard = ActiveConnectionGuard::acquire(state.status.clone()).await;
    let started = std::time::Instant::now();
    {
        let mut status = state.status.write().await;
        status.total_requests += 1;
        status.last_request_at = Some(chrono::Utc::now().to_rfc3339());
    }
    let mut response = match body {
        Ok(body) => match selected_provider(&state) {
            Ok(provider) => match prepare_request(&provider, &uri, &headers) {
                Ok((url, outgoing)) => match http_client::image_client() {
                    Ok(client) => {
                        send_once(
                            &client,
                            &url,
                            outgoing,
                            body,
                            IMAGE_TIMEOUT,
                            IMAGE_RESPONSE_LIMIT,
                        )
                        .await
                    }
                    Err(error) => local_error(ProxyError::ConfigError(error)),
                },
                Err(error) => local_error(error),
            },
            Err(error) => local_error(error),
        },
        Err(error) => {
            let mut response = error.into_response();
            mark_source(&mut response, "local");
            response
        }
    };
    response.headers_mut().insert(
        "x-yuanheng-request-id",
        HeaderValue::from_str(&request_id).expect("UUID is a valid header"),
    );
    let status_code = response.status();
    // Log only transport metadata: no OAuth tokens, prompts or base64 image data.
    log::info!(
        "[Images] request_id={} path={} content_type={} status={} upstream_request_id={} elapsed_ms={}",
        request_id,
        uri.path(),
        headers.get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("-"),
        status_code.as_u16(),
        response
            .headers()
            .get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("-"),
        started.elapsed().as_millis(),
    );
    let mut status = state.status.write().await;
    if status_code.is_success() {
        status.success_requests += 1;
    } else {
        status.failed_requests += 1;
        status.last_error = Some(format!(
            "Images HTTP {status_code}, request_id={request_id}"
        ));
    }
    status.success_rate = status.success_requests as f32 / status.total_requests as f32 * 100.0;
    drop(status);
    // Keep Core's idle-upgrade guard until the downstream has consumed the image,
    // not merely until the upstream finishes generating it.
    let (parts, body) = response.into_parts();
    let stream = async_stream::stream! {
        let _guard = guard;
        let mut stream = body.into_data_stream();
        while let Some(chunk) = stream.next().await {
            yield chunk;
        }
    };
    Response::from_parts(parts, Body::from_stream(stream))
}

fn selected_provider(state: &ProxyState) -> Result<Provider, ProxyError> {
    // Deliberately bypass the chat failover queue and circuit breaker. Even its
    // first entry could differ from the user's selected account/provider.
    let id = crate::settings::get_effective_current_provider(&state.db, &AppType::Codex)
        .map_err(|e| ProxyError::DatabaseError(e.to_string()))?
        .ok_or(ProxyError::NoProvidersConfigured)?;
    state
        .db
        .get_provider_by_id(&id, "codex")
        .map_err(|e| ProxyError::DatabaseError(e.to_string()))?
        .ok_or(ProxyError::NoAvailableProvider)
}

fn prepare_request(
    provider: &Provider,
    uri: &Uri,
    incoming: &HeaderMap,
) -> Result<(String, HeaderMap), ProxyError> {
    let operation = uri.path().rsplit('/').next().unwrap_or_default();
    if !matches!(operation, "generations" | "edits") {
        return Err(ProxyError::InvalidRequest("未知图片操作".into()));
    }
    let adapter = CodexAdapter::new();
    let official = is_codex_official_provider(provider);
    let mut outgoing = end_to_end_headers(incoming);
    // Host/length belong to the new connection. Other content headers (including
    // multipart boundary or JSON content type) and the body remain byte-for-byte.
    for name in [
        "host",
        "content-length",
        "proxy-authorization",
        "cookie",
        "x-api-key",
        "x-goog-api-key",
    ] {
        outgoing.remove(name);
    }
    if official {
        // The adapter pins the official origin. Never send ChatGPT credentials
        // to a user-editable base URL, nor substitute a stored API key.
        validate_codex_official_authorization(&outgoing)?;
    } else {
        // A client OAuth identity must never leak to a different provider.
        for name in [
            "authorization",
            "chatgpt-account-id",
            "openai-organization",
            "openai-project",
        ] {
            outgoing.remove(name);
        }
        if provider.uses_managed_account_auth() {
            return Err(ProxyError::ConfigError(
                "当前托管供应商尚不支持图片透传；Codex 官方登录请使用 OpenAI Official".into(),
            ));
        }
        let auth = adapter
            .extract_auth(provider)
            .ok_or_else(|| ProxyError::AuthError("当前图片供应商缺少自己的鉴权配置".into()))?;
        if auth.strategy != AuthStrategy::Bearer {
            return Err(ProxyError::ConfigError(
                "当前供应商不是 OpenAI Images 兼容接口".into(),
            ));
        }
        for (name, value) in adapter.get_auth_headers(&auth)? {
            outgoing.insert(name, value);
        }
    }
    let base_url = adapter.extract_base_url(provider)?;
    let mut url = adapter.build_url(&base_url, &format!("/images/{operation}"));
    if let Some(query) = uri.query() {
        url.push('?');
        url.push_str(query);
    }
    Ok((url, outgoing))
}

fn end_to_end_headers(headers: &HeaderMap) -> HeaderMap {
    let mut result = headers.clone();
    // RFC hop-by-hop headers include names nominated by Connection, not just
    // the standard list. Preserve upstream error/request IDs and encodings.
    for value in headers.get_all("connection") {
        if let Ok(value) = value.to_str() {
            for name in value.split(',').map(str::trim) {
                result.remove(name);
            }
        }
    }
    for name in [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "proxy-connection",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    ] {
        result.remove(name);
    }
    result
}

async fn send_once(
    client: &reqwest::Client,
    url: &str,
    headers: HeaderMap,
    body: Bytes,
    timeout: Duration,
    response_limit: usize,
) -> Response {
    let upstream = match client
        .post(url)
        .headers(headers)
        .body(body)
        .timeout(timeout)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return transport_error(error),
    };
    let status = upstream.status();
    let mut headers = end_to_end_headers(upstream.headers());
    headers.remove("content-length");
    let mut stream = upstream.bytes_stream();
    let mut bytes = bytes::BytesMut::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(chunk) if bytes.len().saturating_add(chunk.len()) <= response_limit => {
                bytes.extend_from_slice(&chunk)
            }
            chunk => {
                let mut response = match chunk {
                    Err(error) => transport_error(error),
                    Ok(_) => local_error(ProxyError::ResponseBodyTooLarge(response_limit)),
                };
                // The response failed after upstream accepted the operation.
                // Retain its identifiers for support/reconciliation, never retry.
                for name in [
                    "x-request-id",
                    "request-id",
                    "x-codex-imagegen-request-id",
                    "cf-ray",
                ] {
                    if let Some(value) = headers.get(name) {
                        response.headers_mut().insert(name, value.clone());
                    }
                }
                response.headers_mut().insert(
                    "x-yuanheng-upstream-status",
                    HeaderValue::from(status.as_u16()),
                );
                return response;
            }
        }
    }
    let mut response = Response::new(Body::from(bytes.freeze()));
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    // Even an empty upstream 404 can now be distinguished from a missing route.
    mark_source(&mut response, "upstream");
    response
}

fn transport_error(error: reqwest::Error) -> Response {
    let timed_out = error.is_timeout();
    let message = format!(
        "图片请求结果可能未确定，未自动重试或切换供应商，请核实后再提交: {}",
        error.without_url(),
    );
    local_error(if timed_out {
        ProxyError::Timeout(message)
    } else {
        ProxyError::ForwardFailed(message)
    })
}

fn local_error(error: ProxyError) -> Response {
    let mut response = error.into_response();
    mark_source(&mut response, "local");
    response
}

fn mark_source(response: &mut Response, source: &'static str) {
    response.headers_mut().insert(
        "x-yuanheng-response-source",
        HeaderValue::from_static(source),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::to_bytes, http::StatusCode, routing::any};
    use serde_json::json;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    fn official() -> Provider {
        let mut provider = Provider::with_id(
            "codex-official".into(),
            "OpenAI Official".into(),
            json!({"base_url":"https://wrong.example", "model":"chat-model", "auth":{"OPENAI_API_KEY":"wrong-key"}}),
            None,
        );
        provider.category = Some("official".into());
        provider
    }

    fn oauth_headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        for (name, value) in [
            ("authorization", "Bearer test-oauth"),
            ("chatgpt-account-id", "test-account"),
            ("originator", "codex_cli_rs"),
            ("version", "0.155.0-alpha.16.4"),
            ("session_id", "test-session"),
            ("x-codex-imagegen-request-id", "image-id"),
            ("x-codex-image-turn-id", "turn-id"),
            ("content-type", "application/json"),
            ("host", "localhost:15721"),
            ("connection", "keep-alive, x-hop"),
            ("x-hop", "secret-hop"),
        ] {
            headers.insert(name, HeaderValue::from_static(value));
        }
        headers
    }

    #[test]
    fn official_images_pin_origin_and_preserve_client_oauth_identity() {
        for operation in ["generations", "edits"] {
            for prefix in ["", "/v1", "/v1/v1", "/codex/v1"] {
                let uri = format!("{prefix}/images/{operation}?trace=1")
                    .parse()
                    .unwrap();
                let (url, headers) = prepare_request(&official(), &uri, &oauth_headers()).unwrap();
                assert_eq!(
                    url,
                    format!("https://chatgpt.com/backend-api/codex/images/{operation}?trace=1")
                );
                for name in [
                    "authorization",
                    "chatgpt-account-id",
                    "originator",
                    "version",
                    "session_id",
                    "x-codex-imagegen-request-id",
                    "x-codex-image-turn-id",
                    "content-type",
                ] {
                    assert_eq!(headers[name], oauth_headers()[name]);
                }
                for name in ["host", "connection", "x-hop"] {
                    assert!(!headers.contains_key(name));
                }
            }
        }
    }

    #[test]
    fn official_images_require_client_oauth_and_third_parties_use_own_key() {
        let uri = "/v1/images/edits".parse().unwrap();
        assert!(matches!(
            prepare_request(&official(), &uri, &HeaderMap::new()),
            Err(ProxyError::AuthError(_))
        ));
        let mut headers = oauth_headers();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer PROXY_MANAGED"),
        );
        assert!(matches!(
            prepare_request(&official(), &uri, &headers),
            Err(ProxyError::AuthError(_))
        ));
        let provider = Provider::with_id(
            "api".into(),
            "API".into(),
            json!({
                "base_url": "https://api.example/v1", "auth": {"OPENAI_API_KEY": "own-key"}
            }),
            None,
        );
        let (url, headers) = prepare_request(&provider, &uri, &oauth_headers()).unwrap();
        assert_eq!(url, "https://api.example/v1/images/edits");
        assert_eq!(headers["authorization"], "Bearer own-key");
        assert!(!headers.contains_key("chatgpt-account-id"));
    }

    async fn serve(router: Router) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        (url, task)
    }

    fn client() -> reqwest::Client {
        http_client::image_no_replay_policy(reqwest::Client::builder().no_proxy())
            .build()
            .unwrap()
    }

    #[tokio::test]
    async fn json_image_references_and_multipart_are_forwarded_byte_for_byte() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let router = Router::new().route(
            "/images/edits",
            post(move |headers: HeaderMap, body: Bytes| {
                let tx = tx.clone();
                async move {
                    tx.send((headers, body)).unwrap();
                    (
                        [
                            ("x-request-id", "upstream-image-id"),
                            ("content-type", "application/json"),
                        ],
                        r#"{"data":[{"b64_json":"aW1hZ2U="}]}"#,
                    )
                }
            }),
        );
        let (url, task) = serve(router).await;
        for (content_type, body) in [
            ("application/json", r#"{ "model":"gpt-image-2", "images":[{"image_url":"data:image/png;base64,aW1hZ2U="}], "prompt":"make it blue", "size":"1024x1024", "quality":"low", "n":1 }"#),
            ("multipart/form-data; boundary=test", "--test\r\nContent-Disposition: form-data; name=\"image\"; filename=\"test.png\"\r\nContent-Type: image/png\r\n\r\nimage\r\n--test--\r\n"),
        ] {
            let mut headers = oauth_headers();
            headers.insert("content-type", HeaderValue::from_str(content_type).unwrap());
            let response = send_once(&client(), &format!("{url}/images/edits"), headers, Bytes::from(body), Duration::from_secs(2), 1024).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.headers()["x-request-id"], "upstream-image-id");
            let (received_headers, received_body) = rx.recv().await.unwrap();
            assert_eq!(received_body, body);
            assert_eq!(received_headers["content-type"], content_type);
            assert_eq!(received_headers["authorization"], "Bearer test-oauth");
            assert_eq!(to_bytes(response.into_body(), 1024).await.unwrap(), r#"{"data":[{"b64_json":"aW1hZ2U="}]}"#);
        }
        task.abort();
    }

    #[tokio::test]
    async fn upstream_errors_and_redirects_preserve_status_body_ids_without_replay() {
        for status in [
            StatusCode::UNAUTHORIZED,
            StatusCode::FORBIDDEN,
            StatusCode::NOT_FOUND,
            StatusCode::TOO_MANY_REQUESTS,
            StatusCode::SERVICE_UNAVAILABLE,
            StatusCode::TEMPORARY_REDIRECT,
        ] {
            let count = Arc::new(AtomicUsize::new(0));
            let seen = count.clone();
            let (url, task) = serve(Router::new().fallback(any(move || {
                let seen = seen.clone();
                async move {
                    seen.fetch_add(1, Ordering::SeqCst);
                    (
                        status,
                        [
                            ("x-request-id", "upstream-error-id"),
                            ("location", "/redirect"),
                            ("retry-after", "30"),
                        ],
                        "upstream error unchanged",
                    )
                }
            })))
            .await;
            let response = send_once(
                &client(),
                &url,
                oauth_headers(),
                Bytes::from_static(b"{}"),
                Duration::from_secs(2),
                1024,
            )
            .await;
            assert_eq!(response.status(), status);
            assert_eq!(response.headers()["x-request-id"], "upstream-error-id");
            assert_eq!(response.headers()["retry-after"], "30");
            assert_eq!(response.headers()["x-yuanheng-response-source"], "upstream");
            assert_eq!(
                to_bytes(response.into_body(), 1024).await.unwrap(),
                "upstream error unchanged"
            );
            assert_eq!(count.load(Ordering::SeqCst), 1);
            task.abort();
        }
    }

    #[tokio::test]
    async fn image_response_limit_and_body_timeout_keep_upstream_request_id() {
        let count = Arc::new(AtomicUsize::new(0));
        let seen = count.clone();
        let (url, task) = serve(Router::new().fallback(any(move || {
            let seen = seen.clone();
            async move {
                seen.fetch_add(1, Ordering::SeqCst);
                let body = Body::from_stream(async_stream::stream! {
                    yield Ok::<_, std::io::Error>(Bytes::from_static(b"first"));
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    yield Ok(Bytes::from_static(b"last"));
                });
                ([("x-request-id", "partial-image-id")], body)
            }
        })))
        .await;
        for (timeout, limit, expected) in [
            (Duration::from_secs(2), 4, StatusCode::BAD_GATEWAY),
            (Duration::from_millis(50), 1024, StatusCode::GATEWAY_TIMEOUT),
        ] {
            let response = send_once(
                &client(),
                &url,
                HeaderMap::new(),
                Bytes::new(),
                timeout,
                limit,
            )
            .await;
            assert_eq!(response.status(), expected);
            assert_eq!(response.headers()["x-request-id"], "partial-image-id");
            assert_eq!(response.headers()["x-yuanheng-response-source"], "local");
            assert_eq!(response.headers()["x-yuanheng-upstream-status"], "200");
        }
        assert_eq!(count.load(Ordering::SeqCst), 2);
        task.abort();
    }
}
