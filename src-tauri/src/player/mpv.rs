use std::{
    path::PathBuf,
    process::{Child, Command},
};

use crate::errors::{AppError, AppResult};
use crate::player::{
    backend::{
        PlaybackBufferProfile, PlaybackLoadOptions, PlaybackRuntimeStatus, PlaybackSnapshot,
        PlayerBackend,
    },
    window_fit::mpv_autofit_larger_arg,
};

pub struct MpvLaunchOptions {
    pub url: String,
    pub start_paused: bool,
}

pub struct MpvController {
    process: Option<Child>,
}

impl MpvController {
    pub fn new() -> Self {
        Self { process: None }
    }

    pub fn is_available() -> bool {
        Self::find_executable().is_some()
    }

    fn find_executable() -> Option<PathBuf> {
        let configured_path = std::env::var_os("VELO_MPV_PATH").map(PathBuf::from);
        let executable = std::env::current_exe().ok();
        mpv_executable_candidates_for_executable(
            executable.as_deref(),
            configured_path,
            mpv_executable_name(),
        )
        .into_iter()
        .find(|candidate| Command::new(candidate).arg("--version").output().is_ok())
    }

    pub fn start(&mut self, options: &MpvLaunchOptions) -> AppResult<()> {
        let executable = Self::find_executable().ok_or_else(|| {
            AppError::new(
                "mpv_not_found",
                "未找到 mpv，请安装 mpv，或将 mpv.exe 放到应用同目录",
                None,
                true,
            )
        })?;

        self.stop();
        let child = Command::new(executable)
            .args(build_mpv_args(options))
            .spawn()
            .map_err(|error| {
                AppError::new(
                    "mpv_start_failed",
                    "mpv 启动失败",
                    Some(error.to_string()),
                    true,
                )
            })?;
        self.process = Some(child);

        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
}

impl Default for MpvController {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for MpvController {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn build_mpv_args(options: &MpvLaunchOptions) -> Vec<String> {
    let mut args = vec![
        "--force-window=yes".to_string(),
        mpv_autofit_larger_arg(),
        "--idle=no".to_string(),
        "--input-terminal=no".to_string(),
    ];

    if options.start_paused {
        args.push("--pause=yes".to_string());
    }

    args.push(options.url.clone());
    args
}

pub struct ExternalMpvBackend {
    controller: MpvController,
    snapshot: PlaybackSnapshot,
}

impl ExternalMpvBackend {
    pub fn new() -> Self {
        Self {
            controller: MpvController::new(),
            snapshot: PlaybackSnapshot::default(),
        }
    }
}

impl Default for ExternalMpvBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl PlayerBackend for ExternalMpvBackend {
    fn requires_video_surface(&self) -> bool {
        false
    }

    fn load(&mut self, options: PlaybackLoadOptions) -> AppResult<()> {
        self.controller.start(&MpvLaunchOptions {
            url: options.url.clone(),
            start_paused: options.start_paused,
        })?;
        self.snapshot.loaded_url = Some(options.url);
        self.snapshot.paused = options.start_paused;
        self.snapshot.position_seconds = 0.0;
        Ok(())
    }

    fn stop(&mut self) -> AppResult<()> {
        self.controller.stop();
        self.snapshot.loaded_url = None;
        self.snapshot.position_seconds = 0.0;
        self.snapshot.paused = false;
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
        self.snapshot.volume = volume.min(100);
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

    fn load_subtitle(&mut self, _path: &str) -> AppResult<()> {
        Ok(())
    }

    fn select_embedded_subtitle(&mut self, _stream_index: i64) -> AppResult<()> {
        Ok(())
    }

    fn disable_subtitle(&mut self) -> AppResult<()> {
        Ok(())
    }

    fn set_buffer_profile(&mut self, _profile: PlaybackBufferProfile) -> AppResult<()> {
        Ok(())
    }

    fn snapshot(&self) -> PlaybackSnapshot {
        self.snapshot.clone()
    }

    fn runtime_status(&self) -> PlaybackRuntimeStatus {
        PlaybackRuntimeStatus {
            core_ready: true,
            media_loaded: self.snapshot.loaded_url.is_some(),
            paused: self.snapshot.paused,
            paused_for_cache: false,
            cache_speed_bytes_per_second: None,
            position_seconds: self.snapshot.position_seconds,
            duration_seconds: None,
        }
    }
}

fn mpv_executable_candidates_for_executable(
    executable: Option<&std::path::Path>,
    configured_path: Option<PathBuf>,
    executable_name: &str,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(path) = configured_path {
        candidates.push(path);
    }

    if let Some(executable) = executable {
        if let Some(executable_dir) = executable.parent() {
            candidates.push(executable_dir.join(executable_name));
            candidates.push(executable_dir.join("bin").join(executable_name));
            candidates.push(
                executable_dir
                    .join("resources")
                    .join("bin")
                    .join(executable_name),
            );
        }
    }

    candidates.push(PathBuf::from("mpv"));
    candidates
}

#[cfg(target_os = "windows")]
fn mpv_executable_name() -> &'static str {
    "mpv.exe"
}

#[cfg(not(target_os = "windows"))]
fn mpv_executable_name() -> &'static str {
    "mpv"
}

#[cfg(test)]
mod tests {
    use crate::player::backend::PlayerBackend;

    use super::{build_mpv_args, ExternalMpvBackend, MpvLaunchOptions};

    #[test]
    fn builds_mpv_args_for_external_playback_window() {
        let args = build_mpv_args(&MpvLaunchOptions {
            url: "https://emby.example.test/video.mp4".into(),
            start_paused: false,
        });

        assert_eq!(
            args,
            vec![
                "--force-window=yes".to_string(),
                "--autofit-larger=75%x75%".to_string(),
                "--idle=no".to_string(),
                "--input-terminal=no".to_string(),
                "https://emby.example.test/video.mp4".to_string(),
            ]
        );
    }

    #[test]
    fn adds_pause_flag_when_starting_paused() {
        let args = build_mpv_args(&MpvLaunchOptions {
            url: "https://emby.example.test/video.mp4".into(),
            start_paused: true,
        });

        assert!(args.contains(&"--pause=yes".to_string()));
    }

    #[test]
    fn external_mpv_backend_does_not_need_embedded_video_surface() {
        let backend = ExternalMpvBackend::new();

        assert!(!backend.requires_video_surface());
    }

    #[test]
    fn mpv_candidates_include_tauri_resource_bin_directory() {
        let executable =
            std::path::Path::new("C:/Program Files/Velo/Velo.exe");
        let candidates =
            super::mpv_executable_candidates_for_executable(Some(executable), None, "mpv.exe");

        assert!(candidates.contains(&std::path::PathBuf::from(
            "C:/Program Files/Velo/resources/bin/mpv.exe"
        )));
    }
}
