//! 系统凭据库封装。
//!
//! 会话 Cookie、访问令牌等可直接用于认证的值不得写入 SQLite。这里统一使用
//! macOS Keychain、Windows Credential Manager 或 Linux Secret Service 保存。

#[cfg(not(test))]
const SERVICE_NAME: &str = "com.yuanheng.switch";

#[cfg(not(test))]
pub(crate) fn get_secret(key: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|error| format!("创建系统凭据条目失败: {error}"))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("读取系统凭据失败: {error}")),
    }
}

#[cfg(not(test))]
pub(crate) fn set_secret(key: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|error| format!("创建系统凭据条目失败: {error}"))?;
    entry
        .set_password(value)
        .map_err(|error| format!("写入系统凭据失败: {error}"))
}

#[cfg(not(test))]
pub(crate) fn delete_secret(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|error| format!("创建系统凭据条目失败: {error}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("删除系统凭据失败: {error}")),
    }
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
