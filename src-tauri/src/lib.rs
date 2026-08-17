mod app_state;
mod commands;
mod credentials;
pub mod error;
mod library_index;
mod local_data;
pub mod logging;
mod media_proxy;
mod mix;
pub mod navidrome;
mod persistence;
pub mod profile;
mod scrobble;

use std::sync::Arc;

use app_state::AppState;
use credentials::WindowsCredentialStore;
use local_data::LocalDatabase;
use media_proxy::SharedClient;
use tauri::{
    Emitter, Manager, RunEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tokio::sync::RwLock;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_target(false)
        .compact()
        .try_init();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let active_client: SharedClient = Arc::new(RwLock::new(None));
            let proxy = tauri::async_runtime::block_on(media_proxy::start(active_client.clone()))?;
            let database = Arc::new(LocalDatabase::open(
                app.path().app_data_dir()?.join("library.sqlite3"),
            )?);
            app.manage(AppState::new(
                WindowsCredentialStore::new(),
                active_client,
                proxy,
                database,
            ));
            build_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::restore_session,
            commands::login,
            commands::newest_albums,
            commands::album_list,
            commands::get_album,
            commands::search_library,
            commands::artists,
            commands::get_artist,
            commands::genres,
            commands::songs_by_genre,
            commands::starred,
            commands::lyrics,
            commands::playlists,
            commands::get_playlist,
            commands::library_index_status,
            commands::refresh_library_index,
            commands::query_tracks,
            commands::record_playback_event,
            commands::listening_statistics,
            commands::clear_local_library_data,
            commands::export_diagnostics,
            commands::generate_mix,
            commands::set_starred,
            commands::set_rating,
            commands::create_playlist,
            commands::replace_playlist,
            commands::delete_playlist,
            commands::report_scrobble,
            commands::test_connection,
            commands::show_track_notification,
            commands::save_player_settings,
            commands::save_queue_snapshot,
            commands::sync_play_queue,
            commands::logout,
        ])
        .build(tauri::generate_context!())
        .expect("Tauri must initialize with the bundled configuration");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            app_handle.state::<AppState>().shutdown_proxy();
        }
    });
}

fn build_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show Navidrome Desktop", true, None::<&str>)?;
    let mini = MenuItem::with_id(app, "mini", "Open Mini Player", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "Previous", true, None::<&str>)?;
    let play_pause = MenuItem::with_id(app, "play-pause", "Play / Pause", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &mini, &previous, &play_pause, &next, &quit])?;
    let mut builder = TrayIconBuilder::new()
        .tooltip("Navidrome Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "mini" => {
                let _ = app.emit(
                    "desktop-control",
                    serde_json::json!({ "action": "open-mini" }),
                );
            }
            "previous" | "play-pause" | "next" => {
                let _ = app.emit(
                    "desktop-control",
                    serde_json::json!({ "action": event.id.as_ref() }),
                );
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
