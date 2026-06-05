mod log_util;
mod paths;
mod prefs;
mod sync;
#[cfg(windows)]
mod win_dwm;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    utils::config::Color,
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
        .filter(|n| {
            !n.starts_with('.')
                && is_mascot_media(n)
        })
        .collect();
    names.sort_by(|a, b| a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase()));
    Ok(names)
}

#[tauri::command]
fn mascot_placeholder_path() -> Option<String> {
    paths::mascot_default_path().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn mascot_placeholder_anim_path() -> Option<String> {
    paths::mascot_placeholder_anim_path().map(|p| p.to_string_lossy().into_owned())
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

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("gif") => "image/gif",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "application/octet-stream",
    }
}

fn file_data_url(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(format!(
        "data:{};base64,{}",
        mime_for(path),
        STANDARD.encode(bytes)
    ))
}

/// 前端 img 用 data URL 加载，避免 asset:// 在部分环境失败
#[tauri::command]
fn mascot_asset_data_url(asset: String) -> Result<String, String> {
    let path = match asset.as_str() {
        "placeholder_anim" => paths::mascot_placeholder_anim_path(),
        "placeholder" => paths::mascot_default_path(),
        other if other.starts_with("gif:") => {
            let name = other.trim_start_matches("gif:");
            if name.contains("..") || name.contains('/') || name.contains('\\') {
                return Err("invalid name".into());
            }
            let p = paths::mascot_gifs_dir().join(name);
            if p.is_file() {
                Some(p)
            } else {
                None
            }
        }
        _ => None,
    };
    let path = path.ok_or_else(|| format!("asset not found: {asset}"))?;
    file_data_url(&path)
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
        schedule_fix_chrome(app);
    }
    result
}

