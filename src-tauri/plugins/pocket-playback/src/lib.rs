//! Native Android playback output for Pocket Player (ADR-011).
//!
//! On Android this registers the Kotlin `PlaybackPlugin`, which owns a Media3
//! `MediaLibraryService` (ExoPlayer, media notification, media session, and the
//! Android Auto browse tree). The webview remains the queue authority and drives
//! the service through plugin commands. On other platforms the plugin is inert.

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
