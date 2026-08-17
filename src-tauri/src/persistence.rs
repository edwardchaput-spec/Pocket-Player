use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::{
    error::{AppError, AppResult},
    navidrome::Song,
    profile::SafeProfile,
};

const STORE_FILE: &str = "settings.json";
const PROFILE_KEY: &str = "currentProfile";
const PLAYER_KEY: &str = "player";
const QUEUE_KEY: &str = "queue";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSettings {
    pub volume: f64,
    pub muted: bool,
    #[serde(default = "default_visualizer")]
    pub visualizer: String,
    #[serde(default = "default_visualizer_quality")]
    pub visualizer_quality: u8,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_density")]
    pub density: String,
    #[serde(default = "default_notifications")]
    pub notifications: bool,
    #[serde(default)]
    pub close_to_tray: bool,
    #[serde(default = "default_home_sections")]
    pub home_sections: Vec<String>,
    #[serde(default)]
    pub pinned_playlist_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedQueueItem {
    pub occurrence_id: String,
    pub playback_session_id: String,
    pub track: Song,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub items: Vec<PersistedQueueItem>,
    pub current_index: Option<usize>,
    pub position: f64,
    pub repeat_mode: String,
    pub shuffle_mode: bool,
}

impl Default for PlayerSettings {
    fn default() -> Self {
        Self {
            volume: 0.8,
            muted: false,
            visualizer: default_visualizer(),
            visualizer_quality: default_visualizer_quality(),
            theme: default_theme(),
            density: default_density(),
            notifications: default_notifications(),
            close_to_tray: false,
            home_sections: default_home_sections(),
            pinned_playlist_ids: Vec::new(),
        }
    }
}

pub fn load_profile<R: Runtime>(app: &AppHandle<R>) -> AppResult<Option<SafeProfile>> {
    let store = app.store(STORE_FILE).map_err(|_| AppError::storage())?;
    store
        .get(PROFILE_KEY)
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| AppError::new("CORRUPT_SETTINGS", "The saved profile is invalid.", false))
}

pub fn save_profile<R: Runtime>(app: &AppHandle<R>, profile: &SafeProfile) -> AppResult<()> {
    let store = app.store(STORE_FILE).map_err(|_| AppError::storage())?;
    let value = serde_json::to_value(profile).map_err(|_| AppError::storage())?;
    store.set(PROFILE_KEY, value);
    store.save().map_err(|_| AppError::storage())
}

pub fn clear_profile<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let store = app.store(STORE_FILE).map_err(|_| AppError::storage())?;
    store.delete(PROFILE_KEY);
    store.save().map_err(|_| AppError::storage())
}

pub fn load_player_settings<R: Runtime>(app: &AppHandle<R>) -> PlayerSettings {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(PLAYER_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .filter(|settings: &PlayerSettings| (0.0..=1.0).contains(&settings.volume))
        .unwrap_or_default()
}

pub fn save_player_settings<R: Runtime>(
    app: &AppHandle<R>,
    settings: &PlayerSettings,
) -> AppResult<()> {
    if !(0.0..=1.0).contains(&settings.volume) {
        return Err(AppError::invalid_input("Volume must be between 0 and 1."));
    }
    if !matches!(
        settings.visualizer.as_str(),
        "bars" | "mirror" | "wave" | "circular" | "ambient"
    ) || !(1..=3).contains(&settings.visualizer_quality)
        || !matches!(settings.theme.as_str(), "dark" | "light" | "system")
        || !matches!(settings.density.as_str(), "comfortable" | "compact")
        || !valid_home_sections(&settings.home_sections)
        || settings.pinned_playlist_ids.len() > 100
        || settings
            .pinned_playlist_ids
            .iter()
            .any(|id| id.is_empty() || id.len() > 512)
    {
        return Err(AppError::invalid_input("The player settings are invalid."));
    }
    let store = app.store(STORE_FILE).map_err(|_| AppError::storage())?;
    store.set(
        PLAYER_KEY,
        serde_json::to_value(settings).map_err(|_| AppError::storage())?,
    );
    store.save().map_err(|_| AppError::storage())
}

fn default_visualizer() -> String {
    "bars".to_owned()
}

fn default_visualizer_quality() -> u8 {
    2
}

fn default_theme() -> String {
    "dark".to_owned()
}

fn default_density() -> String {
    "comfortable".to_owned()
}

fn default_notifications() -> bool {
    true
}

fn default_home_sections() -> Vec<String> {
    [
        "newest",
        "trackMix",
        "recent",
        "frequent",
        "starredAlbums",
        "random",
        "favouriteTracks",
        "pinnedPlaylists",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect()
}

fn valid_home_sections(sections: &[String]) -> bool {
    if sections.len() > 8 {
        return false;
    }
    let mut unique = std::collections::HashSet::new();
    sections.iter().all(|section| {
        matches!(
            section.as_str(),
            "newest"
                | "trackMix"
                | "recent"
                | "frequent"
                | "starredAlbums"
                | "random"
                | "favouriteTracks"
                | "pinnedPlaylists"
        ) && unique.insert(section)
    })
}

pub fn load_queue_snapshot<R: Runtime>(app: &AppHandle<R>) -> Option<QueueSnapshot> {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(QUEUE_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .filter(valid_queue_snapshot)
}

pub fn save_queue_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    snapshot: &QueueSnapshot,
) -> AppResult<()> {
    if !valid_queue_snapshot(snapshot) {
        return Err(AppError::invalid_input("The queue snapshot is invalid."));
    }
    let store = app.store(STORE_FILE).map_err(|_| AppError::storage())?;
    store.set(
        QUEUE_KEY,
        serde_json::to_value(snapshot).map_err(|_| AppError::storage())?,
    );
    store.save().map_err(|_| AppError::storage())
}

pub fn clear_queue_snapshot<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let store = app.store(STORE_FILE).map_err(|_| AppError::storage())?;
    store.delete(QUEUE_KEY);
    store.save().map_err(|_| AppError::storage())
}

fn valid_queue_snapshot(snapshot: &QueueSnapshot) -> bool {
    snapshot.items.len() <= 10_000
        && snapshot.position.is_finite()
        && snapshot.position >= 0.0
        && snapshot
            .current_index
            .is_none_or(|index| index < snapshot.items.len())
        && matches!(snapshot.repeat_mode.as_str(), "off" | "queue" | "one")
        && snapshot.items.iter().all(|item| {
            !item.occurrence_id.is_empty()
                && item.occurrence_id.len() <= 100
                && !item.playback_session_id.is_empty()
                && item.playback_session_id.len() <= 100
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_out_of_range_queue_index() {
        let snapshot = QueueSnapshot {
            items: Vec::new(),
            current_index: Some(0),
            position: 0.0,
            repeat_mode: "off".to_owned(),
            shuffle_mode: false,
        };
        assert!(!valid_queue_snapshot(&snapshot));
    }

    #[test]
    fn home_sections_must_be_known_and_unique() {
        assert!(valid_home_sections(&default_home_sections()));
        assert!(!valid_home_sections(&[
            "newest".to_owned(),
            "newest".to_owned()
        ]));
        assert!(!valid_home_sections(&["unknown".to_owned()]));
    }
}