#[tauri::command]
fn get_app_paths() -> serde_json::Value {
    serde_json::json!({
        "root": paths::app_root().display().to_string(),
        "data": paths::data_dir().display().to_string(),
        "logs": paths::logs_dir().display().to_string(),
        "content": paths::content_dir().display().to_string(),
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

/// 托盘菜单点击后 Windows 常会再触发一次左键，需短暂忽略以免「隐藏」后立刻被 show 掉
static TRAY_MENU_GUARD: Mutex<Option<Instant>> = Mutex::new(None);

#[derive(Clone, Copy)]
struct WindowLayout {
    logical_w: u32,
    logical_h: u32,
    radius: u32,
    capsule_only: bool,
}

static LAST_LAYOUT: Mutex<WindowLayout> = Mutex::new(WindowLayout {
    logical_w: 200,
    logical_h: 44,
    radius: 22,
    capsule_only: true,
});

fn store_window_layout(logical_w: u32, logical_h: u32, radius: u32, capsule_only: bool) {
    if let Ok(mut l) = LAST_LAYOUT.lock() {
        *l = WindowLayout {
            logical_w,
            logical_h,
            radius,
            capsule_only,
        };
    }
}

fn mark_tray_menu_action() {
    if let Ok(mut g) = TRAY_MENU_GUARD.lock() {
        *g = Some(Instant::now());
    }
}

fn tray_menu_action_recent() -> bool {
    TRAY_MENU_GUARD
        .lock()
        .ok()
        .and_then(|g| {
            g.as_ref()
                .map(|t| t.elapsed() < Duration::from_millis(700))
        })
        .unwrap_or(false)
}

fn window_is_visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

fn capsule_visible() -> bool {
    prefs::read_capsule_visible()
}

fn set_capsule_visible(app: &tauri::AppHandle, visible: bool) {
    let _ = prefs::write_capsule_visible(visible);
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    if visible {
        let _ = win.set_focusable(false);
        let _ = win.set_shadow(false);
        #[cfg(windows)]
        win_dwm::show_without_activate(&win);
        #[cfg(not(windows))]
        let _ = win.show();
        let _ = win.emit("cursorq:window-shown", ());
    } else {
        #[cfg(windows)]
        {
            if let Ok(hwnd) = win.hwnd() {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};
                unsafe {
                    let _ = ShowWindow(HWND(hwnd.0), SW_HIDE);
                }
            }
        }
        if let Err(e) = win.hide() {
            log_util::append(&format!("capsule hide: {e}"));
        }
        let _ = win.emit("cursorq:capsule-hidden", ());
    }
    update_tray_tooltip(app);
    refresh_tray_menu(app);
}

fn emit_refresh(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit("cursorq:refresh", ());
        let _ = win.emit("cursorq:fix-chrome", ());
    }
}

fn build_tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let visible = capsule_visible();
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
    let always_top = CheckMenuItem::with_id(
        app,
        "always_on_top",
        "总是置顶",
        true,
        prefs::read_always_on_top(),
        None::<&str>,
    )?;
    let launch_startup = CheckMenuItem::with_id(
        app,
        "launch_at_startup",
        "开机启动",
        true,
        prefs::read_launch_at_startup(),
        None::<&str>,
    )?;
    let sep_prefs = PredefinedMenuItem::separator(app)?;
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
            &always_top,
            &launch_startup,
            &sep_prefs,
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
        let tip = if capsule_visible() {
            "CursorQ — 胶囊已显示"
        } else {
            "CursorQ — 胶囊已隐藏"
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}

fn show_capsule(app: &tauri::AppHandle) {
    if tray_menu_action_recent() {
        return;
    }
    set_capsule_visible(app, true);
}

fn toggle_capsule(app: &tauri::AppHandle) {
    set_capsule_visible(app, !capsule_visible());
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
fn tune_window_dwm(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Some(win) = app.get_webview_window("main") {
            win_dwm::tune_frameless_window(&win);
            win.set_shadow(false).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
fn sync_window_shape(
    app: tauri::AppHandle,
    logical_w: u32,
    logical_h: u32,
    radius: u32,
    capsule_only: bool,
) -> Result<(), String> {
    store_window_layout(logical_w, logical_h, radius, capsule_only);
    #[cfg(windows)]
    {
        if let Some(win) = app.get_webview_window("main") {
            win_dwm::apply_window_shape(&win, logical_w, logical_h, radius, capsule_only);
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, logical_w, logical_h, radius, capsule_only);
        Ok(())
    }
}

#[tauri::command]
fn show_main_inactive(app: tauri::AppHandle) -> Result<(), String> {
    if prefs::read_capsule_visible() {
        set_capsule_visible(&app, true);
    }
    Ok(())
}

#[tauri::command]
fn get_capsule_visible() -> bool {
    prefs::read_capsule_visible()
}

#[tauri::command]
fn set_capsule_visible_cmd(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    set_capsule_visible(&app, visible);
    Ok(())
}

#[tauri::command]
fn start_drag_capsule(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    #[cfg(windows)]
    {
        win_dwm::tune_frameless_window(&win);
        win.set_shadow(false).map_err(|e| e.to_string())?;
        let layout = LAST_LAYOUT.lock().map(|l| *l).unwrap_or(WindowLayout {
            logical_w: 200,
            logical_h: 44,
            radius: 22,
            capsule_only: true,
        });
        win_dwm::apply_window_shape(
            &win,
            layout.logical_w,
            layout.logical_h,
            layout.radius,
            layout.capsule_only,
        );
    }
    win.start_dragging().map_err(|e| e.to_string())
}

fn refresh_usage_sync(joke_index: Option<u32>) -> Result<String, String> {
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
        .env("CURSORQ_FAST_REFRESH", "1")
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

    log_util::append("refresh_usage node running");
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

#[cfg(windows)]
fn fixup_window_chrome_full(app: &tauri::AppHandle) {
    fixup_window_chrome_full_inner(app, false);
}

#[cfg(windows)]
fn fixup_window_chrome_full_force(app: &tauri::AppHandle) {
    fixup_window_chrome_full_inner(app, true);
}

#[cfg(windows)]
fn fixup_window_chrome_full_inner(app: &tauri::AppHandle, force: bool) {
    if !prefs::read_capsule_visible() {
        return;
    }
    if !force && !window_is_visible(app) {
        return;
    }
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let layout = LAST_LAYOUT
        .lock()
        .map(|l| *l)
        .unwrap_or(WindowLayout {
            logical_w: 200,
            logical_h: 44,
            radius: 22,
            capsule_only: true,
        });
    let _ = win.set_shadow(false);
    let _ = win.set_background_color(Some(Color(0, 0, 0, 0)));
    win_dwm::tune_frameless_window(&win);
    win_dwm::apply_window_shape(
        &win,
        layout.logical_w,
        layout.logical_h,
        layout.radius,
        layout.capsule_only,
    );
}

fn emit_fix_chrome(app: &tauri::AppHandle) {
    if !prefs::read_capsule_visible() || !window_is_visible(app) {
        return;
    }
    #[cfg(windows)]
    fixup_window_chrome_full(app);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit("cursorq:fix-chrome", ());
    }
}

fn schedule_fix_chrome(app: tauri::AppHandle) {
    if !prefs::read_capsule_visible() {
        return;
    }
    emit_fix_chrome(&app);
    let app2 = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(80));
        #[cfg(windows)]
        fixup_window_chrome_full(&app2);
        let _ = app2.get_webview_window("main").map(|w| w.emit("cursorq:fix-chrome", ()));
        thread::sleep(Duration::from_millis(280));
        #[cfg(windows)]
        fixup_window_chrome_full(&app2);
        let _ = app2.get_webview_window("main").map(|w| w.emit("cursorq:fix-chrome", ()));
    });
}

/// 后台线程跑 node，避免托盘「刷新」卡住 UI
#[tauri::command]
async fn refresh_usage(
    app: tauri::AppHandle,
    joke_index: Option<u32>,
) -> Result<String, String> {
    log_util::append("refresh_usage start");
    let join = tauri::async_runtime::spawn_blocking(move || refresh_usage_sync(joke_index));
    match join.await {
        Ok(Ok(json)) => {
            log_util::append("refresh_usage ok");
            schedule_fix_chrome(app.clone());
            Ok(json)
        }
        Ok(Err(e)) => {
            log_util::append(&format!("refresh_usage error: {e}"));
            Err(e)
        }
        Err(e) => {
            log_util::append(&format!("refresh_usage join: {e}"));
            Err(e.to_string())
        }
    }
}

fn emit_sync_result(app: &tauri::AppHandle, result: &sync::SyncResult) {
    if result.updated {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.emit("cursorq:content-updated", result);
            let _ = win.emit("cursorq:refresh", ());
        }
    }
}

