use serde::{Deserialize, Serialize};

use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct PlaybackInfo {
    #[serde(default)]
    pub play_session_id: Option<String>,
    #[serde(default)]
    pub media_sources: Vec<MediaSourceInfo>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct MediaSourceInfo {
    pub id: String,
    pub path: Option<String>,
    pub container: Option<String>,
    #[serde(default)]
    pub supports_direct_play: bool,
    #[serde(default)]
    pub supports_direct_stream: bool,
    #[serde(default)]
    pub supports_transcoding: bool,
    pub direct_stream_url: Option<String>,
    pub transcoding_url: Option<String>,
    pub protocol: PlaybackProtocol,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub enum PlaybackProtocol {
    File,
    Http,
    Rtmp,
    Rtsp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackMediaSource {
    Direct {
        media_source_id: String,
        url: String,
    },
    Transcode {
        media_source_id: String,
        url: String,
    },
}

pub fn select_playback_source(
    playback: &PlaybackInfo,
    server_url: &str,
    item_id: &str,
    access_token: &str,
    preferred_media_source_id: Option<&str>,
    prefer_transcode: bool,
) -> AppResult<PlaybackMediaSource> {
    let sources = ordered_sources(playback, preferred_media_source_id);

    if prefer_transcode {
        if let Some(source) = sources
            .iter()
            .find(|source| source.supports_transcoding && source.transcoding_url.is_some())
        {
            return Ok(PlaybackMediaSource::Transcode {
                media_source_id: source.id.clone(),
                url: absolute_url(server_url, source.transcoding_url.as_deref().unwrap_or("")),
            });
        }
    }

    for source in &sources {
        if source.supports_direct_play && source.protocol == PlaybackProtocol::Http {
            if let Some(path) = &source.path {
                return Ok(PlaybackMediaSource::Direct {
                    media_source_id: source.id.clone(),
                    url: absolute_url(server_url, path),
                });
            }
        }
    }

    for source in &sources {
        if source.supports_direct_stream
            || (source.supports_direct_play && source.protocol == PlaybackProtocol::File)
        {
            return Ok(PlaybackMediaSource::Direct {
                media_source_id: source.id.clone(),
                url: source
                    .direct_stream_url
                    .as_deref()
                    .map(|url| absolute_url(server_url, url))
                    .unwrap_or_else(|| {
                        build_direct_stream_url(server_url, item_id, source, access_token)
                    }),
            });
        }
    }

    for source in &sources {
        if source.supports_transcoding {
            if let Some(transcoding_url) = &source.transcoding_url {
                return Ok(PlaybackMediaSource::Transcode {
                    media_source_id: source.id.clone(),
                    url: absolute_url(server_url, transcoding_url),
                });
            }
        }
    }

    // Emby 的默认 PlaybackInfo 可能按 Web 客户端能力把直连标记为不可用，
    // 但 libmpv 仍可直接播放 HTTP URL，或通过 Emby stream 接口读取文件协议源。
    for source in &sources {
        if source.protocol == PlaybackProtocol::Http {
            if let Some(path) = &source.path {
                return Ok(PlaybackMediaSource::Direct {
                    media_source_id: source.id.clone(),
                    url: absolute_url(server_url, path),
                });
            }
        }

        if let Some(direct_stream_url) = &source.direct_stream_url {
            return Ok(PlaybackMediaSource::Direct {
                media_source_id: source.id.clone(),
                url: absolute_url(server_url, direct_stream_url),
            });
        }

        if source.protocol == PlaybackProtocol::File
            && (source.path.is_some() || source.container.is_some())
        {
            return Ok(PlaybackMediaSource::Direct {
                media_source_id: source.id.clone(),
                url: build_direct_stream_url(server_url, item_id, source, access_token),
            });
        }
    }

    Err(AppError::new(
        "playback_source_unavailable",
        "没有可播放的媒体源",
        None,
        true,
    ))
}

fn ordered_sources<'a>(
    playback: &'a PlaybackInfo,
    preferred_media_source_id: Option<&str>,
) -> Vec<&'a MediaSourceInfo> {
    let mut sources: Vec<&MediaSourceInfo> = playback.media_sources.iter().collect();
    if let Some(preferred) = preferred_media_source_id {
        sources.sort_by_key(|source| if source.id == preferred { 0 } else { 1 });
    }
    sources
}

fn absolute_url(server_url: &str, path: &str) -> String {
    if path.starts_with("http://") || path.starts_with("https://") {
        return path.to_string();
    }

    format!(
        "{}/{}",
        server_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

fn build_direct_stream_url(
    server_url: &str,
    item_id: &str,
    source: &MediaSourceInfo,
    access_token: &str,
) -> String {
    let extension = source
        .container
        .as_deref()
        .map(|container| format!(".{container}"))
        .unwrap_or_default();

    format!(
        "{}/Videos/{}/stream{}?static=true&MediaSourceId={}&api_key={}",
        server_url.trim_end_matches('/'),
        item_id,
        extension,
        source.id,
        access_token,
    )
}

#[cfg(test)]
mod tests {
    use super::{
        select_playback_source, MediaSourceInfo, PlaybackInfo, PlaybackMediaSource,
        PlaybackProtocol,
    };

    #[test]
    fn selects_direct_play_when_source_supports_http_direct_stream() {
        let playback = PlaybackInfo {
            play_session_id: None,
            media_sources: vec![MediaSourceInfo {
                id: "source-1".into(),
                path: Some("https://emby.example.test/video.mp4".into()),
                container: None,
                supports_direct_play: true,
                supports_direct_stream: false,
                supports_transcoding: true,
                direct_stream_url: None,
                transcoding_url: Some("/Videos/item/master.m3u8".into()),
                protocol: PlaybackProtocol::Http,
            }],
        };

        let selected = select_playback_source(
            &playback,
            "https://emby.example.test",
            "item-1",
            "token",
            None,
            false,
        )
        .unwrap();

        assert_eq!(
            selected,
            PlaybackMediaSource::Direct {
                media_source_id: "source-1".into(),
                url: "https://emby.example.test/video.mp4".into(),
            }
        );
    }

    #[test]
    fn falls_back_to_transcoding_when_direct_play_is_unavailable() {
        let playback = PlaybackInfo {
            play_session_id: None,
            media_sources: vec![MediaSourceInfo {
                id: "source-1".into(),
                path: None,
                container: None,
                supports_direct_play: false,
                supports_direct_stream: false,
                supports_transcoding: true,
                direct_stream_url: None,
                transcoding_url: Some("/Videos/item/master.m3u8".into()),
                protocol: PlaybackProtocol::Http,
            }],
        };

        let selected = select_playback_source(
            &playback,
            "https://emby.example.test/",
            "item-1",
            "token",
            None,
            false,
        )
        .unwrap();

        assert_eq!(
            selected,
            PlaybackMediaSource::Transcode {
                media_source_id: "source-1".into(),
                url: "https://emby.example.test/Videos/item/master.m3u8".into(),
            }
        );
    }

    #[test]
    fn can_prefer_transcoding_when_requested_by_caller() {
        let playback = PlaybackInfo {
            play_session_id: None,
            media_sources: vec![MediaSourceInfo {
                id: "source-1".into(),
                path: Some("https://emby.example.test/original.mp4".into()),
                container: None,
                supports_direct_play: true,
                supports_direct_stream: true,
                supports_transcoding: true,
                direct_stream_url: None,
                transcoding_url: Some("/Videos/item/master.m3u8".into()),
                protocol: PlaybackProtocol::Http,
            }],
        };

        let selected = select_playback_source(
            &playback,
            "https://emby.example.test/",
            "item-1",
            "token",
            None,
            true,
        )
        .unwrap();

        assert_eq!(
            selected,
            PlaybackMediaSource::Transcode {
                media_source_id: "source-1".into(),
                url: "https://emby.example.test/Videos/item/master.m3u8".into(),
            }
        );
    }

    #[test]
    fn falls_back_to_http_path_when_server_flags_direct_play_unavailable() {
        let playback = PlaybackInfo {
            play_session_id: None,
            media_sources: vec![MediaSourceInfo {
                id: "source-1".into(),
                path: Some("https://emby.example.test/video.mkv".into()),
                container: Some("mkv".into()),
                supports_direct_play: false,
                supports_direct_stream: false,
                supports_transcoding: false,
                direct_stream_url: None,
                transcoding_url: None,
                protocol: PlaybackProtocol::Http,
            }],
        };

        let selected = select_playback_source(
            &playback,
            "https://emby.example.test",
            "item-1",
            "token",
            None,
            false,
        )
        .unwrap();

        assert_eq!(
            selected,
            PlaybackMediaSource::Direct {
                media_source_id: "source-1".into(),
                url: "https://emby.example.test/video.mkv".into(),
            }
        );
    }

    #[test]
    fn returns_error_when_no_playable_source_exists() {
        let playback = PlaybackInfo {
            play_session_id: None,
            media_sources: vec![MediaSourceInfo {
                id: "source-1".into(),
                path: None,
                container: None,
                supports_direct_play: false,
                supports_direct_stream: false,
                supports_transcoding: false,
                direct_stream_url: None,
                transcoding_url: None,
                protocol: PlaybackProtocol::File,
            }],
        };

        let error = select_playback_source(
            &playback,
            "https://emby.example.test",
            "item-1",
            "token",
            None,
            false,
        )
        .unwrap_err();

        assert_eq!(error.code, "playback_source_unavailable");
    }

    #[test]
    fn builds_direct_stream_url_for_file_protocol_sources() {
        let playback = PlaybackInfo {
            play_session_id: None,
            media_sources: vec![MediaSourceInfo {
                id: "source-1".into(),
                path: Some("/mnt/media/movie.mkv".into()),
                container: Some("mkv".into()),
                supports_direct_play: true,
                supports_direct_stream: true,
                supports_transcoding: true,
                direct_stream_url: None,
                transcoding_url: None,
                protocol: PlaybackProtocol::File,
            }],
        };

        let selected = select_playback_source(
            &playback,
            "https://emby.example.test",
            "item-1",
            "stored-token",
            None,
            false,
        )
        .unwrap();

        assert_eq!(
            selected,
            PlaybackMediaSource::Direct {
                media_source_id: "source-1".into(),
                url: "https://emby.example.test/Videos/item-1/stream.mkv?static=true&MediaSourceId=source-1&api_key=stored-token".into(),
            }
        );
    }
}
