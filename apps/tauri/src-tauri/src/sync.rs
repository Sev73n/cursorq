use std::fs;
use std::path::{Path, PathBuf};

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::log_util;
use crate::paths;

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct RemoteConfig {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_content_base")]
    pub content_base_url: String,
    #[serde(default = "default_sync_delay_ms")]
    pub sync_delay_ms: u64,
}

fn default_enabled() -> bool {
    true
}

fn default_sync_delay_ms() -> u64 {
    60_000
}

fn default_content_base() -> String {
    String::new()
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct ContentManifest {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub files: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct LocalSyncState {
    #[serde(default)]
    manifest_version: u32,
    #[serde(default)]
    last_sync_iso: String,
}

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub ok: bool,
    pub updated: bool,
    pub files: Vec<String>,
    pub message: String,
}

pub fn load_remote_config() -> RemoteConfig {
    let path = paths::remote_config_path();
    if !path.is_file() {
        return RemoteConfig::default();
    }
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(e) => {
            log_util::append(&format!("read remote.json failed: {e}"));
            RemoteConfig::default()
        }
    }
}

fn load_local_sync() -> LocalSyncState {
    let path = paths::content_cache_path();
    if !path.is_file() {
        return LocalSyncState::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_local_sync(state: &LocalSyncState) -> Result<(), String> {
    let dir = paths::data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(
        paths::content_cache_path(),
        serde_json::to_string_pretty(state).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn join_url(base: &str, rel: &str) -> String {
    let b = base.trim_end_matches('/');
    let r = rel.trim_start_matches('/');
    format!("{b}/{r}")
}

fn target_path(rel: &str) -> PathBuf {
    let root = paths::app_root();
    if paths::is_portable_layout(root) {
        root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR))
    } else {
        match rel {
            s if s.starts_with("copy/") => root.join("assets").join(s),
            s if s.starts_with("mascot/") => {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public").join(s)
            }
            _ => root.join(rel),
        }
    }
}

fn download(client: &Client, url: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = client
        .get(url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .map_err(|e| e.to_string())?;
    fs::write(dest, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sync_remote_content() -> SyncResult {
    let cfg = load_remote_config();
    if !cfg.enabled {
        return SyncResult {
            ok: true,
            updated: false,
            files: vec![],
            message: "remote sync disabled".into(),
        };
    }
    let base = cfg.content_base_url.trim();
    if base.is_empty() {
        return SyncResult {
            ok: true,
            updated: false,
            files: vec![],
            message: "content_base_url empty — edit config/remote.json".into(),
        };
    }

    let client = match Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log_util::append(&format!("sync http client: {e}"));
            return SyncResult {
                ok: false,
                updated: false,
                files: vec![],
                message: e.to_string(),
            };
        }
    };

    let manifest_url = join_url(base, "manifest.json");
    log_util::append(&format!("sync fetch {manifest_url}"));

    let manifest: ContentManifest = match client.get(&manifest_url).send() {
        Ok(r) => match r.error_for_status() {
            Ok(resp) => match resp.json() {
                Ok(m) => m,
                Err(e) => {
                    log_util::append(&format!("sync manifest json: {e}"));
                    return SyncResult {
                        ok: false,
                        updated: false,
                        files: vec![],
                        message: format!("manifest parse: {e}"),
                    };
                }
            },
            Err(e) => {
                log_util::append(&format!("sync manifest http: {e}"));
                return SyncResult {
                    ok: false,
                    updated: false,
                    files: vec![],
                    message: e.to_string(),
                };
            }
        },
        Err(e) => {
            log_util::append(&format!("sync manifest request: {e}"));
            return SyncResult {
                ok: false,
                updated: false,
                files: vec![],
                message: e.to_string(),
            };
        }
    };

    let local = load_local_sync();
    if manifest.version > 0 && manifest.version <= local.manifest_version {
        return SyncResult {
            ok: true,
            updated: false,
            files: vec![],
            message: format!("already at manifest v{}", local.manifest_version),
        };
    }

    let mut updated_files = Vec::new();
    for rel in &manifest.files {
        let url = join_url(base, rel);
        let dest = target_path(rel);
        match download(&client, &url, &dest) {
            Ok(()) => {
                log_util::append(&format!("sync ok {rel}"));
                updated_files.push(rel.clone());
            }
            Err(e) => {
                log_util::append(&format!("sync fail {rel}: {e}"));
            }
        }
    }

    let new_state = LocalSyncState {
        manifest_version: manifest.version,
        last_sync_iso: chrono::Local::now().to_rfc3339(),
    };
    let _ = save_local_sync(&new_state);

    let updated = !updated_files.is_empty();
    SyncResult {
        ok: true,
        updated,
        files: updated_files,
        message: if updated {
            format!("synced manifest v{}", manifest.version)
        } else {
            "no files updated".into()
        },
    }
}

pub fn sync_delay_ms() -> u64 {
    load_remote_config().sync_delay_ms
}
