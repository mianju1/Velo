use std::{fs, path::PathBuf};

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::emby::models::{AccountSummary, ServerSummary};
use crate::errors::{AppError, AppResult};

const STORE_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAccount {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub access_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredConfig {
    pub servers: Vec<ServerSummary>,
    pub accounts: Vec<StoredAccount>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedFile {
    version: u8,
    nonce: String,
    ciphertext: String,
}

pub struct EncryptedStore {
    path: PathBuf,
    key_seed: String,
}

impl EncryptedStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            key_seed: "velo-local-store".to_string(),
            path,
        }
    }

    pub fn save_config(&self, config: &StoredConfig) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| AppError::storage("无法创建配置目录", error))?;
        }

        let plaintext = serde_json::to_vec(config)
            .map_err(|error| AppError::storage("无法序列化配置", error))?;
        let cipher = self.cipher();
        let mut nonce_bytes = [0_u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_ref())
            .map_err(|error| AppError::storage("无法加密本地配置", error))?;
        let file = EncryptedFile {
            version: STORE_VERSION,
            nonce: STANDARD.encode(nonce_bytes),
            ciphertext: STANDARD.encode(ciphertext),
        };
        let encoded = serde_json::to_string_pretty(&file)
            .map_err(|error| AppError::storage("无法编码配置文件", error))?;

        fs::write(&self.path, encoded)
            .map_err(|error| AppError::storage("无法写入配置文件", error))?;
        Ok(())
    }

    pub fn load_config(&self) -> AppResult<StoredConfig> {
        if !self.path.exists() {
            return Ok(StoredConfig::default());
        }

        let encoded = fs::read_to_string(&self.path)
            .map_err(|error| AppError::storage("无法读取配置文件", error))?;
        let file: EncryptedFile = serde_json::from_str(&encoded)
            .map_err(|error| AppError::storage("配置文件格式无效", error))?;

        if file.version != STORE_VERSION {
            return Err(AppError::new(
                "storage_version_unsupported",
                "本地配置版本不受支持",
                Some(file.version.to_string()),
                true,
            ));
        }

        let nonce = STANDARD
            .decode(file.nonce)
            .map_err(|error| AppError::storage("配置文件 nonce 无效", error))?;
        let ciphertext = STANDARD
            .decode(file.ciphertext)
            .map_err(|error| AppError::storage("配置文件密文无效", error))?;
        let plaintext = self
            .cipher()
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|error| AppError::storage("无法解密本地配置，需要重新登录", error))?;

        serde_json::from_slice(&plaintext)
            .map_err(|error| AppError::storage("配置内容格式无效", error))
    }

    fn cipher(&self) -> Aes256Gcm {
        let mut hasher = Sha256::new();
        hasher.update(self.key_seed.as_bytes());
        hasher.update(self.path.to_string_lossy().as_bytes());
        let key = hasher.finalize();

        Aes256Gcm::new_from_slice(&key).expect("sha256 output is always a valid AES-256 key")
    }
}

impl Default for StoredConfig {
    fn default() -> Self {
        Self {
            servers: Vec::new(),
            accounts: Vec::new(),
        }
    }
}

impl StoredConfig {
    pub fn account_summaries(&self) -> Vec<AccountSummary> {
        self.accounts
            .iter()
            .map(|account| AccountSummary {
                id: account.id.clone(),
                server_id: account.server_id.clone(),
                name: account.name.clone(),
            })
            .collect()
    }

    pub fn upsert_server(&mut self, server: ServerSummary) {
        if let Some(existing) = self.servers.iter_mut().find(|item| item.id == server.id) {
            *existing = server;
        } else {
            self.servers.push(server);
        }
    }

    pub fn upsert_account(&mut self, account: StoredAccount) {
        if let Some(index) = self
            .accounts
            .iter_mut()
            .position(|item| item.id == account.id && item.server_id == account.server_id)
        {
            self.accounts.remove(index);
        }

        self.accounts.push(account);
    }

