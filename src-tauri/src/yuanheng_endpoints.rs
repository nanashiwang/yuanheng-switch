//! First-party endpoints. Legacy CN URLs are recognized for migration only;
//! requests are never retried across origins with credentials.
pub(crate) const BASE_URL: &str = "https://meta-api.vip";
pub(crate) const API_URL: &str = "https://meta-api.vip/v1";
pub(crate) const CHAT_URL: &str = "https://meta-api.vip/v1/chat/completions";
pub(crate) const TOPUP_URL: &str = "https://meta-api.vip/console/topup";
pub(crate) const PULSE_URL: &str = "https://meta-api.vip/console/pulse";
pub(crate) const RELEASE_MANIFEST_URL: &str = "https://meta-api.vip/desktop/update/latest.json";
pub(crate) const COOKIE_DOMAIN: &str = "meta-api.vip";

/// Exact origins and paths only. Do not accept domain suffixes, userinfo,
/// alternate ports, query strings or fragments as a managed credential source.
pub(crate) fn is_managed_endpoint(raw: &str, paths: &[&str], allow_legacy: bool) -> bool {
    let Ok(url) = url::Url::parse(raw) else {
        return false;
    };
    url.scheme() == "https"
        && (url.host_str() == Some(COOKIE_DOMAIN)
            || (allow_legacy && url.host_str() == Some("cn.meta-api.vip")))
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && paths.contains(&url.path().trim_end_matches('/'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_current_or_explicit_legacy_endpoints() {
        for path in ["", "/", "/v1", "/v1/"] {
            assert!(is_managed_endpoint(
                &format!("{BASE_URL}{path}"),
                &["", "/v1"],
                false
            ));
            let old = format!("https://cn.meta-api.vip{path}");
            assert!(is_managed_endpoint(&old, &["", "/v1"], true));
            assert!(!is_managed_endpoint(&old, &["", "/v1"], false));
        }
        for url in [
            "http://meta-api.vip/v1",
            "https://meta-api.vip.evil.test/v1",
            "https://evil-meta-api.vip/v1",
            "https://meta-api.vip@evil.test/v1",
            "https://user@meta-api.vip/v1",
            "https://meta-api.vip:444/v1",
            "https://meta-api.vip/v1?next=evil",
            "https://meta-api.vip/v1#fragment",
            "https://meta-api.vip/not-api",
            "https://meta-vip.api/v1",
        ] {
            assert!(!is_managed_endpoint(url, &["", "/v1"], true), "{url}");
        }
    }
}
