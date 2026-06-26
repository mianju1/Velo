use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackCacheStatus {
    pub size_bytes: u64,
    pub path: String,
}

pub fn playback_cache_status() -> AppResult<PlaybackCacheStatus> {
    let dir = playback_cache_dir();
    Ok(PlaybackCacheStatus {
        size_bytes: directory_size(&dir)?,
        path: dir.to_string_lossy().into_owned(),
    })
}

pub fn clear_playback_cache() -> AppResult<PlaybackCacheStatus> {
    let dir = playback_cache_dir();
    clear_directory(&dir)?;
    playback_cache_status()
}

pub fn playback_cache_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("velo")
        .join("mpv-cache")
}

fn directory_size(path: &Path) -> AppResult<u64> {
    if !path.exists() {
        return Ok(0);
    }

    let mut total = 0;
    for entry in fs::read_dir(path).map_err(cache_error)? {
        let entry = entry.map_err(cache_error)?;
        let metadata = entry.metadata().map_err(cache_error)?;
        if metadata.is_dir() {
            total += directory_size(&entry.path())?;
        } else {
            total += metadata.len();
        }
    }
    Ok(total)
}

fn clear_directory(path: &Path) -> AppResult<()> {
    if !path.exists() {
        fs::create_dir_all(path).map_err(cache_error)?;
        return Ok(());
    }

    for entry in fs::read_dir(path).map_err(cache_error)? {
        let entry = entry.map_err(cache_error)?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(cache_error)?;
        } else {
            fs::remove_file(path).map_err(cache_error)?;
        }
    }
    Ok(())
}

fn cache_error(error: std::io::Error) -> AppError {
    AppError::new(
        "playback_cache_error",
        "本地视频缓存操作失败",
        Some(error.to_string()),
        true,
    )
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::{clear_directory, directory_size};

    #[test]
    fn counts_and_clears_nested_cache_files() {
        let root =
            std::env::temp_dir().join(format!("velo-cache-test-{}", std::process::id()));
        let nested = root.join("nested");
        fs::create_dir_all(&nested).unwrap();
        fs::write(root.join("a.bin"), [0_u8; 3]).unwrap();
        fs::write(nested.join("b.bin"), [0_u8; 5]).unwrap();

        assert_eq!(directory_size(&root).unwrap(), 8);

        clear_directory(&root).unwrap();

        assert_eq!(directory_size(&root).unwrap(), 0);
        assert!(Path::new(&root).exists());
        let _ = fs::remove_dir_all(root);
    }
}
