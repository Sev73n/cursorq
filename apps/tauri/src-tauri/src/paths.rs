use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static APP_ROOT: OnceLock<PathBuf> = OnceLock::new();

/// 发布包：exe 同级的 `copy/` + `config/` 目录
pub fn is_portable_layout(root: &Path) -> bool {
    root.join("copy").is_dir() && root.join("config").is_dir()
}

fn dev_repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn resolve_app_root() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if is_portable_layout(dir) {
                return dir.to_path_buf();
            }
        }
    }
    dev_repo_root()
}

pub fn init_paths() {
    let _ = APP_ROOT.set(resolve_app_root());
}

pub fn app_root() -> &'static PathBuf {
    APP_ROOT.get().expect("paths not initialized")
}

pub fn data_dir() -> PathBuf {
    let root = app_root();
    if is_portable_layout(root) {
        root.join("data")
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.data")
    }
}

pub fn logs_dir() -> PathBuf {
    let root = app_root();
    if is_portable_layout(root) {
        root.join("logs")
    } else {
        data_dir().join("logs")
    }
}

pub fn config_dir() -> PathBuf {
    let root = app_root();
    if is_portable_layout(root) {
        root.join("config")
    } else {
        data_dir().join("config")
    }
}

pub fn remote_config_path() -> PathBuf {
    config_dir().join("remote.json")
}

pub fn content_cache_path() -> PathBuf {
    data_dir().join("content-sync.json")
}

pub fn copy_dir() -> PathBuf {
    let root = app_root();
    if is_portable_layout(root) {
        root.join("copy")
    } else {
        root.join("assets/copy")
    }
}

pub fn mascot_gifs_dir() -> PathBuf {
    if is_portable_layout(app_root()) {
        app_root().join("mascot").join("gifs")
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/mascot/gifs")
    }
}

pub fn mascot_default_path() -> PathBuf {
    if is_portable_layout(app_root()) {
        app_root().join("mascot").join("default.png")
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/mascot/default.png")
    }
}

pub fn refresh_script_path() -> PathBuf {
    let root = app_root();
    let portable = root.join("scripts/refresh-usage.mjs");
    if portable.is_file() {
        return portable;
    }
    dev_repo_root().join("scripts/refresh-usage.mjs")
}

pub fn node_modules_root() -> PathBuf {
    let root = app_root();
    let portable = root.join("node_modules");
    if portable.is_dir() {
        return portable;
    }
    dev_repo_root().join("node_modules")
}
