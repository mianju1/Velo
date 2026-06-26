#![allow(unexpected_cfgs)]

#[cfg(not(test))]
pub mod commands;
pub mod emby;
pub mod errors;
pub mod player;
pub mod storage;

#[cfg(not(test))]
use commands::{
    fonts::list_system_fonts,
    playback::{
        clear_playback_cache_command, get_playback_cache_status, mpv_disable_subtitle,
        mpv_get_status, mpv_load_subtitle, mpv_pause, mpv_resume, mpv_seek,
        mpv_select_embedded_subtitle, mpv_set_buffer_profile, mpv_set_fullscreen, mpv_set_muted,
        mpv_set_speed, mpv_set_volume, mpv_stop, pause_playback, report_playback_progress,
        resume_playback, seek_playback, set_playback_fullscreen, set_playback_muted,
        set_playback_rate, set_playback_volume, start_playback, stop_playback,
    },
    server::{
        create_store, list_saved_sessions, login, remove_account, remove_server, restore_session,
        validate_server,
    },
};
#[cfg(not(test))]
use emby::client::EmbyClient;
#[cfg(not(test))]
use player::{
    backend::PlayerBackend,
    libmpv::{create_player_backend, PlayerBackendMode},
    session::PlaybackSessionState,
    window_fit::fitted_playback_window_size,
};
#[cfg(not(test))]
use std::sync::Mutex;
#[cfg(not(test))]
use storage::encrypted_store::EncryptedStore;
#[cfg(not(test))]
use tauri::{Manager, PhysicalSize, WebviewWindow};

#[cfg(not(test))]
pub struct AppState {
    pub emby: EmbyClient,
    pub store: Mutex<EncryptedStore>,
    pub player: Mutex<Box<dyn PlayerBackend>>,
    pub playback: Mutex<PlaybackSessionState>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(not(test))]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            emby: EmbyClient::new(),
            store: create_store(),
            player: Mutex::new(
                create_player_backend(PlayerBackendMode::LibMpv)
                    .expect("failed to create player backend"),
            ),
            playback: Mutex::new(PlaybackSessionState::default()),
        })
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                configure_initial_main_window(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_saved_sessions,
            validate_server,
            login,
            restore_session,
            remove_server,
            remove_account,
            start_playback,
            stop_playback,
            pause_playback,
            resume_playback,
            seek_playback,
            set_playback_rate,
            set_playback_volume,
            set_playback_muted,
            set_playback_fullscreen,
            mpv_stop,
            mpv_pause,
            mpv_resume,
            mpv_seek,
            mpv_set_speed,
            mpv_set_volume,
            mpv_set_muted,
            mpv_set_fullscreen,
            mpv_load_subtitle,
            mpv_select_embedded_subtitle,
            mpv_disable_subtitle,
            mpv_get_status,
            mpv_set_buffer_profile,
            report_playback_progress,
            get_playback_cache_status,
            clear_playback_cache_command,
            list_system_fonts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(test))]
fn configure_initial_main_window(window: &WebviewWindow) {
    let work_area = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|monitor| monitor.work_area().size)
        .unwrap_or_else(|| PhysicalSize::new(1440, 900));
    let size = fitted_playback_window_size(work_area.width, work_area.height);

    let _ = window.set_size(PhysicalSize::new(size.width, size.height));
    let _ = window.center();
    let _ = window.set_resizable(true);
}
