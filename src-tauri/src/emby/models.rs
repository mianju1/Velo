use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerSummary {
    pub id: String,
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub id: String,
    pub server_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedSessions {
    pub servers: Vec<ServerSummary>,
    pub accounts: Vec<AccountSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub id: String,
    pub name: String,
    pub url: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub server: ServerSummary,
    pub account: AccountSummary,
    pub access_token: String,
}

#[cfg(test)]
mod tests {
    use super::{AccountSummary, AuthSession, ServerSummary};

    #[test]
    fn auth_session_exposes_token_for_in_memory_api_requests() {
        let session = AuthSession {
            server: ServerSummary {
                id: "server-1".into(),
                name: "Home".into(),
                url: "https://emby.example.test".into(),
            },
            account: AccountSummary {
                id: "user-1".into(),
                server_id: "server-1".into(),
                name: "alice".into(),
            },
            access_token: "secret-token".into(),
        };

        let json = serde_json::to_string(&session).unwrap();

        assert!(json.contains("accessToken"));
        assert!(json.contains("secret-token"));
    }
}
