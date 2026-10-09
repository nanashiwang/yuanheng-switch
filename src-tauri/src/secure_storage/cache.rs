//! Values already obtained with Keychain permission live only in this process.
//! All access is serialized by the caller, including native reads and writes.
use std::collections::HashMap;

#[derive(Default)]
pub(super) struct SecretCache(HashMap<String, String>);

impl SecretCache {
    pub(super) fn get(
        &mut self,
        key: &str,
        read: impl FnOnce() -> Result<Option<String>, String>,
    ) -> Result<Option<String>, String> {
        if let Some(value) = self.0.get(key) {
            return Ok(Some(value.clone()));
        }
        let value = read()?;
        if let Some(value) = &value {
            self.0.insert(key.into(), value.clone());
        }
        Ok(value)
    }

    pub(super) fn set(
        &mut self,
        key: &str,
        value: &str,
        write: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        self.0.remove(key);
        write()?;
        self.0.insert(key.into(), value.into());
        Ok(())
    }

    pub(super) fn delete(
        &mut self,
        key: &str,
        delete: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        self.0.remove(key);
        delete()
    }

    pub(super) fn authorize(
        &mut self,
        keys: &[&str],
        mut read: impl FnMut(&str) -> Result<Option<String>, String>,
    ) -> Result<(), String> {
        let mut recovered = HashMap::new();
        for key in keys {
            if let Some(value) = read(key)? {
                recovered.insert((*key).to_string(), value);
            }
        }
        // Denial doesn't publish a partially recovered account.
        for key in keys {
            self.0.remove(*key);
        }
        self.0.extend(recovered);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorized_value_is_reused_without_reprompting() {
        let mut cache = SecretCache::default();
        cache
            .authorize(&["session"], |_| Ok(Some("test-session".into())))
            .unwrap();
        assert_eq!(
            cache
                .get("session", || panic!("must not reread"))
                .unwrap()
                .as_deref(),
            Some("test-session")
        );
        cache.set("session", "new-session", || Ok(())).unwrap();
        assert_eq!(
            cache
                .get("session", || panic!("must not reread"))
                .unwrap()
                .as_deref(),
            Some("new-session")
        );
        cache.delete("session", || Ok(())).unwrap();
        assert!(cache.get("session", || Ok(None)).unwrap().is_none());
    }

    #[test]
    fn errors_are_not_cached_and_partial_authorization_is_not_published() {
        let mut cache = SecretCache::default();
        assert!(cache.get("session", || Err("denied".into())).is_err());
        assert!(cache
            .authorize(&["session", "token"], |key| {
                if key == "token" {
                    Err("denied".into())
                } else {
                    Ok(Some("test-session".into()))
                }
            })
            .is_err());
        assert!(cache.get("session", || Ok(None)).unwrap().is_none());
    }

    #[test]
    fn failed_mutations_evict_old_credentials() {
        let mut cache = SecretCache::default();
        cache.set("token", "old", || Ok(())).unwrap();
        assert!(cache.set("token", "new", || Err("locked".into())).is_err());
        assert!(cache.get("token", || Ok(None)).unwrap().is_none());
        cache.set("session", "old", || Ok(())).unwrap();
        assert!(cache.delete("session", || Err("locked".into())).is_err());
        assert!(cache.get("session", || Ok(None)).unwrap().is_none());
    }
}
