use std::sync::PoisonError;

use serde::{Deserialize, Serialize};
use tauri::{PhysicalSize, State, WebviewWindow};

use crate::{
    emby::{
        client::{PlaybackProgressReport, PlaybackStartReport, PlaybackStopReport},
        models::ServerSummary,
    },
    errors::{AppError, AppResult},
    player::{
        backend::{
            HardwareDecoder, PlaybackBufferProfile, PlaybackLoadOptions, PlaybackRuntimeStatus,
            PlayerBackend,
        },
        cache::{clear_playback_cache, playback_cache_status, PlaybackCacheStatus},
        libmpv::{create_player_backend, PlayerBackendMode},
        session::PlaybackSession,
        source::{select_playback_source, PlaybackMediaSource},
        video_surface,
        window_fit::fitted_playback_window_size,
    },
    storage::encrypted_store::EncryptedStore,
    AppState,
};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartPlaybackRequest {
    pub server_id: String,
    pub user_id: String,
    pub item_id: String,
    pub media_source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartPlaybackResult {
    pub item_id: String,
    pub media_source_id: String,
    pub play_method: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackProgressCommand {
    pub position_seconds: f64,
    pub is_paused: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPlaybackAccount {
    pub server: ServerSummary,
    pub access_token: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BufferProfileCommand {
    Startup,
    Steady,
}

#[tauri::command]
pub async fn start_playback(
    window: WebviewWindow,
    request: StartPlaybackRequest,
    state: State<'_, AppState>,
) -> Result<StartPlaybackResult, AppError> {
    let account = {
        let store = state.store.lock().map_err(lock_error)?;
        resolve_playback_account(&store, &request.server_id, &request.user_id)?
    };
    let playback = state
        .emby
        .playback_info(
            &account.server.url,
            &account.access_token,
            &request.user_id,
            &request.item_id,
            request.media_source_id.as_deref(),
        )
        .await?;
    let selected = select_playback_source(
        &playback,
        &account.server.url,
        &request.item_id,
        &account.access_token,
        request.media_source_id.as_deref(),
        false,
    )?;
    let load_options = load_options_for_source(&selected);
    let replacing_existing = {
        let playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.current().is_some()
    };
    let session = PlaybackSession {
        server_id: request.server_id.clone(),
        user_id: request.user_id.clone(),
        item_id: request.item_id.clone(),
        media_source_id: media_source_id_for_source(&selected),
        play_session_id: playback.play_session_id.clone(),
        position_ticks: 0,
        paused: false,
        volume: 100,
        muted: false,
        fullscreen: false,
        ended: false,
        last_error: None,
        speed: crate::player::session::PlaybackSpeed(1.0),
    };

    {
        let player_requires_video_surface = {
            let player = state.player.lock().map_err(lock_error)?;
            player.requires_video_surface()
        };
        let window_configured = !replacing_existing && player_requires_video_surface;
        if window_configured {
            configure_window_for_playback(&window)?;
        }
        let load_result = (|| {
            let mut player = state.player.lock().map_err(lock_error)?;
            load_player_source(
                player.as_mut(),
                || video_surface::target_from_window(&window),
                load_options,
                replacing_existing,
            )
        })();
        if let Err(error) = load_result {
            if window_configured {
                let _ = restore_window_after_playback(&window);
            }
            return Err(error);
        }
    }
    {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.start(session.clone());
    }

    // 播放状态同步失败不应中断本地播放，后续接入重试和进度事件后再集中处理。
    let _ = state
        .emby
        .report_playback_started(
            &account.server.url,
            &account.access_token,
            &PlaybackStartReport {
                item_id: session.item_id.clone(),
                media_source_id: session.media_source_id.clone(),
                play_session_id: session.play_session_id.clone(),
                position_ticks: session.position_ticks,
                is_paused: session.paused,
            },
        )
        .await;

    Ok(StartPlaybackResult::from_selected_source(
        request.item_id,
        selected,
    ))
}

#[tauri::command]
pub async fn stop_playback(
    window: WebviewWindow,
    position_seconds: Option<f64>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let stopped_session = {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        if let Some(position_seconds) = position_seconds {
            playback_state.update_position(seconds_to_ticks(position_seconds));
        }
        playback_state.stop()
    };
    {
        let mut player = state.player.lock().map_err(lock_error)?;
        if stopped_session.is_some() {
            stop_player_and_clear_cache_with_recovery(&mut player)?;
        } else {
            player.stop()?;
        }
    }
    restore_window_after_playback(&window)?;

    if let Some(session) = stopped_session {
        let account = {
            let store = state.store.lock().map_err(lock_error)?;
            resolve_playback_account(&store, &session.server_id, &session.user_id)?
        };
        let _ = state
            .emby
            .report_playback_stopped(
                &account.server.url,
                &account.access_token,
                &PlaybackStopReport {
                    item_id: session.item_id,
                    media_source_id: session.media_source_id,
                    play_session_id: session.play_session_id,
                    position_ticks: session.position_ticks,
                },
            )
            .await;
    }

    Ok(())
}

#[tauri::command]
pub async fn pause_playback(state: State<'_, AppState>) -> Result<(), AppError> {
    set_playback_paused(true, state)
}

#[tauri::command]
pub async fn resume_playback(state: State<'_, AppState>) -> Result<(), AppError> {
    set_playback_paused(false, state)
}

#[tauri::command]
pub async fn seek_playback(
    position_seconds: f64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let position_seconds = sanitized_seek_position(position_seconds)?;
    {
        let mut player = state.player.lock().map_err(lock_error)?;
        player.seek(position_seconds)?;
    }
    {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.update_position(seconds_to_ticks(position_seconds));
    }
    Ok(())
}

#[tauri::command]
pub async fn set_playback_rate(rate: f64, state: State<'_, AppState>) -> Result<(), AppError> {
    let rate = validated_playback_rate(rate)?;
    {
        let mut player = state.player.lock().map_err(lock_error)?;
        player.set_speed(rate)?;
    }
    {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.set_speed(rate);
    }
    Ok(())
}

#[tauri::command]
pub async fn set_playback_volume(volume: u8, state: State<'_, AppState>) -> Result<(), AppError> {
    {
        let mut player = state.player.lock().map_err(lock_error)?;
        player.set_volume(volume)?;
    }
    {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.set_volume(volume);
    }
    Ok(())
}

#[tauri::command]
pub async fn set_playback_muted(muted: bool, state: State<'_, AppState>) -> Result<(), AppError> {
    {
        let mut player = state.player.lock().map_err(lock_error)?;
        player.set_muted(muted)?;
    }
    {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.set_muted(muted);
    }
    Ok(())
}

#[tauri::command]
pub async fn set_playback_fullscreen(
    window: WebviewWindow,
    fullscreen: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    window.set_fullscreen(fullscreen).map_err(window_error)?;
    {
        let mut player = state.player.lock().map_err(lock_error)?;
        player.set_fullscreen(fullscreen)?;
    }
    {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.set_fullscreen(fullscreen);
    }
    Ok(())
}

#[tauri::command]
pub async fn mpv_stop(
    window: WebviewWindow,
    position_seconds: Option<f64>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    stop_playback(window, position_seconds, state).await
}

#[tauri::command]
pub async fn mpv_pause(state: State<'_, AppState>) -> Result<(), AppError> {
    pause_playback(state).await
}

#[tauri::command]
pub async fn mpv_resume(state: State<'_, AppState>) -> Result<(), AppError> {
    resume_playback(state).await
}

#[tauri::command]
pub async fn mpv_seek(seconds: f64, state: State<'_, AppState>) -> Result<(), AppError> {
    seek_playback(seconds, state).await
}

#[tauri::command]
pub async fn mpv_set_speed(speed: f64, state: State<'_, AppState>) -> Result<(), AppError> {
    set_playback_rate(speed, state).await
}

#[tauri::command]
pub async fn mpv_set_volume(volume: u8, state: State<'_, AppState>) -> Result<(), AppError> {
    set_playback_volume(volume, state).await
}

#[tauri::command]
pub async fn mpv_set_muted(muted: bool, state: State<'_, AppState>) -> Result<(), AppError> {
    set_playback_muted(muted, state).await
}

#[tauri::command]
pub async fn mpv_set_fullscreen(
    window: WebviewWindow,
    fullscreen: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    set_playback_fullscreen(window, fullscreen, state).await
}

#[tauri::command]
pub async fn mpv_load_subtitle(path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let mut player = state.player.lock().map_err(lock_error)?;
    player.load_subtitle(&path)
}

#[tauri::command]
pub async fn mpv_select_embedded_subtitle(
    stream_index: i64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let mut player = state.player.lock().map_err(lock_error)?;
    player.select_embedded_subtitle(stream_index)
}

#[tauri::command]
pub async fn mpv_disable_subtitle(state: State<'_, AppState>) -> Result<(), AppError> {
    let mut player = state.player.lock().map_err(lock_error)?;
    player.disable_subtitle()
}

#[tauri::command]
pub async fn mpv_get_status(state: State<'_, AppState>) -> Result<PlaybackRuntimeStatus, AppError> {
    let player = state.player.lock().map_err(lock_error)?;
    Ok(player.runtime_status())
}

#[tauri::command]
pub async fn mpv_set_buffer_profile(
    profile: BufferProfileCommand,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let mut player = state.player.lock().map_err(lock_error)?;
    player.set_buffer_profile(profile.into())
}

#[tauri::command]
pub async fn report_playback_progress(
    report: PlaybackProgressCommand,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let position_ticks = seconds_to_ticks(report.position_seconds);
    let session = {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.update_position(position_ticks);
        playback_state.set_paused(report.is_paused);
        playback_state.current().cloned()
    };
    let session = session
        .ok_or_else(|| AppError::bad_request("playback_not_started", "当前没有正在播放的视频"))?;
    let account = {
        let store = state.store.lock().map_err(lock_error)?;
        resolve_playback_account(&store, &session.server_id, &session.user_id)?
    };

    state
        .emby
        .report_playback_progress(
            &account.server.url,
            &account.access_token,
            &PlaybackProgressReport {
                item_id: session.item_id,
                media_source_id: session.media_source_id,
                play_session_id: session.play_session_id,
                position_ticks,
                is_paused: report.is_paused,
            },
        )
        .await
}

#[tauri::command]
pub async fn get_playback_cache_status() -> Result<PlaybackCacheStatus, AppError> {
    playback_cache_status()
}

#[tauri::command]
pub async fn clear_playback_cache_command() -> Result<PlaybackCacheStatus, AppError> {
    clear_playback_cache()
}

pub fn resolve_playback_account(
    store: &EncryptedStore,
    server_id: &str,
    user_id: &str,
) -> AppResult<ResolvedPlaybackAccount> {
    let config = store.load_config()?;
    let server = config
        .servers
        .into_iter()
        .find(|server| server.id == server_id)
        .ok_or_else(|| AppError::bad_request("server_not_found", "未找到已保存服务器"))?;
    let account = config
        .accounts
        .into_iter()
        .find(|account| account.server_id == server.id && account.id == user_id)
        .ok_or_else(|| AppError::bad_request("account_not_found", "未找到已保存账号"))?;

    Ok(ResolvedPlaybackAccount {
        server,
        access_token: account.access_token,
    })
}

fn load_options_for_source(source: &PlaybackMediaSource) -> PlaybackLoadOptions {
    let url = match source {
        PlaybackMediaSource::Direct { url, .. } => url.clone(),
        PlaybackMediaSource::Transcode { url, .. } => url.clone(),
    };

    PlaybackLoadOptions {
        url,
        start_paused: false,
        hwdec: HardwareDecoder::VideoToolbox,
    }
}

fn load_player_source<F>(
    player: &mut dyn PlayerBackend,
    target_factory: F,
    load_options: PlaybackLoadOptions,
    replacing_existing: bool,
) -> AppResult<()>
where
    F: FnOnce() -> AppResult<video_surface::VideoSurfaceTarget>,
{
    load_player_source_with_target_factory(
        player,
        target_factory,
        load_options,
        replacing_existing,
        clear_playback_cache,
    )
}

#[cfg(test)]
fn load_player_source_with_cache_clear<F>(
    player: &mut dyn PlayerBackend,
    target: video_surface::VideoSurfaceTarget,
    load_options: PlaybackLoadOptions,
    replacing_existing: bool,
    clear_cache: F,
) -> AppResult<()>
where
    F: FnOnce() -> AppResult<PlaybackCacheStatus>,
{
    load_player_source_with_target_factory(
        player,
        || Ok(target),
        load_options,
        replacing_existing,
        clear_cache,
    )
}

fn load_player_source_with_target_factory<T, C>(
    player: &mut dyn PlayerBackend,
    target_factory: T,
    load_options: PlaybackLoadOptions,
    replacing_existing: bool,
    clear_cache: C,
) -> AppResult<()>
where
    T: FnOnce() -> AppResult<video_surface::VideoSurfaceTarget>,
    C: FnOnce() -> AppResult<PlaybackCacheStatus>,
{
    if replacing_existing {
        stop_player_and_clear_cache_with(player, clear_cache)?;
    }
    if player.requires_video_surface() {
        player.attach_video_surface(target_factory()?)?;
    }
    player.load(load_options)
}

fn stop_player_and_clear_cache_with_recovery(player: &mut Box<dyn PlayerBackend>) -> AppResult<()> {
    stop_player_and_clear_cache_with_recovery_for(player, clear_playback_cache, || {
        create_player_backend(PlayerBackendMode::LibMpv)
    })
}

fn stop_player_and_clear_cache_with_recovery_for<C, R>(
    player: &mut Box<dyn PlayerBackend>,
    clear_cache: C,
    recover_player: R,
) -> AppResult<()>
where
    C: FnOnce() -> AppResult<PlaybackCacheStatus>,
    R: FnOnce() -> AppResult<Box<dyn PlayerBackend>>,
{
    let stop_result = player.stop();
    let clear_result = clear_cache();

    if stop_result.is_err() {
        *player = recover_player()?;
        // 旧 libmpv 后端已被 drop，播放必须优先停止；缓存清理失败不应让旧视频继续播放。
        let _ = clear_result;
        return Ok(());
    }

    stop_result?;
    clear_result.map(|_| ())
}

fn stop_player_and_clear_cache_with<F>(
    player: &mut dyn PlayerBackend,
    clear_cache: F,
) -> AppResult<()>
where
    F: FnOnce() -> AppResult<PlaybackCacheStatus>,
{
    let stop_result = player.stop();
    let clear_result = clear_cache();

    stop_result?;
    clear_result.map(|_| ())
}

fn media_source_id_for_source(source: &PlaybackMediaSource) -> String {
    match source {
        PlaybackMediaSource::Direct {
            media_source_id, ..
        } => media_source_id.clone(),
        PlaybackMediaSource::Transcode {
            media_source_id, ..
        } => media_source_id.clone(),
    }
}

fn set_playback_paused(paused: bool, state: State<'_, AppState>) -> Result<(), AppError> {
    {
        let mut player = state.player.lock().map_err(lock_error)?;
        player.set_paused(paused)?;
    }
    {
        let mut playback_state = state.playback.lock().map_err(lock_error)?;
        playback_state.set_paused(paused);
    }
    Ok(())
}

fn seconds_to_ticks(position_seconds: f64) -> u64 {
    (position_seconds.max(0.0) * 10_000_000.0).round() as u64
}

fn sanitized_seek_position(position_seconds: f64) -> AppResult<f64> {
    if !position_seconds.is_finite() {
        return Err(AppError::bad_request(
            "invalid_seek_position",
            "播放进度参数无效",
        ));
    }

    Ok(position_seconds.max(0.0))
}

fn validated_playback_rate(rate: f64) -> AppResult<f64> {
    if !rate.is_finite() || !(0.25..=4.0).contains(&rate) {
        return Err(AppError::bad_request(
            "invalid_playback_rate",
            "播放倍速必须在 0.25x 到 4x 之间",
        ));
    }

    Ok(rate)
}

impl From<BufferProfileCommand> for PlaybackBufferProfile {
    fn from(value: BufferProfileCommand) -> Self {
        match value {
            BufferProfileCommand::Startup => PlaybackBufferProfile::Startup,
            BufferProfileCommand::Steady => PlaybackBufferProfile::Steady,
        }
    }
}

fn configure_window_for_playback(window: &WebviewWindow) -> AppResult<()> {
    let work_area = window
        .current_monitor()
        .map_err(window_error)?
        .map(|monitor| monitor.work_area().size)
        .unwrap_or_else(|| {
            window
                .inner_size()
                .unwrap_or_else(|_| PhysicalSize::new(1280, 720))
        });
    let size = fitted_playback_window_size(work_area.width, work_area.height);

    window
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(window_error)?;
    window.center().map_err(window_error)?;
    window.set_resizable(true).map_err(window_error)?;
    lock_window_aspect_ratio(window)?;
    Ok(())
}

fn restore_window_after_playback(window: &WebviewWindow) -> AppResult<()> {
    window.set_fullscreen(false).map_err(window_error)?;
    window.set_resizable(true).map_err(window_error)?;
    clear_window_aspect_ratio(window)?;
    Ok(())
}

impl StartPlaybackResult {
    pub fn from_selected_source(item_id: String, source: PlaybackMediaSource) -> Self {
        match source {
            PlaybackMediaSource::Direct {
                media_source_id, ..
            } => Self {
                item_id,
                media_source_id,
                play_method: "direct".into(),
            },
            PlaybackMediaSource::Transcode {
                media_source_id, ..
            } => Self {
                item_id,
                media_source_id,
                play_method: "transcode".into(),
            },
        }
    }
}

#[cfg(target_os = "macos")]
fn lock_window_aspect_ratio(window: &WebviewWindow) -> AppResult<()> {
    use cocoa::foundation::NSSize;
    use objc::{msg_send, sel, sel_impl};

    let ns_window = window.ns_window().map_err(|error| {
        AppError::new(
            "window_operation_failed",
            "播放窗口操作失败",
            Some(error.to_string()),
            true,
        )
    })? as cocoa::base::id;

    unsafe {
        let _: () = msg_send![
            ns_window,
            setContentAspectRatio: NSSize::new(16.0, 9.0)
        ];
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn lock_window_aspect_ratio(_window: &WebviewWindow) -> AppResult<()> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn clear_window_aspect_ratio(window: &WebviewWindow) -> AppResult<()> {
    use cocoa::foundation::NSSize;
    use objc::{msg_send, sel, sel_impl};

    let ns_window = window.ns_window().map_err(|error| {
        AppError::new(
            "window_operation_failed",
            "播放窗口操作失败",
            Some(error.to_string()),
            true,
        )
    })? as cocoa::base::id;

    unsafe {
        let _: () = msg_send![ns_window, setContentAspectRatio: NSSize::new(0.0, 0.0)];
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn clear_window_aspect_ratio(_window: &WebviewWindow) -> AppResult<()> {
    Ok(())
}

fn lock_error<T>(error: PoisonError<T>) -> AppError {
    AppError::new(
        "state_lock_error",
        "应用状态暂时不可用",
        Some(error.to_string()),
        true,
    )
}

fn window_error(error: tauri::Error) -> AppError {
    AppError::new(
        "window_operation_failed",
        "播放窗口操作失败",
        Some(error.to_string()),
        true,
    )
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    use crate::{
        emby::models::ServerSummary,
        errors::{AppError, AppResult},
        player::{
            backend::{
                FakePlayerBackend, HardwareDecoder, PlaybackLoadOptions, PlaybackSnapshot,
                PlayerBackend,
            },
            cache::PlaybackCacheStatus,
            source::PlaybackMediaSource,
            video_surface::VideoSurfaceTarget,
        },
        storage::encrypted_store::{EncryptedStore, StoredAccount, StoredConfig},
    };

    use super::{
        load_options_for_source, load_player_source_with_cache_clear,
        load_player_source_with_target_factory, resolve_playback_account, sanitized_seek_position,
        stop_player_and_clear_cache_with, stop_player_and_clear_cache_with_recovery_for,
        validated_playback_rate, StartPlaybackRequest, StartPlaybackResult,
    };

    #[test]
    fn start_playback_request_does_not_accept_url_or_token() {
        let request = StartPlaybackRequest {
            server_id: "server-1".into(),
            user_id: "user-1".into(),
            item_id: "item-1".into(),
            media_source_id: Some("source-1".into()),
        };

        let json = serde_json::to_string(&request).unwrap();

        assert!(json.contains("serverId"));
        assert!(json.contains("userId"));
        assert!(json.contains("itemId"));
        assert!(json.contains("mediaSourceId"));
        assert!(!json.contains("quality"));
        assert!(!json.contains("customResolution"));
        assert!(!json.contains("customBitrate"));
        assert!(!json.contains("url"));
        assert!(!json.contains("token"));
    }

    #[test]
    fn resolves_playback_account_from_encrypted_store() {
        let path = std::env::temp_dir().join(format!(
            "velo-playback-command-{}.json",
            std::process::id()
        ));
        let store = EncryptedStore::new(path.clone());
        store
            .save_config(&StoredConfig {
                servers: vec![ServerSummary {
                    id: "server-1".into(),
                    name: "Home".into(),
                    url: "https://emby.example.test".into(),
                }],
                accounts: vec![StoredAccount {
                    id: "user-1".into(),
                    server_id: "server-1".into(),
                    name: "alice".into(),
                    access_token: "stored-token".into(),
                }],
            })
            .unwrap();

        let account = resolve_playback_account(&store, "server-1", "user-1").unwrap();
        let _ = std::fs::remove_file(path);

        assert_eq!(account.server.url, "https://emby.example.test");
        assert_eq!(account.access_token, "stored-token");
    }

    #[test]
    fn playback_load_options_use_selected_source_url() {
        let selected = PlaybackMediaSource::Direct {
            media_source_id: "source-1".into(),
            url: "https://emby.example.test/video.mp4".into(),
        };
        let options = load_options_for_source(&selected);

        assert_eq!(options.url, "https://emby.example.test/video.mp4");
        assert!(!options.start_paused);
        assert_eq!(options.hwdec, HardwareDecoder::VideoToolbox);
    }

    #[test]
    fn reload_stops_existing_player_before_loading_next_source() {
        let mut player = FakePlayerBackend::default();
        let cache_cleared = Arc::new(AtomicBool::new(false));
        let cache_cleared_for_closure = Arc::clone(&cache_cleared);

        load_player_source_with_cache_clear(
            &mut player,
            VideoSurfaceTarget {
                ns_view: 1,
                open_gl_context: 2,
                width: 1280,
                height: 720,
            },
            PlaybackLoadOptions {
                url: "https://emby.example.test/next.m3u8".into(),
                start_paused: false,
                hwdec: HardwareDecoder::VideoToolbox,
            },
            true,
            || {
                cache_cleared_for_closure.store(true, Ordering::SeqCst);
                Ok(PlaybackCacheStatus {
                    size_bytes: 0,
                    path: "/tmp/emby-cache".into(),
                })
            },
        )
        .unwrap();

        assert_eq!(player.events(), ["stop", "attach", "load"]);
        assert!(cache_cleared.load(Ordering::SeqCst));
        assert_eq!(
            player.loaded_url(),
            Some("https://emby.example.test/next.m3u8")
        );
    }

    #[test]
    fn backend_without_embedded_surface_loads_without_requesting_video_surface() {
        let mut player = SurfaceFreeBackend::default();
        let target_requested = Arc::new(AtomicBool::new(false));
        let target_requested_for_closure = Arc::clone(&target_requested);

        load_player_source_with_target_factory(
            &mut player,
            || {
                target_requested_for_closure.store(true, Ordering::SeqCst);
                Err(AppError::new(
                    "video_surface_not_available",
                    "当前平台暂不支持内置视频渲染区域",
                    None,
                    true,
                ))
            },
            PlaybackLoadOptions {
                url: "https://emby.example.test/movie.m3u8".into(),
                start_paused: false,
                hwdec: HardwareDecoder::AutoSafe,
            },
            false,
            || {
                Ok(PlaybackCacheStatus {
                    size_bytes: 0,
                    path: "/tmp/emby-cache".into(),
                })
            },
        )
        .unwrap();

        assert!(!target_requested.load(Ordering::SeqCst));
        assert_eq!(
            player.snapshot().loaded_url,
            Some("https://emby.example.test/movie.m3u8".into())
        );
    }

    #[test]
    fn stopping_player_clears_playback_cache_after_player_stop() {
        let mut player = FakePlayerBackend::default();
        let cache_cleared = Arc::new(AtomicBool::new(false));
        let cache_cleared_for_closure = Arc::clone(&cache_cleared);

        stop_player_and_clear_cache_with(&mut player, || {
            cache_cleared_for_closure.store(true, Ordering::SeqCst);
            Ok(PlaybackCacheStatus {
                size_bytes: 0,
                path: "/tmp/emby-cache".into(),
            })
        })
        .unwrap();

        assert_eq!(player.events(), ["stop"]);
        assert!(cache_cleared.load(Ordering::SeqCst));
    }

    #[test]
    fn stopping_player_recovers_backend_when_stop_command_fails() {
        let mut player: Box<dyn PlayerBackend> = Box::new(StopFailingBackend);
        let cache_cleared = Arc::new(AtomicBool::new(false));
        let cache_cleared_for_closure = Arc::clone(&cache_cleared);

        stop_player_and_clear_cache_with_recovery_for(
            &mut player,
            || {
                cache_cleared_for_closure.store(true, Ordering::SeqCst);
                Ok(PlaybackCacheStatus {
                    size_bytes: 0,
                    path: "/tmp/emby-cache".into(),
                })
            },
            || Ok(Box::new(FakePlayerBackend::default())),
        )
        .unwrap();

        assert!(cache_cleared.load(Ordering::SeqCst));
        assert!(player.stop().is_ok());
    }

    #[test]
    fn builds_start_result_from_selected_source() {
        let selected = PlaybackMediaSource::Direct {
            media_source_id: "source-1".into(),
            url: "https://emby.example.test/video.mp4".into(),
        };
        let result = StartPlaybackResult::from_selected_source("item-1".into(), selected);

        assert_eq!(result.media_source_id, "source-1");
        assert_eq!(result.play_method, "direct");
    }

    #[test]
    fn sanitizes_seek_position_before_sending_to_player() {
        assert_eq!(sanitized_seek_position(-15.0).unwrap(), 0.0);
        assert_eq!(sanitized_seek_position(42.0).unwrap(), 42.0);
        assert_eq!(
            sanitized_seek_position(f64::NAN).unwrap_err().code,
            "invalid_seek_position"
        );
    }

    #[test]
    fn validates_playback_rate_range() {
        assert_eq!(validated_playback_rate(1.5).unwrap(), 1.5);
        assert_eq!(
            validated_playback_rate(0.0).unwrap_err().code,
            "invalid_playback_rate"
        );
        assert_eq!(
            validated_playback_rate(8.0).unwrap_err().code,
            "invalid_playback_rate"
        );
    }

    struct StopFailingBackend;

    impl PlayerBackend for StopFailingBackend {
        fn load(&mut self, _options: PlaybackLoadOptions) -> AppResult<()> {
            Ok(())
        }

        fn stop(&mut self) -> AppResult<()> {
            Err(AppError::new(
                "libmpv_command_failed",
                "libmpv 播放命令执行失败",
                Some("mpv_command returned -1".into()),
                true,
            ))
        }

        fn set_paused(&mut self, _paused: bool) -> AppResult<()> {
            Ok(())
        }

        fn seek(&mut self, _position_seconds: f64) -> AppResult<()> {
            Ok(())
        }

        fn set_speed(&mut self, _speed: f64) -> AppResult<()> {
            Ok(())
        }

        fn set_volume(&mut self, _volume: u8) -> AppResult<()> {
            Ok(())
        }

        fn set_muted(&mut self, _muted: bool) -> AppResult<()> {
            Ok(())
        }

        fn set_fullscreen(&mut self, _fullscreen: bool) -> AppResult<()> {
            Ok(())
        }

        fn snapshot(&self) -> PlaybackSnapshot {
            PlaybackSnapshot::default()
        }
    }

    #[derive(Default)]
    struct SurfaceFreeBackend {
        snapshot: PlaybackSnapshot,
    }

    impl PlayerBackend for SurfaceFreeBackend {
        fn requires_video_surface(&self) -> bool {
            false
        }

        fn load(&mut self, options: PlaybackLoadOptions) -> AppResult<()> {
            self.snapshot.loaded_url = Some(options.url);
            self.snapshot.paused = options.start_paused;
            Ok(())
        }

        fn stop(&mut self) -> AppResult<()> {
            self.snapshot.loaded_url = None;
            Ok(())
        }

        fn set_paused(&mut self, paused: bool) -> AppResult<()> {
            self.snapshot.paused = paused;
            Ok(())
        }

        fn seek(&mut self, position_seconds: f64) -> AppResult<()> {
            self.snapshot.position_seconds = position_seconds;
            Ok(())
        }

        fn set_speed(&mut self, speed: f64) -> AppResult<()> {
            self.snapshot.speed = speed;
            Ok(())
        }

        fn set_volume(&mut self, volume: u8) -> AppResult<()> {
            self.snapshot.volume = volume;
            Ok(())
        }

        fn set_muted(&mut self, muted: bool) -> AppResult<()> {
            self.snapshot.muted = muted;
            Ok(())
        }

        fn set_fullscreen(&mut self, fullscreen: bool) -> AppResult<()> {
            self.snapshot.fullscreen = fullscreen;
            Ok(())
        }

        fn snapshot(&self) -> PlaybackSnapshot {
            self.snapshot.clone()
        }
    }
}
