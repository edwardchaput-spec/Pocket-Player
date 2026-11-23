//! Native Android playback output for Pocket Player (ADR-011).
//!
//! On Android this registers the Kotlin `PlaybackPlugin`, which owns a Media3
//! `MediaLibraryService` (ExoPlayer, media notification, media session, and the
//! Android Auto browse tree). The webview remains the queue authority and drives
//! the service through plugin commands. On other platforms the plugin is inert.
//!
//! It also provides the Android Keystore credential bridge (ADR-012) as a
//! separate `pocket-secure-store` plugin. That plugin has no permissions and no
//! capability grants it, so the webview cannot reach it; only Rust calls it,
//! through [`SecureStore`].

use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.pocketplayer.playback";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("pocket-playback")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin(PLUGIN_IDENTIFIER, "PlaybackPlugin")?;
            Ok(())
        })
        .build()
}

/// Registers the Rust-only Android Keystore bridge. Inert on other platforms.
pub fn init_secure_store<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("pocket-secure-store")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle =
                    _api.register_android_plugin(PLUGIN_IDENTIFIER, "SecureStorePlugin")?;
                _app.manage(SecureStore(handle));
            }
            Ok(())
        })
        .build()
}

/// Keystore-backed password storage, reachable only from Rust. Calls block
/// until the Kotlin side answers, so run them off the async executor.
#[cfg(target_os = "android")]
pub struct SecureStore<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "android")]
mod secure_store {
    // Kotlin answers `set` and `delete` with no data (JSON `null`), so accept
    // any reply body rather than a specific shape.
    use serde::{Deserialize, Serialize, de::IgnoredAny};
    use tauri::Runtime;

    use super::SecureStore;

    #[derive(Serialize)]
    struct Account<'a> {
        account: &'a str,
    }

    #[derive(Serialize)]
    struct Write<'a> {
        account: &'a str,
        secret: &'a str,
    }

    #[derive(Deserialize)]
    struct Read {
        #[serde(default)]
        secret: Option<String>,
    }

    /// Opaque failure; never carries secret material.
    #[derive(Debug)]
    pub struct SecureStoreError;

    impl<R: Runtime> SecureStore<R> {
        pub fn get(&self, account: &str) -> Result<Option<String>, SecureStoreError> {
            self.0
                .run_mobile_plugin::<Read>("get", Account { account })
                .map(|read| read.secret)
                .map_err(|_| SecureStoreError)
        }

        pub fn set(&self, account: &str, secret: &str) -> Result<(), SecureStoreError> {
            self.0
                .run_mobile_plugin::<IgnoredAny>("set", Write { account, secret })
                .map(|_| ())
                .map_err(|_| SecureStoreError)
        }

        pub fn delete(&self, account: &str) -> Result<(), SecureStoreError> {
            self.0
                .run_mobile_plugin::<IgnoredAny>("delete", Account { account })
                .map(|_| ())
                .map_err(|_| SecureStoreError)
        }
    }
}

#[cfg(target_os = "android")]
pub use secure_store::SecureStoreError;
