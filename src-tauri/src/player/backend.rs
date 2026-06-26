use crate::errors::{AppError, AppResult};

use super::video_surface::VideoSurfaceTarget;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HardwareDecoder {
    VideoToolbox,
    AutoSafe,
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaybackLoadOptions {
    pub url: String,
    pub start_paused: bool,
    pub hwdec: HardwareDecoder,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlaybackSnapshot {
    pub loaded_url: Option<String>,
    pub position_seconds: f64,
    pub paused: bool,
    pub speed: f64,
    pub volume: u8,
    pub muted: bool,
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackRuntimeStatus {
    pub core_ready: bool,
    pub media_loaded: bool,
    pub paused: bool,
    pub paused_for_cache: bool,
    pub cache_speed_bytes_per_second: Option<f64>,
    pub position_seconds: f64,
    pub duration_seconds: Option<f64>,
}

impl Default for PlaybackSnapshot {
    fn default() -> Self {
        Self {
            loaded_url: None,
            position_seconds: 0.0,
            paused: false,
            speed: 1.0,
            volume: 100,
            muted: false,
            fullscreen: false,
        }
    }
}

pub trait PlayerBackend: Send {
    fn requires_video_surface(&self) -> bool {
        true
    }

    fn attach_video_surface(&mut self, _target: VideoSurfaceTarget) -> AppResult<()> {
        Ok(())
    }

    fn load(&mut self, options: PlaybackLoadOptions) -> AppResult<()>;
    fn stop(&mut self) -> AppResult<()>;
    fn set_paused(&mut self, paused: bool) -> AppResult<()>;
    fn seek(&mut self, position_seconds: f64) -> AppResult<()>;
    fn set_speed(&mut self, speed: f64) -> AppResult<()>;
    fn set_volume(&mut self, volume: u8) -> AppResult<()>;
    fn set_muted(&mut self, muted: bool) -> AppResult<()>;
    fn set_fullscreen(&mut self, fullscreen: bool) -> AppResult<()>;
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
    fn snapshot(&self) -> PlaybackSnapshot;
    fn runtime_status(&self) -> PlaybackRuntimeStatus {
        let snapshot = self.snapshot();
        PlaybackRuntimeStatus {
            core_ready: true,
            media_loaded: snapshot.loaded_url.is_some(),
            paused: snapshot.paused,
            paused_for_cache: false,
            cache_speed_bytes_per_second: None,
            position_seconds: snapshot.position_seconds,
            duration_seconds: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackBufferProfile {
    Startup,
    Steady,
}

#[derive(Debug, Default)]
pub struct FakePlayerBackend {
    snapshot: PlaybackSnapshot,
    events: Vec<&'static str>,
    buffer_profiles: Vec<PlaybackBufferProfile>,
}

impl FakePlayerBackend {
    pub fn loaded_url(&self) -> Option<&str> {
        self.snapshot.loaded_url.as_deref()
    }

    pub fn events(&self) -> &[&'static str] {
        &self.events
    }

    pub fn buffer_profiles(&self) -> &[PlaybackBufferProfile] {
        &self.buffer_profiles
    }
}

impl PlayerBackend for FakePlayerBackend {
    fn attach_video_surface(&mut self, _target: VideoSurfaceTarget) -> AppResult<()> {
        self.events.push("attach");
        Ok(())
    }

    fn load(&mut self, options: PlaybackLoadOptions) -> AppResult<()> {
        self.events.push("load");
        self.snapshot.loaded_url = Some(options.url);
        self.snapshot.paused = options.start_paused;
        Ok(())
    }

    fn stop(&mut self) -> AppResult<()> {
        self.events.push("stop");
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

    fn load_subtitle(&mut self, _path: &str) -> AppResult<()> {
        Ok(())
    }

    fn select_embedded_subtitle(&mut self, _stream_index: i64) -> AppResult<()> {
        Ok(())
    }

    fn disable_subtitle(&mut self) -> AppResult<()> {
        Ok(())
    }

    fn set_buffer_profile(&mut self, profile: PlaybackBufferProfile) -> AppResult<()> {
        self.buffer_profiles.push(profile);
        Ok(())
    }

    fn snapshot(&self) -> PlaybackSnapshot {
        self.snapshot.clone()
    }
}

pub struct UnavailablePlayerBackend {
    error: AppError,
}

impl UnavailablePlayerBackend {
    pub fn new(error: AppError) -> Self {
        Self { error }
    }

    fn unavailable(&self) -> AppError {
        self.error.clone()
    }
}

impl PlayerBackend for UnavailablePlayerBackend {
    fn attach_video_surface(&mut self, _target: VideoSurfaceTarget) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn load(&mut self, _options: PlaybackLoadOptions) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn stop(&mut self) -> AppResult<()> {
        Ok(())
    }

    fn set_paused(&mut self, _paused: bool) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn seek(&mut self, _position_seconds: f64) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn set_speed(&mut self, _speed: f64) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn set_volume(&mut self, _volume: u8) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn set_muted(&mut self, _muted: bool) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn set_fullscreen(&mut self, _fullscreen: bool) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn load_subtitle(&mut self, _path: &str) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn select_embedded_subtitle(&mut self, _stream_index: i64) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn disable_subtitle(&mut self) -> AppResult<()> {
        Err(self.unavailable())
    }

    fn snapshot(&self) -> PlaybackSnapshot {
        PlaybackSnapshot::default()
    }

    fn runtime_status(&self) -> PlaybackRuntimeStatus {
        PlaybackRuntimeStatus {
            core_ready: false,
            media_loaded: false,
            paused: false,
            paused_for_cache: false,
            cache_speed_bytes_per_second: None,
            position_seconds: 0.0,
            duration_seconds: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        FakePlayerBackend, HardwareDecoder, PlaybackBufferProfile, PlaybackLoadOptions,
        PlayerBackend, UnavailablePlayerBackend,
    };

    #[test]
    fn fake_backend_records_loaded_media_and_controls() {
        let mut backend = FakePlayerBackend::default();

        backend
            .load(PlaybackLoadOptions {
                url: "https://emby.example.test/video.mkv".into(),
                start_paused: false,
                hwdec: HardwareDecoder::VideoToolbox,
            })
            .unwrap();
        backend.set_paused(true).unwrap();
        backend.seek(125.0).unwrap();
        backend.set_speed(1.5).unwrap();

        assert_eq!(
            backend.loaded_url(),
            Some("https://emby.example.test/video.mkv")
        );
        assert!(backend.snapshot().paused);
        assert_eq!(backend.snapshot().position_seconds, 125.0);
        assert_eq!(backend.snapshot().speed, 1.5);
    }

    #[test]
    fn fake_backend_records_buffer_profile_updates() {
        let mut backend = FakePlayerBackend::default();

        backend
            .set_buffer_profile(PlaybackBufferProfile::Startup)
            .unwrap();
        backend
            .set_buffer_profile(PlaybackBufferProfile::Steady)
            .unwrap();

        assert_eq!(
            backend.buffer_profiles(),
            &[
                PlaybackBufferProfile::Startup,
                PlaybackBufferProfile::Steady
            ]
        );
    }

    #[test]
    fn unavailable_backend_returns_structured_playback_error() {
        let error = crate::errors::AppError::new(
            "libmpv_not_available",
            "未找到内置 libmpv 运行时，请检查应用安装包是否完整",
            None,
            true,
        );
        let mut backend = UnavailablePlayerBackend::new(error);

        let result = backend.load(PlaybackLoadOptions {
            url: "https://emby.example.test/video.mkv".into(),
            start_paused: false,
            hwdec: HardwareDecoder::VideoToolbox,
        });

        assert_eq!(result.unwrap_err().code, "libmpv_not_available");
        assert!(!backend.runtime_status().core_ready);
    }
}
