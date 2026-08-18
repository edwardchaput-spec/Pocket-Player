use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_notification::NotificationExt;
use zeroize::Zeroizing;

use crate::{
    app_state::AppState,
    error::{AppError, AppResult},
    library_index::{LibraryIndexStatus, TagSummary, TrackQuery, TrackQueryResult},
    local_data::{ListeningStatistics, PlaybackEventInput},
    mix::{MixInput, MixResult, generate_mix as build_mix},
    navidrome::{
        AlbumDetail, AlbumSummary, ArtistDetail, ArtistSummary, Genre, LyricsList, NavidromeClient,
        PlaylistDetail, PlaylistSummary, SearchResults, Song,
    },
    persistence::{self, PlayerSettings, QueueSnapshot},
    profile::{LoginInput, SafeProfile, normalize_server_url, profile_id},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub profile: SafeProfile,
    pub proxy_base_url: String,
    pub player_settings: PlayerSettings,
    pub queue_snapshot: Option<QueueSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupView {
    pub session: Option<SessionView>,
    pub saved_profile: Option<SafeProfile>,
    pub restoration_error: Option<AppError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleInput {
    pub playback_session_id: String,
    pub track_id: String,
    pub submission: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsExport {
    pub path: String,
}

#[tauri::command]
pub async fn restore_session<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> AppResult<StartupView> {
    let player_settings = persistence::load_player_settings(&app);
    let profile = match persistence::load_profile(&app) {
        Ok(profile) => profile,
        Err(error) => {
            return Ok(StartupView {
                session: None,
                saved_profile: None,
                restoration_error: Some(error),
            });
        }
    };
    let Some(mut profile) = profile else {
        return Ok(StartupView {
            session: None,
            saved_profile: None,
            restoration_error: None,
        });
    };
    if !profile.remember_credential {
        return Ok(StartupView {
            session: None,
            saved_profile: Some(profile),
            restoration_error: None,
        });
    }
    let Some(password) = state.credentials.get(&profile.profile_id).await? else {
        return Ok(StartupView {
            session: None,
            saved_profile: Some(profile),
            restoration_error: Some(AppError::new(
                "CREDENTIAL_MISSING",
                "The remembered Windows credential is missing. Enter the password again.",
                false,
            )),
        });
    };
    let url = match normalize_server_url(&profile.server_url, true) {
        Ok(value) => value.url,
        Err(error) => {
            return Ok(StartupView {
                session: None,
                saved_profile: Some(profile),
                restoration_error: Some(error),
            });
        }
    };
    let client = NavidromeClient::new(url, profile.username.clone(), password)?;
    match client.ping().await {
        Ok(mut server) => {
            server.open_subsonic_capabilities = client
                .get_open_subsonic_extensions()
                .await
                .unwrap_or_default();
            profile.server = server;
            profile.last_successful_connection = Utc::now().to_rfc3339();
            let _ = persistence::save_profile(&app, &profile);
            state.set_session(client, profile.clone()).await;
            Ok(StartupView {
                session: Some(SessionView {
                    profile,
                    proxy_base_url: state.proxy_base_url.clone(),
                    player_settings,
                    queue_snapshot: persistence::load_queue_snapshot(&app),
                }),
                saved_profile: None,
                restoration_error: None,
            })
        }
        Err(error) => Ok(StartupView {
            session: None,
            saved_profile: Some(profile),
            restoration_error: Some(error),
        }),
    }
}

#[tauri::command]
pub async fn login<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    mut input: LoginInput,
) -> AppResult<SessionView> {
    let normalized = normalize_server_url(&input.server_url, input.allow_private_http)?;
    let username = input.username.trim().to_owned();
    if username.is_empty() {
        return Err(AppError::invalid_input("Enter a Navidrome username."));
    }
    if input.password.is_empty() {
        return Err(AppError::invalid_input("Enter a Navidrome password."));
    }
    let password = Zeroizing::new(std::mem::take(&mut input.password));
    let client = NavidromeClient::new(normalized.url.clone(), username.clone(), password.clone())?;
    let mut server = client.ping().await?;
    server.open_subsonic_capabilities = client
        .get_open_subsonic_extensions()
        .await
        .unwrap_or_default();

    let server_url = normalized.url.to_string();
    let id = profile_id(&server_url, &username);
    let profile = SafeProfile {
        profile_id: id.clone(),
        server_url,
        username,
        remember_credential: input.remember_credential,
        last_successful_connection: Utc::now().to_rfc3339(),
        server,
    };

    let credential_saved = if input.remember_credential {
        state.credentials.set(&id, &password).await?;
        true
    } else {
        false
    };
    if let Err(error) = persistence::save_profile(&app, &profile) {
        if credential_saved {
            let _ = state.credentials.delete(&id).await;
        }
        return Err(error);
    }
    if !input.remember_credential {
        state.credentials.delete(&id).await?;
    }
    state.set_session(client, profile.clone()).await;
    Ok(SessionView {
        profile,
        proxy_base_url: state.proxy_base_url.clone(),
        player_settings: persistence::load_player_settings(&app),
        queue_snapshot: persistence::load_queue_snapshot(&app),
    })
}

#[tauri::command]
pub async fn newest_albums(
    state: State<'_, AppState>,
    size: u32,
    offset: u32,
) -> AppResult<Vec<AlbumSummary>> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_newest_albums(size, offset).await
}

#[tauri::command]
pub async fn album_list(
    state: State<'_, AppState>,
    list_type: String,
    size: u32,
    offset: u32,
) -> AppResult<Vec<AlbumSummary>> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_album_list(&list_type, size, offset).await
}

