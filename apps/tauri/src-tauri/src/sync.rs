use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    30_000
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
    paths::content_dir().join(rel.replace('/', std::path::MAIN_SEPARATOR_STR))
}

fn fetch_bytes(client: &Client, url: &str) -> Result<Vec<u8>, String> {
    client
        .get(url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .map_err(|e| e.to_string())
        .map(|b| b.to_vec())
}

fn copy_item_key(item: &Value) -> String {
    let l1 = item.get("line1").and_then(|x| x.as_str()).unwrap_or("");
    let l2 = item.get("line2").and_then(|x| x.as_str()).unwrap_or("");
    let st = item.get("state").and_then(|x| x.as_str()).unwrap_or("");
    format!("{st}\x1f{l1}\x1f{l2}")
}

/// 合并 copy/*.json：保留本地与手动条目，仅追加远程新条目
fn merge_copy_json(dest: &Path, remote_bytes: &[u8]) -> Result<usize, String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let local: Vec<Value> = if dest.is_file() {
        let s = fs::read_to_string(dest).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| e.to_string())?
    } else {
        vec![]
    };
    let remote: Vec<Value> = serde_json::from_slice(remote_bytes).map_err(|e| e.to_string())?;
    let mut seen: HashSet<String> = local.iter().map(copy_item_key).collect();
    let mut merged = local;
    let mut added = 0usize;
    for item in remote {
        let key = copy_item_key(&item);
        if seen.insert(key) {
            merged.push(item);
            added += 1;
        }
    }
    if added == 0 {
        return Ok(0);
    }
    fs::write(
        dest,
        serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(added)
}

/// 二进制资源：本地已存在则不覆盖（含用户手动放入的 gif）
fn merge_binary(dest: &Path, remote_bytes: &[u8]) -> Result<bool, String> {
    if dest.is_file() {
        return Ok(false);
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(dest, remote_bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

fn is_copy_json(rel: &str) -> bool {
    rel == "copy/jokes.json" || rel == "copy/states.json"
}

fn merge_remote_file(client: &Client, base: &str, rel: &str) -> Result<Option<String>, String> {
    let url = join_url(base, rel);
    let dest = target_path(rel);
    let bytes = fetch_bytes(client, &url)?;
    if is_copy_json(rel) {
        let n = merge_copy_json(&dest, &bytes)?;
        if n > 0 {
            Ok(Some(format!("{rel} (+{n})")))
        } else {
            Ok(None)
        }
    } else if merge_binary(&dest, &bytes)? {
        Ok(Some(format!("{rel} (new)")))
    } else {
        Ok(None)
    }
}

/// 启动时确认内置 content/ 可用（不联网）
pub fn apply_bundled_content() -> SyncResult {
    let manifest_path = paths::manifest_path();
    if !manifest_path.is_file() {
        return SyncResult {
            ok: true,
            updated: false,
            files: vec![],
            message: "no bundled manifest.json".into(),
        };
    }
    let manifest: ContentManifest = match fs::read_to_string(&manifest_path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(e) => {
            log_util::append(&format!("bundled manifest read: {e}"));
            return SyncResult {
                ok: false,
                updated: false,
                files: vec![],
                message: e.to_string(),
            };
        }
    };
    if manifest.files.is_empty() {
        return SyncResult {
            ok: true,
            updated: false,
            files: vec![],
            message: "bundled manifest has no files".into(),
        };
    }
    let mut present = Vec::new();
    for rel in &manifest.files {
        let dest = target_path(rel);
        if dest.is_file() {
            present.push(rel.clone());
        } else {
            log_util::append(&format!("bundled missing {rel}"));
        }
    }
    if present.is_empty() {
        return SyncResult {
            ok: false,
            updated: false,
            files: vec![],
            message: "bundled content files missing".into(),
        };
    }
    let local = load_local_sync();
    let version = manifest.version;
    let already = version > 0 && local.manifest_version >= version;
    if !already {
        let new_state = LocalSyncState {
            manifest_version: version,
            last_sync_iso: chrono::Local::now().to_rfc3339(),
        };
        let _ = save_local_sync(&new_state);
    }
    let updated = !already;
    SyncResult {
        ok: true,
        updated,
        files: present,
        message: format!(
            "bundled content v{} ({})",
            version,
            if updated { "initialized" } else { "ready" }
        ),
    }
}

/// 联网合并：只追加远程新 joke/gif，不覆盖已有本地文件与文案
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

    let mut merged_notes = Vec::new();
    for rel in &manifest.files {
        match merge_remote_file(&client, base, rel) {
            Ok(Some(note)) => {
                log_util::append(&format!("sync merge {note}"));
                merged_notes.push(note);
            }
            Ok(None) => {}
            Err(e) => log_util::append(&format!("sync fail {rel}: {e}")),
        }
    }

    let local = load_local_sync();
    let new_version = manifest.version.max(local.manifest_version);
    let new_state = LocalSyncState {
        manifest_version: new_version,
        last_sync_iso: chrono::Local::now().to_rfc3339(),
    };
    let _ = save_local_sync(&new_state);

    let n = merged_notes.len();
    let updated = n > 0;
    SyncResult {
        ok: true,
        updated,
        files: merged_notes,
        message: if updated {
            format!("merged remote v{} ({n} items)", manifest.version)
        } else {
            "remote checked — nothing new to merge".into()
        },
    }
}

pub fn sync_delay_ms() -> u64 {
    load_remote_config().sync_delay_ms
}
