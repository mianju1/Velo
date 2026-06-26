use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
    pub recoverable: bool,
}

impl AppError {
    pub fn new(code: &str, message: &str, detail: Option<String>, recoverable: bool) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
            detail,
            recoverable,
        }
    }

    pub fn bad_request(code: &str, message: &str) -> Self {
        Self::new(code, message, None, true)
    }

    pub fn storage(message: &str, detail: impl ToString) -> Self {
        Self::new("storage_error", message, Some(detail.to_string()), true)
    }

    pub fn network(message: &str, detail: impl ToString) -> Self {
        Self::new("network_error", message, Some(detail.to_string()), true)
    }
}
