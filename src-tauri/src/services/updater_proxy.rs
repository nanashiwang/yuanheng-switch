use url::Url;

/// Resolve the proxy used by application update checks and downloads.
/// The explicit YuanHeng proxy setting wins; otherwise use the OS proxy.
pub fn resolve_updater_proxy() -> Option<Url> {
    if let Some(url) = crate::proxy::http_client::get_current_proxy_url() {
        return parse_and_log_proxy(&url, "configured");
    }

    if let Some(url) = detect_environment_proxy() {
        if let Some(proxy) = parse_and_log_proxy(&url, "environment") {
            return Some(proxy);
        }
    }

    detect_system_proxy().and_then(|url| parse_and_log_proxy(&url, "system"))
}

fn parse_and_log_proxy(raw: &str, source: &str) -> Option<Url> {
    let proxy = parse_proxy_url(raw);
    match proxy {
        Some(proxy) => {
            log::info!(
                "[Updater] Using {source} proxy: {}",
                crate::proxy::http_client::mask_url(proxy.as_str())
            );
            Some(proxy)
        }
        None => {
            log::warn!("[Updater] Ignoring invalid {source} proxy URL");
            None
        }
    }
}

fn parse_proxy_url(raw: &str) -> Option<Url> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }

    let candidate = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("http://{raw}")
    };
    let url = Url::parse(&candidate).ok()?;
    if url.host_str().is_some() {
        Some(url)
    } else {
        None
    }
}

fn detect_environment_proxy() -> Option<String> {
    [
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ]
    .into_iter()
    .find_map(|key| {
        std::env::var(key)
            .ok()
            .filter(|value| !value.trim().is_empty())
    })
}

#[cfg(target_os = "macos")]
fn detect_system_proxy() -> Option<String> {
    let output = std::process::Command::new("/usr/sbin/scutil")
        .arg("--proxy")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_scutil_proxy(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "macos")]
fn parse_scutil_proxy(output: &str) -> Option<String> {
    let mut values = std::collections::HashMap::new();
    for line in output.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        values.insert(key.trim(), value.trim());
    }

    if values.get("HTTPSEnable") == Some(&"1") {
        if let (Some(host), Some(port)) = (values.get("HTTPSProxy"), values.get("HTTPSPort")) {
            return Some(format_proxy_host("http", host, port));
        }
    }
    if values.get("HTTPEnable") == Some(&"1") {
        if let (Some(host), Some(port)) = (values.get("HTTPProxy"), values.get("HTTPPort")) {
            return Some(format_proxy_host("http", host, port));
        }
    }
    if values.get("SOCKSEnable") == Some(&"1") {
        if let (Some(host), Some(port)) = (values.get("SOCKSProxy"), values.get("SOCKSPort")) {
            return Some(format_proxy_host("socks5", host, port));
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn detect_system_proxy() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let internet_settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let enabled: u32 = internet_settings.get_value("ProxyEnable").ok()?;
    if enabled == 0 {
        return None;
    }
    let server: String = internet_settings.get_value("ProxyServer").ok()?;
    parse_windows_proxy_server(&server)
}

#[cfg(target_os = "windows")]
fn parse_windows_proxy_server(server: &str) -> Option<String> {
    let server = server.trim();
    if server.is_empty() {
        return None;
    }
    if !server.contains('=') {
        return Some(normalize_proxy_scheme("http", server));
    }

    let mut http = None;
    let mut https = None;
    let mut socks = None;
    for entry in server.split(';') {
        let Some((scheme, address)) = entry.split_once('=') else {
            continue;
        };
        match scheme.trim().to_ascii_lowercase().as_str() {
            "https" => https = Some(normalize_proxy_scheme("http", address)),
            "http" => http = Some(normalize_proxy_scheme("http", address)),
            "socks" | "socks5" => socks = Some(normalize_proxy_scheme("socks5", address)),
            _ => {}
        }
    }
    https.or(http).or(socks)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn detect_system_proxy() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
fn format_proxy_host(scheme: &str, host: &str, port: &str) -> String {
    let host = host.trim();
    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    format!("{scheme}://{host}:{}", port.trim())
}

#[cfg(target_os = "windows")]
fn normalize_proxy_scheme(scheme: &str, address: &str) -> String {
    let address = address.trim();
    if address.contains("://") {
        address.to_string()
    } else {
        format!("{scheme}://{address}")
    }
}

#[cfg(test)]
mod tests {
    use super::parse_proxy_url;

    #[test]
    fn normalizes_proxy_without_scheme() {
        assert_eq!(
            parse_proxy_url("127.0.0.1:1082")
                .expect("proxy URL")
                .as_str(),
            "http://127.0.0.1:1082/"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parses_enabled_macos_https_proxy() {
        let output = r#"
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 1082
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 1082
  HTTPSProxy : 127.0.0.1
}
"#;
        assert_eq!(
            super::parse_scutil_proxy(output).as_deref(),
            Some("http://127.0.0.1:1082")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn parses_protocol_specific_windows_proxy() {
        assert_eq!(
            super::parse_windows_proxy_server(
                "http=127.0.0.1:7890;https=127.0.0.1:7891;socks=127.0.0.1:7892"
            )
            .as_deref(),
            Some("http://127.0.0.1:7891")
        );
    }
}
