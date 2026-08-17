use serde::Serialize;

#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub retryable: bool,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail: None,
            retryable,
        }
    }

    pub fn detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new("INVALID_INPUT", message, false)
    }

    pub fn no_session() -> Self {
        Self::new("NOT_CONNECTED", "Connect to Navidrome first.", false)
    }

    pub fn storage() -> Self {
        Self::new(
            "STORAGE_ERROR",
            "The local profile could not be saved safely.",
            true,
        )
    }

    pub fn credential() -> Self {
        Self::new(
            "CREDENTIAL_ERROR",
            "Windows Credential Manager could not be accessed.",
            true,
        )
    }
}

pub type AppResult<T> = Result<T, AppError>;
