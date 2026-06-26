#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaybackSession {
    pub server_id: String,
    pub user_id: String,
    pub item_id: String,
    pub media_source_id: String,
    pub play_session_id: Option<String>,
    pub position_ticks: u64,
    pub paused: bool,
    pub volume: u8,
    pub muted: bool,
    pub fullscreen: bool,
    pub ended: bool,
    pub last_error: Option<String>,
    pub speed: PlaybackSpeed,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlaybackSpeed(pub f64);

impl Eq for PlaybackSpeed {}

#[derive(Debug, Default)]
pub struct PlaybackSessionState {
    current: Option<PlaybackSession>,
}

impl PlaybackSessionState {
    pub fn start(&mut self, session: PlaybackSession) {
        self.current = Some(session);
    }

    pub fn stop(&mut self) -> Option<PlaybackSession> {
        self.current.take()
    }

    pub fn current(&self) -> Option<&PlaybackSession> {
        self.current.as_ref()
    }

    pub fn update_position(&mut self, position_ticks: u64) {
        if let Some(session) = self.current.as_mut() {
            session.position_ticks = position_ticks;
        }
    }

    pub fn set_paused(&mut self, paused: bool) {
        if let Some(session) = self.current.as_mut() {
            session.paused = paused;
        }
    }

    pub fn set_speed(&mut self, speed: f64) {
        if let Some(session) = self.current.as_mut() {
            session.speed = PlaybackSpeed(speed);
        }
    }

    pub fn set_volume(&mut self, volume: u8) {
        if let Some(session) = self.current.as_mut() {
            session.volume = volume.min(100);
        }
    }

    pub fn set_muted(&mut self, muted: bool) {
        if let Some(session) = self.current.as_mut() {
            session.muted = muted;
        }
    }

    pub fn set_fullscreen(&mut self, fullscreen: bool) {
        if let Some(session) = self.current.as_mut() {
            session.fullscreen = fullscreen;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{PlaybackSession, PlaybackSessionState, PlaybackSpeed};

    #[test]
    fn records_current_playback_session_state() {
        let mut state = PlaybackSessionState::default();
        let session = PlaybackSession {
            server_id: "server-1".into(),
            user_id: "user-1".into(),
            item_id: "item-1".into(),
            media_source_id: "source-1".into(),
            play_session_id: Some("play-session-1".into()),
            position_ticks: 0,
            paused: false,
            volume: 100,
            muted: false,
            fullscreen: false,
            ended: false,
            last_error: None,
            speed: PlaybackSpeed(1.0),
        };

        state.start(session.clone());

        assert_eq!(state.current(), Some(&session));
    }

    #[test]
    fn stopping_session_returns_and_clears_current_session() {
        let mut state = PlaybackSessionState::default();
        state.start(PlaybackSession {
            server_id: "server-1".into(),
            user_id: "user-1".into(),
            item_id: "item-1".into(),
            media_source_id: "source-1".into(),
            play_session_id: Some("play-session-1".into()),
            position_ticks: 1200,
            paused: true,
            volume: 100,
            muted: false,
            fullscreen: false,
            ended: false,
            last_error: None,
            speed: PlaybackSpeed(1.0),
        });

        let stopped = state.stop().unwrap();

        assert_eq!(stopped.item_id, "item-1");
        assert_eq!(stopped.position_ticks, 1200);
        assert!(stopped.paused);
        assert!(state.current().is_none());
    }

    #[test]
    fn updates_runtime_playback_state() {
        let mut state = PlaybackSessionState::default();
        state.start(PlaybackSession {
            server_id: "server-1".into(),
            user_id: "user-1".into(),
            item_id: "item-1".into(),
            media_source_id: "source-1".into(),
            play_session_id: Some("play-session-1".into()),
            position_ticks: 0,
            paused: false,
            volume: 100,
            muted: false,
            fullscreen: false,
            ended: false,
            last_error: None,
            speed: PlaybackSpeed(1.0),
        });

        state.update_position(90_000_000);
        state.set_paused(true);
        state.set_speed(1.25);

        let current = state.current().unwrap();
        assert_eq!(current.position_ticks, 90_000_000);
        assert!(current.paused);
        assert_eq!(current.speed, PlaybackSpeed(1.25));
    }
}
