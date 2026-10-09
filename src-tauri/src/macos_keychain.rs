//! Synchronous, serialized Keychain access. Never hold this guard across await.
//! The interaction flag is process-wide, so both own and external credentials
//! use this boundary. A denied read never changes the item's access controls.

use security_framework::item::{ItemClass, ItemSearchOptions, Limit, SearchResult};
use security_framework::os::macos::keychain::SecKeychain;
use std::sync::Mutex;

static ACCESS: Mutex<()> = Mutex::new(());

pub(crate) const ACCESS_REQUIRED: &str = "YUANHENG_CREDENTIAL_ACCESS_REQUIRED";

pub(crate) fn access_error() -> String {
    format!(
        "{ACCESS_REQUIRED}: macOS 暂时无法读取本机登录信息，请点击“恢复本机登录”后按系统提示授权。"
    )
}

pub(crate) fn with_access<T>(
    allow_prompt: bool,
    operation: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let _access = ACCESS.lock().map_err(|_| "系统凭据访问锁不可用")?;
    // Preserve an already-disabled state rather than blindly reenabling it.
    let was_allowed =
        SecKeychain::user_interaction_allowed().map_err(|_| "无法检查系统凭据访问状态")?;
    let _interaction = if !allow_prompt && was_allowed {
        Some(SecKeychain::disable_user_interaction().map_err(|_| "无法安全读取系统凭据")?)
    } else {
        None
    };
    operation()
}

pub(crate) fn read_external(service: &str, account: Option<&str>) -> Option<String> {
    with_access(false, || {
        let mut search = ItemSearchOptions::new();
        search
            .class(ItemClass::generic_password())
            .service(service)
            .load_data(true)
            .limit(Limit::Max(1));
        if let Some(account) = account {
            search.account(account);
        }
        let items = search.search().map_err(|_| "外部凭据不可静默读取")?;
        match items.into_iter().next() {
            Some(SearchResult::Data(bytes)) => {
                String::from_utf8(bytes).map_err(|_| "外部凭据格式无效".to_string())
            }
            _ => Err("外部凭据不可用".into()),
        }
    })
    .ok()
    .filter(|value| !value.trim().is_empty())
}

pub(crate) fn storage_error(error: keyring::Error) -> String {
    match &error {
        keyring::Error::PlatformFailure(inner) | keyring::Error::NoStorageAccess(inner)
            if inner
                .downcast_ref::<security_framework::base::Error>()
                .is_some_and(|error| matches!(error.code(), -25308 | -25315 | -25293 | -128)) =>
        {
            access_error()
        }
        _ => format!("系统凭据访问失败: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_locked_isolated_keychain_fails_without_prompting() {
        use security_framework::os::macos::keychain::CreateOptions;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("yuanheng-test.keychain");
        struct Cleanup(std::path::PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::process::Command::new("/usr/bin/security")
                    .arg("delete-keychain")
                    .arg(&self.0)
                    .output();
            }
        }
        let _cleanup = Cleanup(path.clone());
        let keychain = with_access(false, || {
            let keychain = CreateOptions::new()
                .password("isolated-test-only")
                .create(&path)
                .map_err(|e| e.to_string())?;
            keychain
                .add_generic_password("test-only", "test-account", b"not-a-real-secret")
                .map_err(|e| e.to_string())?;
            let (secret, _) = keychain
                .find_generic_password("test-only", "test-account")
                .map_err(|e| e.to_string())?;
            assert_eq!(&*secret, b"not-a-real-secret");
            let result = ItemSearchOptions::new()
                .keychains(std::slice::from_ref(&keychain))
                .class(ItemClass::generic_password())
                .service("test-only")
                .account("test-account")
                .load_data(true)
                .limit(Limit::Max(1))
                .search()
                .map_err(|e| e.to_string())?;
            assert!(
                matches!(&result[0], SearchResult::Data(value) if value == b"not-a-real-secret")
            );
            Ok(keychain)
        })
        .unwrap();
        assert!(std::process::Command::new("/usr/bin/security")
            .arg("lock-keychain")
            .arg(&path)
            .status()
            .unwrap()
            .success());
        let start = std::time::Instant::now();
        let result = with_access(false, || {
            keychain
                .find_generic_password("test-only", "test-account")
                .map(|_| ())
                .map_err(|error| storage_error(keyring::Error::PlatformFailure(Box::new(error))))
        });
        assert!(result.unwrap_err().starts_with(ACCESS_REQUIRED));
        with_access(false, || {
            // External subscription reads use SecItemCopyMatching, whereas
            // keyring uses the legacy password API. Both must suppress UI.
            assert!(ItemSearchOptions::new()
                .keychains(std::slice::from_ref(&keychain))
                .class(ItemClass::generic_password())
                .service("test-only")
                .account("test-account")
                .load_data(true)
                .limit(Limit::Max(1))
                .search()
                .is_err());
            Ok(())
        })
        .unwrap();
        assert!(start.elapsed() < std::time::Duration::from_secs(5));
    }

    #[test]
    fn denied_access_has_a_recoverable_error_without_secret_details() {
        for code in [-25308, -25315, -25293, -128] {
            let error = keyring::Error::PlatformFailure(Box::new(
                security_framework::base::Error::from_code(code),
            ));
            assert!(storage_error(error).starts_with(ACCESS_REQUIRED));
        }
        assert!(!storage_error(keyring::Error::NoEntry).starts_with(ACCESS_REQUIRED));
    }

    #[test]
    fn silent_access_disables_ui_and_restores_it_even_on_error() {
        // Tests touch only the process flag, never the user's credentials.
        let result: Result<(), String> = with_access(false, || {
            assert!(!SecKeychain::user_interaction_allowed().unwrap());
            Err("denied".into())
        });
        assert_eq!(result.unwrap_err(), "denied");
        let _access = ACCESS.lock().unwrap();
        assert!(SecKeychain::user_interaction_allowed().unwrap());
        let disabled = SecKeychain::disable_user_interaction().unwrap();
        drop(_access);
        with_access(false, || {
            assert!(!SecKeychain::user_interaction_allowed().unwrap());
            Ok(())
        })
        .unwrap();
        let _access = ACCESS.lock().unwrap();
        assert!(!SecKeychain::user_interaction_allowed().unwrap());
        drop(disabled);
    }
}
