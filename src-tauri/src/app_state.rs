use std::sync::{Arc, Mutex};

use tokio::sync::RwLock;

use crate::{
    credentials::CredentialStore,
    library_index::LibraryIndex,
    local_data::LocalDatabase,
    media_proxy::{ProxyHandle, SharedClient},
    navidrome::NavidromeClient,
    profile::SafeProfile,
    scrobble::ScrobbleRegistry,
};

pub struct AppState {
    pub credentials: Arc<dyn CredentialStore>,
    pub active_client: SharedClient,
    pub active_profile: RwLock<Option<SafeProfile>>,
    pub scrobbles: Arc<ScrobbleRegistry>,
    pub library_index: Arc<LibraryIndex>,
    pub database: Arc<LocalDatabase>,
    pub proxy_base_url: String,
    proxy: Mutex<Option<ProxyHandle>>,
}

impl AppState {
    pub fn new(
        credentials: Arc<dyn CredentialStore>,
        active_client: SharedClient,
        proxy: ProxyHandle,
        database: Arc<LocalDatabase>,
    ) -> Self {
        Self {
            credentials,
            active_client,
            active_profile: RwLock::new(None),
            scrobbles: ScrobbleRegistry::new(),
            library_index: Arc::new(LibraryIndex::new(database.clone())),
            database,
            proxy_base_url: proxy.base_url.clone(),
            proxy: Mutex::new(Some(proxy)),
        }
    }

    pub async fn client(&self) -> Option<NavidromeClient> {
        self.active_client.read().await.clone()
    }

    pub async fn set_session(&self, client: NavidromeClient, profile: SafeProfile) {
        self.library_index.clear().await;
        let _ = self.library_index.activate(&profile.profile_id).await;
        *self.active_client.write().await = Some(client);
        *self.active_profile.write().await = Some(profile);
    }

    pub async fn clear_session(&self) {
        *self.active_client.write().await = None;
        *self.active_profile.write().await = None;
        self.scrobbles.clear().await;
        self.library_index.clear().await;
    }

    pub fn shutdown_proxy(&self) {
        if let Ok(mut guard) = self.proxy.lock()
            && let Some(mut proxy) = guard.take()
        {
            proxy.shutdown();
        }
    }
}