#[tauri::command]
pub async fn get_album(state: State<'_, AppState>, album_id: String) -> AppResult<AlbumDetail> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_album(&album_id).await
}

#[tauri::command]
pub async fn search_library(state: State<'_, AppState>, query: String) -> AppResult<SearchResults> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.search(&query, 0, 20, 0, 50, 0, 30).await
}

#[tauri::command]
pub async fn artists(state: State<'_, AppState>) -> AppResult<Vec<ArtistSummary>> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_artists().await
}

#[tauri::command]
pub async fn get_artist(state: State<'_, AppState>, artist_id: String) -> AppResult<ArtistDetail> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_artist(&artist_id).await
}

#[tauri::command]
pub async fn genres(state: State<'_, AppState>) -> AppResult<Vec<Genre>> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_genres().await
}

#[tauri::command]
pub async fn songs_by_genre(
    state: State<'_, AppState>,
    genre: String,
    count: u32,
    offset: u32,
) -> AppResult<Vec<Song>> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_songs_by_genre(&genre, count, offset).await
}

#[tauri::command]
pub async fn starred(state: State<'_, AppState>) -> AppResult<SearchResults> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_starred().await
}

#[tauri::command]
pub async fn lyrics(state: State<'_, AppState>, song_id: String) -> AppResult<LyricsList> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_lyrics(&song_id).await
}

#[tauri::command]
pub async fn playlists(state: State<'_, AppState>) -> AppResult<Vec<PlaylistSummary>> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_playlists().await
}

#[tauri::command]
pub async fn get_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
) -> AppResult<PlaylistDetail> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.get_playlist(&playlist_id).await
}

#[tauri::command]
pub async fn library_index_status(state: State<'_, AppState>) -> AppResult<LibraryIndexStatus> {
    Ok(state.library_index.status().await)
}

#[tauri::command]
pub async fn refresh_library_index(state: State<'_, AppState>) -> AppResult<LibraryIndexStatus> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    let profile_id = active_profile_id(&state).await?;
    state.library_index.refresh(&client, &profile_id).await
}

#[tauri::command]
pub async fn query_tracks(
    state: State<'_, AppState>,
    input: TrackQuery,
) -> AppResult<TrackQueryResult> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    let profile_id = active_profile_id(&state).await?;
    state.library_index.query(&client, &profile_id, input).await
}

#[tauri::command]
pub async fn tags(state: State<'_, AppState>) -> AppResult<Vec<TagSummary>> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    let profile_id = active_profile_id(&state).await?;
    state.library_index.tags(&client, &profile_id).await
}

#[tauri::command]
pub async fn record_playback_event(
    state: State<'_, AppState>,
    input: PlaybackEventInput,
) -> AppResult<()> {
    let profile_id = active_profile_id(&state).await?;
    if input.profile_id != profile_id {
        return Err(AppError::invalid_input(
            "The playback event profile is invalid.",
        ));
    }
    state.database.record_event(input).await
}

#[tauri::command]
pub async fn listening_statistics(state: State<'_, AppState>) -> AppResult<ListeningStatistics> {
    let profile_id = active_profile_id(&state).await?;
    state.database.statistics(&profile_id).await
}

#[tauri::command]
pub async fn clear_local_library_data(state: State<'_, AppState>) -> AppResult<()> {
    let profile_id = active_profile_id(&state).await?;
    state.database.clear_profile(&profile_id).await?;
    state.library_index.clear().await;
    Ok(())
}

