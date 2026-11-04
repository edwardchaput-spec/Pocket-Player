use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

#[cfg(windows)]
use crate::error::AppError;
use crate::error::AppResult;

#[cfg(windows)]
pub const CREDENTIAL_SERVICE: &str = "com.burtonsvilla.navidrome-desktop";

#[async_trait]
pub trait CredentialStore: Send + Sync {
    async fn get(&self, account: &str) -> AppResult<Option<Zeroizing<String>>>;
    async fn set(&self, account: &str, secret: &str) -> AppResult<()>;
    async fn delete(&self, account: &str) -> AppResult<()>;

    /// Whether secrets survive an application restart. Login forces
    /// `remember_credential` off when this is false so the UI never claims
    /// a password was remembered when it was not.
    fn is_persistent(&self) -> bool {
        true
    }
}

/// Returns the platform credential strategy: Windows Credential Manager on
/// Windows, process memory everywhere else (Android) until a reviewed
/// Keystore-backed implementation exists.
pub fn platform_store() -> Arc<dyn CredentialStore> {
    #[cfg(windows)]
    {
        WindowsCredentialStore::new()
    }
    #[cfg(not(windows))]
    {
        SessionCredentialStore::new()
    }
}

/// Process-memory-only store. Secrets are zeroized on drop and never written
/// to disk, so a restart always requires the password again.
#[cfg_attr(windows, allow(dead_code))]
#[derive(Default)]
pub struct SessionCredentialStore {
    values: Mutex<std::collections::HashMap<String, Zeroizing<String>>>,
}

#[cfg_attr(windows, allow(dead_code))]
impl SessionCredentialStore {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
}

#[async_trait]
impl CredentialStore for SessionCredentialStore {
    async fn get(&self, account: &str) -> AppResult<Option<Zeroizing<String>>> {
        Ok(self.values.lock().await.get(account).cloned())
    }

    async fn set(&self, account: &str, secret: &str) -> AppResult<()> {
        self.values
            .lock()
            .await
            .insert(account.to_owned(), Zeroizing::new(secret.to_owned()));
        Ok(())
    }

    async fn delete(&self, account: &str) -> AppResult<()> {
        self.values.lock().await.remove(account);
        Ok(())
    }

    fn is_persistent(&self) -> bool {
        false
    }
}

#[cfg(windows)]
pub struct WindowsCredentialStore {
    access: Mutex<()>,
}

#[cfg(windows)]
impl WindowsCredentialStore {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            access: Mutex::new(()),
        })
    }

    fn entry(account: &str) -> AppResult<keyring::Entry> {
        keyring::Entry::new(CREDENTIAL_SERVICE, account).map_err(|_| AppError::credential())
    }
}

#[cfg(windows)]
#[async_trait]
impl CredentialStore for WindowsCredentialStore {
    async fn get(&self, account: &str) -> AppResult<Option<Zeroizing<String>>> {
        let _guard = self.access.lock().await;
        let entry = Self::entry(account)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(Zeroizing::new(secret))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(AppError::credential()),
        }
    }

    async fn set(&self, account: &str, secret: &str) -> AppResult<()> {
        let _guard = self.access.lock().await;
        Self::entry(account)?
            .set_password(secret)
            .map_err(|_| AppError::credential())
    }

    async fn delete(&self, account: &str) -> AppResult<()> {
        let _guard = self.access.lock().await;
        match Self::entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(AppError::credential()),
        }
    }
}

#[cfg(test)]
pub mod fake {
    use std::{collections::HashMap, sync::Arc};

    use async_trait::async_trait;
    use tokio::sync::Mutex;
    use zeroize::Zeroizing;

    use crate::error::AppResult;

    use super::CredentialStore;

    #[derive(Default)]
    pub struct InMemoryCredentialStore {
        values: Mutex<HashMap<String, String>>,
    }

    impl InMemoryCredentialStore {
        pub fn new() -> Arc<Self> {
            Arc::new(Self::default())
        }
    }

    #[async_trait]
    impl CredentialStore for InMemoryCredentialStore {
        async fn get(&self, account: &str) -> AppResult<Option<Zeroizing<String>>> {
            Ok(self
                .values
                .lock()
                .await
                .get(account)
                .cloned()
                .map(Zeroizing::new))
        }

        async fn set(&self, account: &str, secret: &str) -> AppResult<()> {
            self.values
                .lock()
                .await
                .insert(account.to_owned(), secret.to_owned());
            Ok(())
        }

        async fn delete(&self, account: &str) -> AppResult<()> {
            self.values.lock().await.remove(account);
            Ok(())
        }
    }

    #[tokio::test]
    async fn session_store_is_not_persistent_and_round_trips() {
        let store = super::SessionCredentialStore::new();
        assert!(!store.is_persistent());
        store.set("profile-a", "secret").await.expect("write");
        assert_eq!(
            store
                .get("profile-a")
                .await
                .expect("read")
                .as_deref()
                .map(String::as_str),
            Some("secret")
        );
        store.delete("profile-a").await.expect("delete");
        assert!(store.get("profile-a").await.expect("read").is_none());
    }

    #[tokio::test]
    async fn fake_store_supports_isolated_secret_lifecycle() {
        let store = InMemoryCredentialStore::new();
        assert!(store.get("profile-a").await.expect("read").is_none());
        store
            .set("profile-a", "temporary test password")
            .await
            .expect("write");
        let value = store.get("profile-a").await.expect("read");
        assert_eq!(
            value.as_ref().map(|secret| secret.as_str()),
            Some("temporary test password")
        );
        store.delete("profile-a").await.expect("delete");
        assert!(store.get("profile-a").await.expect("read").is_none());
    }
}
