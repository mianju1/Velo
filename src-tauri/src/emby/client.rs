use crate::errors::{AppError, AppResult};
use crate::player::source::PlaybackInfo;
use serde::{Deserialize, Serialize};

pub fn normalize_server_url(input: &str) -> AppResult<String> {
    let trimmed = input.trim().trim_end_matches('/');

    if trimmed.is_empty() {
        return Err(AppError::bad_request(
            "server_url_invalid",
            "服务器地址不能为空",
        ));
    }

    if trimmed.contains("://")
        && !(trimmed.starts_with("http://") || trimmed.starts_with("https://"))
    {
        return Err(AppError::bad_request(
            "server_url_invalid",
            "服务器地址必须以 http:// 或 https:// 开头",
        ));
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }

    let scheme = match port_from_host(trimmed) {
        Some("443") => "https",
        Some("80") => "http",
        Some(_) => "http",
        None => "https",
    };

    Ok(format!("{scheme}://{trimmed}"))
}

fn port_from_host(input: &str) -> Option<&str> {
    let (_, port) = input.rsplit_once(':')?;
    if port.chars().all(|item| item.is_ascii_digit()) {
        Some(port)
    } else {
        None
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PublicSystemInfo {
    pub id: Option<String>,
    pub server_name: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AuthResponse {
    pub access_token: String,
    pub user: EmbyUser,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EmbyUser {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "PascalCase")]
struct AuthRequest<'a> {
    username: &'a str,
    pw: &'a str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct PlaybackStartReport {
    pub item_id: String,
    pub media_source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub play_session_id: Option<String>,
    pub position_ticks: u64,
    pub is_paused: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct PlaybackStopReport {
    pub item_id: String,
    pub media_source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub play_session_id: Option<String>,
    pub position_ticks: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct PlaybackProgressReport {
    pub item_id: String,
    pub media_source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub play_session_id: Option<String>,
    pub position_ticks: u64,
    pub is_paused: bool,
}

#[derive(Clone)]
pub struct EmbyClient {
    http: reqwest::Client,
}

impl EmbyClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    pub async fn public_system_info(&self, server_url: &str) -> AppResult<PublicSystemInfo> {
        let url = format!("{}/System/Info/Public", normalize_server_url(server_url)?);
        self.http
            .get(url)
            .header("X-Emby-Authorization", emby_auth_header(None))
            .send()
            .await
            .map_err(|error| AppError::network("无法连接 Emby 服务器", error))?
            .error_for_status()
            .map_err(|error| AppError::network("Emby 服务器校验失败", error))?
            .json::<PublicSystemInfo>()
            .await
            .map_err(|error| AppError::network("Emby 服务器响应格式无效", error))
    }

    pub async fn authenticate(
        &self,
        server_url: &str,
        username: &str,
        password: &str,
    ) -> AppResult<AuthResponse> {
        let url = format!(
            "{}/Users/AuthenticateByName",
            normalize_server_url(server_url)?
        );
        self.http
            .post(url)
            .header("X-Emby-Authorization", emby_auth_header(None))
            .json(&AuthRequest {
                username,
                pw: password,
            })
            .send()
            .await
            .map_err(|error| AppError::network("无法连接 Emby 服务器", error))?
            .error_for_status()
            .map_err(|error| {
                AppError::new(
                    "login_rejected",
                    "登录失败，请检查账号和密码",
                    Some(error.to_string()),
                    true,
                )
            })?
            .json::<AuthResponse>()
            .await
            .map_err(|error| AppError::network("登录响应格式无效", error))
    }

    pub async fn validate_token(
        &self,
        server_url: &str,
        access_token: &str,
        user_id: &str,
    ) -> AppResult<()> {
        let url = format!("{}/Users/{}", normalize_server_url(server_url)?, user_id);
        self.http
            .get(url)
            .header("X-Emby-Authorization", emby_auth_header(Some(access_token)))
            .send()
            .await
            .map_err(|error| AppError::network("无法连接 Emby 服务器", error))?
            .error_for_status()
            .map_err(|error| {
                AppError::new(
                    "token_expired",
                    "登录已失效，请重新登录",
                    Some(error.to_string()),
                    true,
                )
            })?;
        Ok(())
    }

    pub async fn playback_info(
        &self,
        server_url: &str,
        access_token: &str,
        user_id: &str,
        item_id: &str,
        media_source_id: Option<&str>,
    ) -> AppResult<PlaybackInfo> {
        let url = format!(
            "{}/Items/{}/PlaybackInfo",
            normalize_server_url(server_url)?,
            item_id
        );
        let mut request = self
            .http
            .post(url)
            .header("X-Emby-Authorization", emby_auth_header(Some(access_token)))
            .query(&[("UserId", user_id)])
            .json(&serde_json::json!({}));

        if let Some(media_source_id) = media_source_id {
            request = request.query(&[("MediaSourceId", media_source_id)]);
        }

        request
            .send()
            .await
            .map_err(|error| AppError::network("无法请求播放信息", error))?
            .error_for_status()
            .map_err(|error| AppError::network("播放信息请求失败", error))?
            .json::<PlaybackInfo>()
            .await
            .map_err(|error| AppError::network("播放信息响应格式无效", error))
    }

    pub async fn report_playback_started(
        &self,
        server_url: &str,
        access_token: &str,
        report: &PlaybackStartReport,
    ) -> AppResult<()> {
        self.post_playback_report(server_url, access_token, "/Sessions/Playing", report)
            .await
    }

    pub async fn report_playback_stopped(
        &self,
        server_url: &str,
        access_token: &str,
        report: &PlaybackStopReport,
    ) -> AppResult<()> {
        self.post_playback_report(
            server_url,
            access_token,
            "/Sessions/Playing/Stopped",
            report,
        )
        .await
    }

    pub async fn report_playback_progress(
        &self,
        server_url: &str,
        access_token: &str,
        report: &PlaybackProgressReport,
    ) -> AppResult<()> {
        self.post_playback_report(
            server_url,
            access_token,
            "/Sessions/Playing/Progress",
            report,
        )
        .await
    }

    async fn post_playback_report<T: Serialize + ?Sized>(
        &self,
        server_url: &str,
        access_token: &str,
        path: &str,
        report: &T,
    ) -> AppResult<()> {
        let url = format!("{}{}", normalize_server_url(server_url)?, path);
        self.http
            .post(url)
            .header("X-Emby-Authorization", emby_auth_header(Some(access_token)))
            .json(report)
            .send()
            .await
            .map_err(|error| AppError::network("无法上报播放状态", error))?
            .error_for_status()
            .map_err(|error| AppError::network("播放状态上报失败", error))?;
        Ok(())
    }
}

impl Default for EmbyClient {
    fn default() -> Self {
        Self::new()
    }
}

fn emby_auth_header(token: Option<&str>) -> String {
    let mut value =
        r#"MediaBrowser Client="Velo", Device="macOS", DeviceId="velo", Version="0.1.0""#
            .to_string();
    if let Some(token) = token {
        value.push_str(&format!(r#", Token="{token}""#));
    }
    value
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc::{self, Receiver},
        thread,
    };

    use super::{
        normalize_server_url, EmbyClient, PlaybackProgressReport, PlaybackStartReport,
        PlaybackStopReport,
    };

    #[test]
    fn normalize_server_url_trims_spaces_and_trailing_slashes() {
        let url = normalize_server_url(" https://emby.example.test/// ").unwrap();

        assert_eq!(url, "https://emby.example.test");
    }

    #[test]
    fn normalize_server_url_accepts_domain_and_port_without_scheme() {
        assert_eq!(
            normalize_server_url("emby.example.test:80").unwrap(),
            "http://emby.example.test:80"
        );
        assert_eq!(
            normalize_server_url("emby.example.test:443").unwrap(),
            "https://emby.example.test:443"
        );
        assert_eq!(
            normalize_server_url("emby.example.test:8096").unwrap(),
            "http://emby.example.test:8096"
        );
    }

    #[test]
    fn normalize_server_url_defaults_bare_domain_to_https() {
        let url = normalize_server_url("emby.example.test").unwrap();

        assert_eq!(url, "https://emby.example.test");
    }

    #[tokio::test]
    async fn validate_token_requests_saved_user_id_instead_of_users_me() {
        let (server_url, received) = spawn_test_server("{}");
        let client = EmbyClient::new();

        client
            .validate_token(&server_url, "stored-token", "user-1")
            .await
            .unwrap();
        let request = received.recv().unwrap();

        assert!(request.contains("GET /Users/user-1 HTTP/1.1"));
        assert!(request.contains(r#"Token="stored-token""#));
    }

    #[tokio::test]
    async fn playback_info_posts_with_user_media_source_and_stored_token_without_quality_limits() {
        let (server_url, received) = spawn_test_server(
            r#"{"PlaySessionId":"play-session-1","MediaSources":[{"Id":"source-1","Path":"https://emby.example.test/video.mp4","SupportsDirectPlay":true,"SupportsTranscoding":false,"TranscodingUrl":null,"Protocol":"Http"}]}"#,
        );
        let client = EmbyClient::new();

        let playback = client
            .playback_info(
                &server_url,
                "stored-token",
                "user-1",
                "item-1",
                Some("source-1"),
            )
            .await
            .unwrap();
        let request = received.recv().unwrap();

        assert_eq!(playback.media_sources[0].id, "source-1");
        assert_eq!(playback.play_session_id.as_deref(), Some("play-session-1"));
        assert!(request.contains("POST /Items/item-1/PlaybackInfo?"));
        assert!(request.contains("UserId=user-1"));
        assert!(request.contains("MediaSourceId=source-1"));
        assert!(!request.contains("MaxStreamingBitrate"));
        assert!(!request.contains("MaxHeight"));
        assert!(request.contains(r#"Token="stored-token""#));
    }

    #[tokio::test]
    async fn report_playback_started_posts_session_payload_with_token() {
        let (server_url, received) = spawn_test_server("{}");
        let client = EmbyClient::new();

        client
            .report_playback_started(
                &server_url,
                "stored-token",
                &PlaybackStartReport {
                    item_id: "item-1".into(),
                    media_source_id: "source-1".into(),
                    play_session_id: Some("play-session-1".into()),
                    position_ticks: 0,
                    is_paused: false,
                },
            )
            .await
            .unwrap();
        let request = received.recv().unwrap();

        assert!(request.contains("POST /Sessions/Playing HTTP/1.1"));
        assert!(request.contains(r#"Token="stored-token""#));
        assert!(request.contains(r#""ItemId":"item-1""#));
        assert!(request.contains(r#""MediaSourceId":"source-1""#));
        assert!(request.contains(r#""PlaySessionId":"play-session-1""#));
        assert!(request.contains(r#""PositionTicks":0"#));
        assert!(request.contains(r#""IsPaused":false"#));
    }

    #[tokio::test]
    async fn report_playback_stopped_posts_final_position_with_token() {
        let (server_url, received) = spawn_test_server("{}");
        let client = EmbyClient::new();

        client
            .report_playback_stopped(
                &server_url,
                "stored-token",
                &PlaybackStopReport {
                    item_id: "item-1".into(),
                    media_source_id: "source-1".into(),
                    play_session_id: Some("play-session-1".into()),
                    position_ticks: 2400,
                },
            )
            .await
            .unwrap();
        let request = received.recv().unwrap();

        assert!(request.contains("POST /Sessions/Playing/Stopped HTTP/1.1"));
        assert!(request.contains(r#"Token="stored-token""#));
        assert!(request.contains(r#""ItemId":"item-1""#));
        assert!(request.contains(r#""PositionTicks":2400"#));
    }

    #[tokio::test]
    async fn report_playback_progress_posts_current_position_with_token() {
        let (server_url, received) = spawn_test_server("{}");
        let client = EmbyClient::new();

        client
            .report_playback_progress(
                &server_url,
                "stored-token",
                &PlaybackProgressReport {
                    item_id: "item-1".into(),
                    media_source_id: "source-1".into(),
                    play_session_id: Some("play-session-1".into()),
                    position_ticks: 150_000_000,
                    is_paused: false,
                },
            )
            .await
            .unwrap();
        let request = received.recv().unwrap();

        assert!(request.contains("POST /Sessions/Playing/Progress HTTP/1.1"));
        assert!(request.contains(r#"Token="stored-token""#));
        assert!(request.contains(r#""ItemId":"item-1""#));
        assert!(request.contains(r#""MediaSourceId":"source-1""#));
        assert!(request.contains(r#""PlaySessionId":"play-session-1""#));
        assert!(request.contains(r#""PositionTicks":150000000"#));
        assert!(request.contains(r#""IsPaused":false"#));
    }

    fn spawn_test_server(response_body: &'static str) -> (String, Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (tx, rx) = mpsc::channel();

        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 4096];
            let size = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..size]).to_string();
            tx.send(request).unwrap();

            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).unwrap();
        });

        (url, rx)
    }
}
