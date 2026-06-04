use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::paths;

fn state_path() -> PathBuf {
    paths::data_dir().join("app-state.json")
}

fn read_state_value() -> serde_json::Value {
    let p = state_path();
    if !p.exists() {
        return serde_json::json!({});
    }
    fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn write_state_merge(patch: serde_json::Value) -> Result<(), String> {
    let dir = paths::data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut v = read_state_value();
    if let Some(obj) = patch.as_object() {
        for (k, val) in obj {
            v[k] = val.clone();
        }
    }
    fs::write(
        &state_path(),
        serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn always_on_top_default() -> bool {
    true
}

pub fn launch_at_startup_default() -> bool {
    false
}

pub fn capsule_visible_default() -> bool {
    true
}

pub fn read_capsule_visible() -> bool {
    read_state_value()
        .get("capsuleVisible")
        .and_then(|x| x.as_bool())
        .unwrap_or(capsule_visible_default())
}

pub fn write_capsule_visible(visible: bool) -> Result<(), String> {
    write_state_merge(serde_json::json!({ "capsuleVisible": visible }))
}

pub fn read_always_on_top() -> bool {
    read_state_value()
        .get("alwaysOnTop")
        .and_then(|x| x.as_bool())
        .unwrap_or(always_on_top_default())
}

pub fn read_launch_at_startup() -> bool {
    read_state_value()
        .get("launchAtStartup")
        .and_then(|x| x.as_bool())
        .unwrap_or(launch_at_startup_default())
}

pub fn apply_always_on_top(app: &AppHandle, on: bool) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not available".to_string())?;
    win.set_always_on_top(on).map_err(|e| e.to_string())?;
    if read_capsule_visible() {
        #[cfg(windows)]
        {
            crate::win_dwm::apply_topmost_z_order(&win, on);
            crate::win_dwm::show_without_activate(&win);
        }
        #[cfg(not(windows))]
        {
            let _ = win.show();
        }
    }
    let _ = win.emit("cursorq:fix-chrome", ());
    write_state_merge(serde_json::json!({ "alwaysOnTop": on }))?;
    Ok(())
}

pub fn apply_launch_at_startup(app: &AppHandle, on: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    if on {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }
    let enabled = autostart.is_enabled().map_err(|e| e.to_string())?;
    if enabled != on {
        return Err(format!(
            "autostart could not be set to {on} (registry reports {enabled})"
        ));
    }
    write_state_merge(serde_json::json!({ "launchAtStartup": on }))?;
    Ok(())
}

pub fn sync_launch_at_startup_from_pref(app: &AppHandle) -> Result<(), String> {
    let want = read_launch_at_startup();
    let autostart = app.autolaunch();
    let enabled = autostart.is_enabled().map_err(|e| e.to_string())?;
    if want && !enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else if !want && enabled {
        autostart.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn apply_prefs_on_startup(app: &AppHandle) -> Result<(), String> {
    apply_always_on_top(app, read_always_on_top())?;
    sync_launch_at_startup_from_pref(app)?;
    Ok(())
}

pub fn toggle_always_on_top(app: &AppHandle) -> Result<bool, String> {
    let next = !read_always_on_top();
    apply_always_on_top(app, next)?;
    Ok(next)
}

pub fn toggle_launch_at_startup(app: &AppHandle) -> Result<bool, String> {
    let next = !read_launch_at_startup();
    apply_launch_at_startup(app, next)?;
    Ok(next)
}