    pub fn remove_account(&mut self, server_id: &str, account_id: &str) -> bool {
        let original_count = self.accounts.len();
        self.accounts
            .retain(|account| account.server_id != server_id || account.id != account_id);
        let removed = self.accounts.len() != original_count;

        if removed
            && !self
                .accounts
                .iter()
                .any(|account| account.server_id == server_id)
        {
            self.servers.retain(|server| server.id != server_id);
        }

        removed
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{EncryptedStore, StoredAccount, StoredConfig};
    use crate::emby::models::ServerSummary;

    #[test]
    fn saved_config_does_not_write_token_as_plain_text() {
        let path =
            std::env::temp_dir().join(format!("velo-store-{}.json", std::process::id()));
        let store = EncryptedStore::new(path.clone());
        let config = StoredConfig {
            servers: vec![ServerSummary {
                id: "server-1".into(),
                name: "Home".into(),
                url: "https://emby.example.test".into(),
            }],
            accounts: vec![StoredAccount {
                id: "user-1".into(),
                server_id: "server-1".into(),
                name: "alice".into(),
                access_token: "secret-token".into(),
            }],
        };

        store.save_config(&config).unwrap();

        let file = fs::read_to_string(&path).unwrap();
        let loaded = store.load_config().unwrap();
        let _ = fs::remove_file(&path);

        assert!(!file.contains("secret-token"));
        assert_eq!(loaded.accounts[0].access_token, "secret-token");
    }

    #[test]
    fn account_summaries_do_not_expose_tokens() {
        let config = StoredConfig {
            servers: Vec::new(),
            accounts: vec![StoredAccount {
                id: "user-1".into(),
                server_id: "server-1".into(),
                name: "alice".into(),
                access_token: "secret-token".into(),
            }],
        };

        let summary_json = serde_json::to_string(&config.account_summaries()).unwrap();

        assert!(summary_json.contains("alice"));
        assert!(!summary_json.contains("secret-token"));
    }

    #[test]
    fn upsert_account_moves_existing_account_to_end_as_recent_login() {
        let mut config = StoredConfig {
            servers: Vec::new(),
            accounts: vec![
                StoredAccount {
                    id: "user-1".into(),
                    server_id: "server-1".into(),
                    name: "alice".into(),
                    access_token: "token-1".into(),
                },
                StoredAccount {
                    id: "user-2".into(),
                    server_id: "server-1".into(),
                    name: "bob".into(),
                    access_token: "token-2".into(),
                },
            ],
        };

        config.upsert_account(StoredAccount {
            id: "user-1".into(),
            server_id: "server-1".into(),
            name: "alice".into(),
            access_token: "new-token".into(),
        });

        let account_ids = config
            .account_summaries()
            .into_iter()
            .map(|account| account.id)
            .collect::<Vec<_>>();

        assert_eq!(account_ids, vec!["user-2", "user-1"]);
    }

    #[test]
    fn remove_account_deletes_only_selected_account_and_prunes_empty_servers() {
        let mut config = StoredConfig {
            servers: vec![
                ServerSummary {
                    id: "server-1".into(),
                    name: "Home".into(),
                    url: "https://emby.example.test".into(),
                },
                ServerSummary {
                    id: "server-2".into(),
                    name: "Remote".into(),
                    url: "https://remote.example.test".into(),
                },
            ],
            accounts: vec![
                StoredAccount {
                    id: "user-1".into(),
                    server_id: "server-1".into(),
                    name: "alice".into(),
                    access_token: "token-1".into(),
                },
                StoredAccount {
                    id: "user-2".into(),
                    server_id: "server-1".into(),
                    name: "bob".into(),
                    access_token: "token-2".into(),
                },
                StoredAccount {
                    id: "user-3".into(),
                    server_id: "server-2".into(),
                    name: "carol".into(),
                    access_token: "token-3".into(),
                },
            ],
        };

        assert!(config.remove_account("server-1", "user-2"));
        assert_eq!(config.accounts.len(), 2);
        assert!(config.accounts.iter().all(|account| account.id != "user-2"));
        assert!(config.servers.iter().any(|server| server.id == "server-1"));

        assert!(config.remove_account("server-2", "user-3"));
        assert!(config.servers.iter().all(|server| server.id != "server-2"));
    }
}
