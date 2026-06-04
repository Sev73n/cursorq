mod log_util;
mod paths;
mod sync;

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

fn is_mascot_media(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".png")
        || lower.ends_with(".apng")
}

#[tauri::command]
fn list_mascot_gifs() -> Result<Vec<String>, String> {
    let dir = paths::mascot_gifs_dir();
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut names: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !n.starts_with('.') && is_mascot_media(n))
        .collect();
    names.sort_by(|a, b| a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase()));
    Ok(names)
}

#[tauri::command]
fn mascot_placeholder_path() -> Option<String> {
    let p = paths::mascot_default_path();
    if p.is_file() {
        Some(p.to_string_lossy().into_owned())
    } else {
        None
    }
}

#[tauri::command]
fn mascot_gif_path(name: String) -> Result<String, String> {
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("invalid name".into());
    }
    let p = paths::mascot_gifs_dir().join(&name);
    if p.is_file() {
        Ok(p.to_string_lossy().into_owned())
    } else {
        Err(format!("not found: {name}"))
    }
}

#[tauri::command]
fn get_remote_config() -> sync::RemoteConfig {
    sync::load_remote_config()
}

#[tauri::command]
fn sync_remote_content(app: tauri::AppHandle) -> sync::SyncResult {
    let result = sync::sync_remote_content();
    if result.updated {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.emit("cursorq:content-updated", &result);
            let _ = win.emit("cursorq:refresh", ());
        }
    }
    result
}

#[tauri::command]
fn get_app_paths() -> serde_json::Value {
    serde_json::json!({
        "root": paths::app_root().display().to_string(),
        "data": paths::data_dir().display().to_string(),
        "logs": paths::logs_dir().display().to_string(),
        "copy": paths::copy_dir().display().to_string(),
        "mascotGifs": paths::mascot_gifs_dir().display().to_string(),
        "portable": paths::is_portable_layout(paths::app_root()),
    })
}

fn read_locale() -> String {
    let p = paths::data_dir().join("app-state.json");
    if let Ok(s) = fs::read_to_string(&p) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
            return v
                .get("locale")
                .and_then(|x| x.as_str())
                .unwrap_or("zh")
                .to_string();
        }
    }
    "zh".to_string()
}

