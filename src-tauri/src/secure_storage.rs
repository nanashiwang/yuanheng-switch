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
    #[cfg(test)]
    if VERIFICATION_BLOCKED.with(|blocked| blocked.get()) {
        return Err("测试系统凭据回读被拒绝".into());
    }
    Ok(get_secret(key)?.as_deref() == Some(expected))
}

#[cfg(test)]
thread_local! {
    static VERIFICATION_BLOCKED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

#[cfg(test)]
pub(crate) fn block_verification_for_tests(blocked: bool) {
    VERIFICATION_BLOCKED.with(|state| state.set(blocked));
}

// 单元测试不能依赖开发机的真实 Keychain/Secret Service。测试替身只存在于
// test cfg，生产构建始终走平台凭据库。
#[cfg(test)]
mod test_backend {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    static SECRETS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

    thread_local! {
        static BLOCKED: std::cell::RefCell<Option<Vec<String>>> = const { std::cell::RefCell::new(None) };
        static DENIED_CALLS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    }

    pub(crate) fn block_access_for_tests(keys: Option<Vec<String>>) {
        BLOCKED.with(|state| *state.borrow_mut() = keys);
        DENIED_CALLS.with(|state| state.set(0));
    }

    pub(crate) fn denied_calls_for_tests() -> usize {
        DENIED_CALLS.with(|state| state.get())
    }

    fn check_access(key: &str) -> Result<(), String> {
        if BLOCKED.with(|state| {
            state
                .borrow()
                .as_ref()
                .is_some_and(|keys| keys.is_empty() || keys.iter().any(|item| item == key))
        }) {
            DENIED_CALLS.with(|state| state.set(state.get() + 1));
            return Err("YUANHENG_CREDENTIAL_ACCESS_REQUIRED: test-only access denied".into());
        }
        Ok(())
    }

    fn secrets() -> &'static Mutex<HashMap<String, String>> {
        SECRETS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    pub(crate) fn get_secret(key: &str) -> Result<Option<String>, String> {
        check_access(key)?;
        Ok(secrets()
            .lock()
            .map_err(|_| "测试凭据库锁已中毒".to_string())?
            .get(key)
            .cloned())
    }

    pub(crate) fn set_secret(key: &str, value: &str) -> Result<(), String> {
        check_access(key)?;
        secrets()
            .lock()
            .map_err(|_| "测试凭据库锁已中毒".to_string())?
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    pub(crate) fn delete_secret(key: &str) -> Result<(), String> {
        check_access(key)?;
        secrets()
            .lock()
            .map_err(|_| "测试凭据库锁已中毒".to_string())?
            .remove(key);
        Ok(())
    }

    pub(super) fn clear() {
        block_access_for_tests(None);
        if let Ok(mut secrets) = secrets().lock() {
            secrets.clear();
        }
    }
}

#[cfg(test)]
pub(crate) use test_backend::{
    block_access_for_tests, delete_secret, denied_calls_for_tests, get_secret, set_secret,
};

#[cfg(test)]
pub(crate) fn clear_for_tests() {
    block_verification_for_tests(false);
    test_backend::clear();
}
