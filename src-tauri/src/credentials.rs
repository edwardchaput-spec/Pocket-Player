use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::Mutex;
use zeroize::Zeroizing;

#[cfg(any(windows, target_os = "android"))]
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
/// Windows, the Android Keystore on Android (ADR-012), and process memory on
/// any other target.
pub fn platform_store<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) -> Arc<dyn CredentialStore> {
    #[cfg(windows)]
    {
        WindowsCredentialStore::new()
    }
    #[cfg(target_os = "android")]
    {
        AndroidCredentialStore::new(_app.clone())
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        SessionCredentialStore::new()
    }
}

/// Process-memory-only store, used where no platform store exists. Secrets are zeroized on drop and never written
/// to disk, so a restart always requires the password again.
#[cfg_attr(any(windows, target_os = "android"), allow(dead_code))]
#[derive(Default)]
pub struct SessionCredentialStore {
    values: Mutex<std::collections::HashMap<String, Zeroizing<String>>>,
}

#[cfg_attr(any(windows, target_os = "android"), allow(dead_code))]
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

/// Android Keystore strategy (ADR-012). The Kotlin side encrypts with a
/// non-exportable AES-GCM key; Rust only ever sees the plaintext in memory.
#[cfg(target_os = "android")]
pub struct AndroidCredentialStore<R: tauri::Runtime> {
    app: tauri::AppHandle<R>,
    access: Mutex<()>,
}

#[cfg(target_os = "android")]
impl<R: tauri::Runtime> AndroidCredentialStore<R> {
    pub fn new(app: tauri::AppHandle<R>) -> Arc<Self> {
        Arc::new(Self {
            app,
            access: Mutex::new(()),
        })
    }

    /// Runs a blocking Keystore call off the async executor.
    async fn call<T: Send + 'static>(
        &self,
        work: impl FnOnce(
            &tauri_plugin_pocket_playback::SecureStore<R>,
        ) -> Result<T, tauri_plugin_pocket_playback::SecureStoreError>
        + Send
        + 'static,
    ) -> AppResult<T> {
        use tauri::Manager;
        let _guard = self.access.lock().await;
        let app = self.app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let store = app
                .try_state::<tauri_plugin_pocket_playback::SecureStore<R>>()
                .ok_or_else(AppError::credential)?;
            work(store.inner()).map_err(|_| AppError::credential())
        })
        .await
        .map_err(|_| AppError::credential())?
    }
}

#[cfg(target_os = "android")]
#[async_trait]
impl<R: tauri::Runtime> CredentialStore for AndroidCredentialStore<R> {
    async fn get(&self, account: &str) -> AppResult<Option<Zeroizing<String>>> {
        let account = account.to_owned();
        self.call(move |store| store.get(&account))
            .await
            .map(|secret| secret.map(Zeroizing::new))
    }

    async fn set(&self, account: &str, secret: &str) -> AppResult<()> {
        let account = account.to_owned();
        let secret = Zeroizing::new(secret.to_owned());
        self.call(move |store| store.set(&account, &secret)).await
    }

    async fn delete(&self, account: &str) -> AppResult<()> {
        let account = account.to_owned();
        self.call(move |store| store.delete(&account)).await
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

    /// ADR-012: the Android Keystore bridge must stay Rust-only. Tauri rejects
    /// webview IPC to a plugin unless a capability grants it, so no capability
    /// may ever mention the secure-store plugin.
    #[test]
    fn secure_store_plugin_is_never_granted_to_a_webview() {
        for capability in [
            include_str!("../capabilities/default.json"),
            include_str!("../capabilities/android.json"),
            include_str!("../capabilities/mini-player.json"),
        ] {
            assert!(!capability.contains("pocket-secure-store"));
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
