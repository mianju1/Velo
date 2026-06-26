use std::sync::Mutex;

use tauri::State;
use uuid::Uuid;

use crate::{
    emby::{
        client::normalize_server_url,
        models::{AccountSummary, AuthSession, SavedSessions, ServerInfo, ServerSummary},
    },
    errors::AppError,
    storage::encrypted_store::{EncryptedStore, StoredAccount},
    AppState,
};

#[tauri::command]
pub async fn list_saved_sessions(state: State<'_, AppState>) -> Result<SavedSessions, AppError> {
    let config = state.store.lock().map_err(lock_error)?.load_config()?;
    let accounts = config.account_summaries();

    Ok(SavedSessions {
        servers: config.servers,
        accounts,
    })
}

#[tauri::command]
pub async fn validate_server(
    server_url: String,
    state: State<'_, AppState>,
) -> Result<ServerInfo, AppError> {
    let url = normalize_server_url(&server_url)?;
    let info = state.emby.public_system_info(&url).await?;

    Ok(ServerInfo {
        id: info.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: info.server_name.unwrap_or_else(|| url.clone()),
        url,
        version: info.version,
    })
}

#[tauri::command]
pub async fn login(
    server_url: String,
    username: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<AuthSession, AppError> {
    let url = normalize_server_url(&server_url)?;
    let server_info = state.emby.public_system_info(&url).await?;
    let auth = state.emby.authenticate(&url, &username, &password).await?;
    let server = ServerSummary {
        id: server_info.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: server_info.server_name.unwrap_or_else(|| url.clone()),
        url,
    };
    let account = AccountSummary {
        id: auth.user.id.clone(),
        server_id: server.id.clone(),
        name: auth.user.name.clone(),
    };

    {
        let store = state.store.lock().map_err(lock_error)?;
        let mut config = store.load_config()?;
        config.upsert_server(server.clone());
        config.upsert_account(StoredAccount {
            id: account.id.clone(),
            server_id: account.server_id.clone(),
            name: account.name.clone(),
            access_token: auth.access_token.clone(),
        });
        store.save_config(&config)?;
    }

    Ok(AuthSession {
        server,
        account,
        access_token: auth.access_token,
    })
}

#[tauri::command]
pub async fn restore_session(
    server_id: String,
    account_id: String,
    state: State<'_, AppState>,
) -> Result<AuthSession, AppError> {
    let (server, account) = {
        let config = state.store.lock().map_err(lock_error)?.load_config()?;
        let server = config
            .servers
            .into_iter()
            .find(|item| item.id == server_id)
            .ok_or_else(|| AppError::bad_request("server_not_found", "未找到已保存服务器"))?;
        let account = config
            .accounts
            .into_iter()
            .find(|item| item.id == account_id && item.server_id == server.id)
            .ok_or_else(|| AppError::bad_request("account_not_found", "未找到已保存账号"))?;
        (server, account)
    };

    state
        .emby
        .validate_token(&server.url, &account.access_token, &account.id)
        .await?;

    Ok(AuthSession {
        server,
        account: AccountSummary {
            id: account.id,
            server_id: account.server_id,
            name: account.name,
        },
        access_token: account.access_token,
    })
}

#[tauri::command]
pub async fn remove_server(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<SavedSessions, AppError> {
    let store = state.store.lock().map_err(lock_error)?;
    let mut config = store.load_config()?;
    config.servers.retain(|server| server.id != server_id);
    config
        .accounts
        .retain(|account| account.server_id != server_id);
    store.save_config(&config)?;
    let accounts = config.account_summaries();

    Ok(SavedSessions {
        servers: config.servers,
        accounts,
    })
}

#[tauri::command]
pub async fn remove_account(
    server_id: String,
    account_id: String,
    state: State<'_, AppState>,
) -> Result<SavedSessions, AppError> {
    let store = state.store.lock().map_err(lock_error)?;
    let mut config = store.load_config()?;
    if !config.remove_account(&server_id, &account_id) {
        return Err(AppError::bad_request(
            "account_not_found",
            "未找到已保存账号",
        ));
    }

    store.save_config(&config)?;
    let accounts = config.account_summaries();

    Ok(SavedSessions {
        servers: config.servers,
        accounts,
    })
}

pub fn default_store_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("velo")
        .join("config.enc.json")
}

use std::path::PathBuf;

pub fn create_store() -> Mutex<EncryptedStore> {
    Mutex::new(EncryptedStore::new(default_store_path()))
}

fn lock_error<T>(error: std::sync::PoisonError<T>) -> AppError {
    AppError::new(
        "state_lock_error",
        "应用状态暂时不可用",
        Some(error.to_string()),
        true,
    )
}
