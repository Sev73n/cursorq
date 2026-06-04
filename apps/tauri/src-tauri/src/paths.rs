use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static APP_ROOT: OnceLock<PathBuf> = OnceLock::new();

/// 发布包：exe 同级有 `config/`，且自带 `content/copy` 或旧版扁平 `copy/`
pub fn is_portable_layout(root: &Path) -> bool {
    if !root.join("config").is_dir() {
        return false;
    }
    root.join("content/copy").is_dir() || root.join("copy").is_dir()
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

/// 内置默认内容（文案、吉祥物、manifest），离线可用
pub fn content_dir() -> PathBuf {
    let root = app_root();
    let nested = root.join("content");
    if nested.join("copy").is_dir() {
        return nested;
    }
    if is_portable_layout(root) && root.join("copy").is_dir() {
        return root.to_path_buf();
    }
    dev_repo_root().join("content")
}

pub fn manifest_path() -> PathBuf {
    content_dir().join("manifest.json")
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
    content_dir().join("copy")
}

/// 启动占位动图（不参与轮播）
pub const MASCOT_PLACEHOLDER_ANIM: &str = "animation.gif";

pub fn mascot_gifs_dir() -> PathBuf {
    content_dir().join("mascot").join("gifs")
}

pub fn mascot_placeholder_anim_path() -> Option<PathBuf> {
    let p = mascot_gifs_dir().join(MASCOT_PLACEHOLDER_ANIM);
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

fn mascot_asset_dir() -> PathBuf {
    content_dir().join("mascot")
}

/// 占位图：优先 default.png，其次 default.svg
pub fn mascot_default_path() -> Option<PathBuf> {
    let dir = mascot_asset_dir();
    for name in ["default.png", "default.svg"] {
        let p = dir.join(name);
        if p.is_file() {
            return Some(p);
        }
    }
    None
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