fn write_locale(locale: &str) -> Result<(), String> {
    let dir = paths::data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join("app-state.json");
    let mut v: serde_json::Value = if p.exists() {
        serde_json::from_str(&fs::read_to_string(&p).map_err(|e| e.to_string())?)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    v["locale"] = serde_json::Value::String(locale.to_string());
    fs::write(
        &p,
        serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn capsule_visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(true)
}

fn emit_refresh(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit("cursorq:refresh", ());
    }
}

fn build_tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let visible = capsule_visible(app);
    let locale = read_locale();

    let status = MenuItem::with_id(
        app,
        "status",
        if visible {
            "● 胶囊：已显示"
        } else {
            "○ 胶囊：已隐藏"
        },
        false,
        None::<&str>,
    )?;
    let toggle = MenuItem::with_id(
        app,
        "toggle",
        if visible { "隐藏胶囊" } else { "显示胶囊" },
        true,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let zh = MenuItem::with_id(
        app,
        "locale_zh",
        if locale == "zh" {
            "● 中文"
        } else {
            "○ 中文"
        },
        true,
        None::<&str>,
    )?;
    let en = MenuItem::with_id(
        app,
        "locale_en",
        if locale == "en" {
            "● English"
        } else {
            "○ English"
        },
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let refresh_i = MenuItem::with_id(app, "refresh", "立即刷新", true, None::<&str>)?;
    let sync_i = MenuItem::with_id(app, "sync_content", "同步文案/动图", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &status,
            &toggle,
            &sep1,
            &zh,
            &en,
            &sep2,
            &refresh_i,
            &sync_i,
            &sep3,
            &quit_i,
        ],
    )
}

fn refresh_tray_menu(app: &tauri::AppHandle) {
    if let Ok(menu) = build_tray_menu(app) {
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn update_tray_tooltip(app: &tauri::AppHandle) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let tip = if capsule_visible(app) {
            "CursorQ — 胶囊已显示"
        } else {
            "CursorQ — 胶囊已隐藏"
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}

fn toggle_capsule(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
    } else {
        let _ = win.show();
        let _ = win.set_focus();
    }
    update_tray_tooltip(app);
    refresh_tray_menu(app);
}

fn show_capsule(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        update_tray_tooltip(app);
        refresh_tray_menu(app);
    }
}

fn find_node_executable() -> PathBuf {
    if let Ok(p) = which::which("node") {
        return p;
    }
    let portable = paths::app_root().join("runtime/node.exe");
    if portable.is_file() {
        return portable;
    }
    PathBuf::from("node")
}

#[tauri::command]
fn refresh_usage(joke_index: Option<u32>) -> Result<String, String> {
    let script = paths::refresh_script_path();
    if !script.is_file() {
        log_util::append(&format!("refresh script missing: {}", script.display()));
        return Err(format!("missing script: {}", script.display()));
    }

    let root = paths::app_root();
    let mut cmd = Command::new(find_node_executable());
    cmd.arg(&script)
        .env("CURSORQ_ROOT", root.display().to_string())
        .env("CURSORQ_DATA", paths::data_dir().display().to_string())
        .env(
            "CURSORQ_COPY_DIR",
            paths::copy_dir().display().to_string(),
        )
        .current_dir(root);

    let node_path = paths::node_modules_root();
    if node_path.is_dir() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let old = std::env::var("NODE_PATH").unwrap_or_default();
        let np = if old.is_empty() {
            node_path.display().to_string()
        } else {
            format!("{}{}{}", node_path.display(), sep, old)
        };
        cmd.env("NODE_PATH", np);
    }

    if let Some(i) = joke_index {
        cmd.env("JOKE_INDEX", i.to_string());
    }

    log_util::append("refresh_usage spawn node");
    let output = cmd.output().map_err(|e| {
        let msg = format!("spawn node: {e}");
        log_util::append(&msg);
        msg
    })?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        log_util::append(&format!("refresh failed: {err}"));
        return Err(format!("node failed: {err}"));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn schedule_background_sync(app: tauri::AppHandle) {
    let delay = sync::sync_delay_ms();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(delay));
        log_util::append("background sync start");
        let result = sync::sync_remote_content();
        log_util::append(&format!(
            "background sync done updated={} msg={}",
            result.updated, result.message
        ));
        if result.updated {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.emit("cursorq:content-updated", &result);
                let _ = win.emit("cursorq:refresh", ());
            }
        }
    });
}

fn handle_tray_menu(app: &tauri::AppHandle, id: &str) {
    match id {
        "toggle" => toggle_capsule(app),
        "refresh" => emit_refresh(app),
        "sync_content" => {
            let result = sync::sync_remote_content();
            log_util::append(&format!("tray sync: {}", result.message));
            if result.updated {
                emit_refresh(app);
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("cursorq:content-updated", &result);
                }
            }
        }
        "locale_zh" => {
            let _ = write_locale("zh");
            refresh_tray_menu(app);
            emit_refresh(app);
        }
        "locale_en" => {
            let _ = write_locale("en");
            refresh_tray_menu(app);
            emit_refresh(app);
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            refresh_usage,
            list_mascot_gifs,
            mascot_placeholder_path,
            mascot_gif_path,
            get_remote_config,
            sync_remote_content,
            get_app_paths,
        ])
        .setup(|app| {
            paths::init_paths();
            log_util::append("CursorQ started");
            log_util::append(&format!(
                "root={} portable={}",
                paths::app_root().display(),
                paths::is_portable_layout(paths::app_root())
            ));

            let win = app.get_webview_window("main").unwrap();
            let _ = win.set_decorations(false);
            let _ = win.set_shadow(false);

            let menu = build_tray_menu(app.handle())?;
            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| "missing app icon".to_string())?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("CursorQ — 胶囊已显示")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| handle_tray_menu(app, event.id.as_ref()))
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        show_capsule(tray.app_handle());
                    } else if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_capsule(tray.app_handle());
                    }
                })
                .build(app)?;

            schedule_background_sync(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
                let app = window.app_handle();
                update_tray_tooltip(&app);
                refresh_tray_menu(&app);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