fn schedule_background_sync(app: tauri::AppHandle) {
    let delay = sync::sync_delay_ms();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(delay));
        log_util::append(&format!("remote merge sync start (after {delay}ms)"));
        let result = sync::sync_remote_content();
        log_util::append(&format!(
            "remote merge sync done updated={} msg={}",
            result.updated, result.message
        ));
        emit_sync_result(&app, &result);
    });
}

fn handle_tray_menu(app: &tauri::AppHandle, id: &str) {
    mark_tray_menu_action();
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
        "always_on_top" => {
            if let Err(e) = prefs::toggle_always_on_top(app) {
                log_util::append(&format!("always_on_top: {e}"));
            } else if prefs::read_capsule_visible() {
                if let Some(win) = app.get_webview_window("main") {
                    #[cfg(windows)]
                    {
                        win_dwm::show_without_activate(&win);
                        fixup_window_chrome_full_force(app);
                    }
                }
            }
            refresh_tray_menu(app);
        }
        "launch_at_startup" => {
            if let Err(e) = prefs::toggle_launch_at_startup(app) {
                log_util::append(&format!("launch_at_startup: {e}"));
            }
            refresh_tray_menu(app);
        }
        "quit" => app.exit(0),
        _ => {}
    }
    schedule_fix_chrome(app.clone());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            refresh_usage,
            tune_window_dwm,
            sync_window_shape,
            show_main_inactive,
            get_capsule_visible,
            set_capsule_visible_cmd,
            start_drag_capsule,
            list_mascot_gifs,
            mascot_placeholder_path,
            mascot_placeholder_anim_path,
            mascot_asset_data_url,
            mascot_gif_path,
            get_remote_config,
            sync_remote_content,
            get_app_paths,
        ])
        .setup(|app| {
            paths::init_paths();
            let content_dir = paths::content_dir();
            if let Err(e) = app.asset_protocol_scope().allow_directory(&content_dir, true) {
                log_util::append(&format!("asset scope content dir: {e}"));
            } else {
                log_util::append(&format!(
                    "asset scope ok: {}",
                    content_dir.display()
                ));
            }
            log_util::append("CursorQ started");
            log_util::append(&format!(
                "root={} portable={}",
                paths::app_root().display(),
                paths::is_portable_layout(paths::app_root())
            ));

            #[cfg(windows)]
            win_dwm::capture_foreground();

            let win = app.get_webview_window("main").unwrap();
            let _ = win.set_decorations(false);
            let _ = win.set_shadow(false);
            let _ = win.set_background_color(Some(Color(0, 0, 0, 0)));
            #[cfg(windows)]
            {
                win_dwm::tune_frameless_window(&win);
                if let Ok(hwnd) = win.hwnd() {
                    win_dwm::enforce_nonactivating(windows::Win32::Foundation::HWND(hwnd.0));
                }
            }
            let _ = win.set_focusable(false);
            if let Err(e) = prefs::apply_prefs_on_startup(app.handle()) {
                log_util::append(&format!("prefs: {e}"));
            }

            let menu = build_tray_menu(app.handle())?;
            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| "missing app icon".to_string())?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("CursorQ — 胶囊已显示")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| handle_tray_menu(app, event.id.as_ref()))
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    match event {
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        } => show_capsule(app),
                        TrayIconEvent::Click {
                            button: MouseButton::Right,
                            button_state: MouseButtonState::Up,
                            ..
                        } => schedule_fix_chrome(app.clone()),
                        _ => {}
                    }
                })
                .build(app)?;

            let bundled = sync::apply_bundled_content();
            log_util::append(&format!("bundled content: {}", bundled.message));
            if bundled.updated {
                emit_sync_result(app.handle(), &bundled);
            }

            schedule_background_sync(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let app = window.app_handle();
                    set_capsule_visible(&app, false);
                }
                #[cfg(windows)]
                WindowEvent::Focused(true) => {
                    let app = window.app_handle();
                    if !capsule_visible() {
                        return;
                    }
                    let _ = window.set_focusable(false);
                    fixup_window_chrome_full(&app);
                    if let Some(win) = app.get_webview_window("main") {
                        win_dwm::restore_foreground_if_stole(&win);
                    }
                }
                #[cfg(windows)]
                WindowEvent::Focused(false)
                | WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ThemeChanged(_) => {
                    let app = window.app_handle();
                    if !capsule_visible() || !window_is_visible(&app) {
                        return;
                    }
                    fixup_window_chrome_full(&app);
                }
                #[cfg(windows)]
                WindowEvent::ScaleFactorChanged { .. } => {
                    let app = window.app_handle();
                    if !capsule_visible() || !window_is_visible(&app) {
                        return;
                    }
                    fixup_window_chrome_full(&app);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
