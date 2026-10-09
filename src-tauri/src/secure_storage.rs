//! 系统凭据库封装。
//!
//! 会话 Cookie、访问令牌等可直接用于认证的值不得写入 SQLite。这里统一使用
//! macOS Keychain、Windows Credential Manager 或 Linux Secret Service 保存。

#[cfg(all(not(test), not(target_os = "macos")))]
const SERVICE_NAME: &str = "com.yuanheng.switch";

#[cfg(all(not(test), not(target_os = "macos")))]
pub(crate) fn get_secret(key: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|error| format!("创建系统凭据条目失败: {error}"))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("读取系统凭据失败: {error}")),
    }
}

#[cfg(all(not(test), not(target_os = "macos")))]
pub(crate) fn set_secret(key: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|error| format!("创建系统凭据条目失败: {error}"))?;
    entry
        .set_password(value)
        .map_err(|error| format!("写入系统凭据失败: {error}"))
}

#[cfg(all(not(test), not(target_os = "macos")))]
pub(crate) fn delete_secret(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|error| format!("创建系统凭据条目失败: {error}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("删除系统凭据失败: {error}")),
    }
}

#[cfg(any(target_os = "macos", test))]
mod cache;

#[cfg(all(target_os = "macos", not(test)))]
mod macos {
    use super::cache::SecretCache;
    use crate::macos_keychain::{storage_error, with_access};
    use std::sync::{Mutex, OnceLock};

    const SERVICE: &str = "com.yuanheng.switch";
    static CACHE: OnceLock<Mutex<SecretCache>> = OnceLock::new();

    fn cache() -> Result<std::sync::MutexGuard<'static, SecretCache>, String> {
        CACHE
            .get_or_init(|| Mutex::new(SecretCache::default()))
            .lock()
            .map_err(|_| "系统凭据缓存不可用".into())
    }

    fn entry(key: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, key).map_err(storage_error)
    }

    fn read(key: &str) -> Result<Option<String>, String> {
        match entry(key)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(storage_error(error)),
        }
    }

    pub(crate) fn get_secret(key: &str) -> Result<Option<String>, String> {
        cache()?.get(key, || with_access(false, || read(key)))
    }

    pub(crate) fn verify_secret(key: &str, expected: &str) -> Result<bool, String> {
        // Migration must verify the platform store, never its in-memory copy.
        with_access(false, || Ok(read(key)?.as_deref() == Some(expected)))
    }

    pub(crate) fn set_secret(key: &str, value: &str) -> Result<(), String> {
        cache()?.set(key, value, || {
            with_access(false, || {
                // keyring's macOS setter retries *any* read failure as an add,
                // hiding denied access behind a duplicate-item error. Preserve
                // the recoverable denial before attempting to mutate anything.
                read(key)?;
                entry(key)?.set_password(value).map_err(storage_error)
            })
        })
    }

    pub(crate) fn delete_secret(key: &str) -> Result<(), String> {
        cache()?.delete(key, || {
            with_access(false, || match entry(key)?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(error) => Err(storage_error(error)),
            })
        })
    }

    pub(crate) fn authorize_access(keys: &[&str]) -> Result<(), String> {
        // Only the explicit recovery command calls this with fixed own keys.
        cache()?.authorize(keys, |key| with_access(true, || read(key)))
    }
}

#[cfg(all(target_os = "macos", not(test)))]
pub(crate) use macos::{authorize_access, delete_secret, get_secret, set_secret, verify_secret};

#[cfg(any(not(target_os = "macos"), test))]
pub(crate) fn authorize_access(_keys: &[&str]) -> Result<(), String> {
    Ok(())
}

#[cfg(any(not(target_os = "macos"), test))]
pub(crate) fn verify_secret(key: &str, expected: &str) -> Result<bool, String> {
    Ok(get_secret(key)?.as_deref() == Some(expected))
}

// 单元测试不能依赖开发机的真实 Keychain/Secret Service。测试替身只存在于
// test cfg，生产构建始终走平台凭据库。
#[cfg(test)]
mod test_backend {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    static SECRETS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

    fn secrets() -> &'static Mutex<HashMap<String, String>> {
        SECRETS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    pub(crate) fn get_secret(key: &str) -> Result<Option<String>, String> {
        Ok(secrets()
            .lock()
            .map_err(|_| "测试凭据库锁已中毒".to_string())?
            .get(key)
            .cloned())
    }

    pub(crate) fn set_secret(key: &str, value: &str) -> Result<(), String> {
        secrets()
            .lock()
            .map_err(|_| "测试凭据库锁已中毒".to_string())?
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    pub(crate) fn delete_secret(key: &str) -> Result<(), String> {
        secrets()
            .lock()
            .map_err(|_| "测试凭据库锁已中毒".to_string())?
            .remove(key);
        Ok(())
    }

    pub(super) fn clear() {
        if let Ok(mut secrets) = secrets().lock() {
            secrets.clear();
        }
    }
}

#[cfg(test)]
pub(crate) use test_backend::{delete_secret, get_secret, set_secret};

#[cfg(test)]
pub(crate) fn clear_for_tests() {
    test_backend::clear();
}
