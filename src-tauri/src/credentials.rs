use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

pub const CREDENTIAL_SERVICE: &str = "com.burtonsvilla.navidrome-desktop";

#[async_trait]
pub trait CredentialStore: Send + Sync {
    async fn get(&self, account: &str) -> AppResult<Option<Zeroizing<String>>>;
    async fn set(&self, account: &str, secret: &str) -> AppResult<()>;
    async fn delete(&self, account: &str) -> AppResult<()>;
}

pub struct WindowsCredentialStore {
    access: Mutex<()>,
}

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