#[tauri::command]
pub async fn export_diagnostics<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> AppResult<DiagnosticsExport> {
    let profile = state
        .active_profile
        .read()
        .await
        .clone()
        .ok_or_else(AppError::no_session)?;
    let server_host = url::Url::parse(&profile.server_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned));
    let index = state.library_index.status().await;
    let diagnostics = serde_json::json!({
        "schemaVersion": 1,
        "generatedAt": Utc::now().to_rfc3339(),
        "application": {
            "name": "Navidrome Desktop",
            "version": env!("CARGO_PKG_VERSION"),
            "targetOs": std::env::consts::OS,
            "targetArch": std::env::consts::ARCH,
        },
        "profile": {
            "profileIdPrefix": profile.profile_id.chars().take(12).collect::<String>(),
            "serverHost": server_host,
            "serverType": profile.server.server_type,
            "serverVersion": profile.server.server_version,
            "capabilities": profile.server.open_subsonic_capabilities,
        },
        "libraryIndex": index,
        "player": {
            "activeSession": state.client().await.is_some(),
            "proxyRunning": true,
        },
        "redaction": {
            "credentialsIncluded": false,
            "authenticatedUrlsIncluded": false,
            "proxyTokenIncluded": false,
            "usernameIncluded": false,
        }
    });
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::storage())?
        .join("diagnostics");
    std::fs::create_dir_all(&directory).map_err(|_| AppError::storage())?;
    let filename = format!("diagnostics-{}.json", Utc::now().format("%Y%m%d-%H%M%S"));
    let path = directory.join(filename);
    let contents = serde_json::to_vec_pretty(&diagnostics).map_err(|_| AppError::storage())?;
    std::fs::write(&path, contents).map_err(|_| AppError::storage())?;
    Ok(DiagnosticsExport {
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn generate_mix(state: State<'_, AppState>, input: MixInput) -> AppResult<MixResult> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    let profile_id = active_profile_id(&state).await?;
    let (songs, history) = tokio::try_join!(
        state.library_index.all_songs(&client, &profile_id),
        state.database.track_history(&profile_id),
    )?;
    build_mix(songs, &history, input)
}

#[tauri::command]
pub async fn set_starred(
    state: State<'_, AppState>,
    item_id: String,
    item_type: String,
    starred: bool,
) -> AppResult<()> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.set_starred(&item_id, &item_type, starred).await
}

#[tauri::command]
pub async fn set_rating(state: State<'_, AppState>, item_id: String, rating: u8) -> AppResult<()> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.set_rating(&item_id, rating).await
}

#[tauri::command]
pub async fn create_playlist(
    state: State<'_, AppState>,
    name: String,
    song_ids: Vec<String>,
) -> AppResult<PlaylistDetail> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.create_playlist(&name, &song_ids).await
}

#[tauri::command]
pub async fn replace_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    name: Option<String>,
    song_ids: Vec<String>,
) -> AppResult<PlaylistDetail> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client
        .replace_playlist(&playlist_id, name.as_deref(), &song_ids)
        .await
}

#[tauri::command]
pub async fn delete_playlist(state: State<'_, AppState>, playlist_id: String) -> AppResult<()> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.delete_playlist(&playlist_id).await
}

#[tauri::command]
pub async fn report_scrobble(state: State<'_, AppState>, input: ScrobbleInput) -> AppResult<bool> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    state
        .scrobbles
        .report(
            &client,
            &input.playback_session_id,
            &input.track_id,
            input.submission,
        )
        .await
}

#[tauri::command]
pub async fn test_connection(state: State<'_, AppState>) -> AppResult<()> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    client.ping().await.map(|_| ())
}

#[tauri::command]
pub fn show_track_notification<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    body: String,
) -> AppResult<()> {
    if title.is_empty()
        || title.len() > 300
        || body.len() > 500
        || title.chars().any(char::is_control)
        || body.chars().any(char::is_control)
    {
        return Err(AppError::invalid_input(
            "The notification content is invalid.",
        ));
    }
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|_| {
            AppError::new(
                "NOTIFICATION_ERROR",
                "Windows could not show the track notification.",
                true,
            )
        })
}

#[tauri::command]
pub async fn save_player_settings<R: Runtime>(
    app: AppHandle<R>,
    settings: PlayerSettings,
) -> AppResult<()> {
    persistence::save_player_settings(&app, &settings)
}

#[tauri::command]
pub async fn save_queue_snapshot<R: Runtime>(
    app: AppHandle<R>,
    snapshot: QueueSnapshot,
) -> AppResult<()> {
    persistence::save_queue_snapshot(&app, &snapshot)
}

#[tauri::command]
pub async fn sync_play_queue(state: State<'_, AppState>, snapshot: QueueSnapshot) -> AppResult<()> {
    let client = state.client().await.ok_or_else(AppError::no_session)?;
    let current_id = snapshot
        .current_index
        .and_then(|index| snapshot.items.get(index))
        .map(|item| item.track.id.as_str());
    let song_ids: Vec<String> = snapshot
        .items
        .iter()
        .map(|item| item.track.id.clone())
        .collect();
    client
        .save_play_queue(
            &song_ids,
            current_id,
            (snapshot.position * 1000.0).max(0.0) as u64,
        )
        .await
}

#[tauri::command]
pub async fn logout<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> AppResult<()> {
    if let Some(profile) = state
        .active_profile
        .read()
        .await
        .clone()
        .or(persistence::load_profile(&app)?)
    {
        state.credentials.delete(&profile.profile_id).await?;
    }
    persistence::clear_profile(&app)?;
    persistence::clear_queue_snapshot(&app)?;
    state.clear_session().await;
    Ok(())
}

async fn active_profile_id(state: &State<'_, AppState>) -> AppResult<String> {
    state
        .active_profile
        .read()
        .await
        .as_ref()
        .map(|profile| profile.profile_id.clone())
        .ok_or_else(AppError::no_session)
}
