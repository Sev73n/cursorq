//! Windows：透明无边框浮窗需关掉 DWM 矩形阴影/圆角，否则胶囊四周会有灰方框。
//! 参考 Tauri #9287 / #11321、Electron #46468 / #51662。

#![cfg(windows)]

use std::sync::Mutex;

use tauri::WebviewWindow;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMNCRP_DISABLED, DWMNCRENDERINGPOLICY, DWMWA_ALLOW_NCPAINT,
    DWMWA_BORDER_COLOR,
    DWMWA_CAPTION_COLOR, DWMWA_COLOR_NONE, DWMWA_NCRENDERING_POLICY,
    DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_TRANSITIONS_FORCEDISABLED,
    DWMWA_USE_HOSTBACKDROPBRUSH, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMSBT_NONE, DWMWCP_DONOTROUND,
    DWM_SYSTEMBACKDROP_TYPE, DWM_WINDOW_CORNER_PREFERENCE,
};
use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, InvalidateRect, SetWindowRgn};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowLongPtrW, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
    SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_NOTOPMOST, HWND_TOP,
    HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_SHOWNOACTIVATE,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

static FOREGROUND_BEFORE: Mutex<isize> = Mutex::new(0);

pub fn capture_foreground() {
    unsafe {
        let fg = GetForegroundWindow();
        if !fg.0.is_null() {
            if let Ok(mut slot) = FOREGROUND_BEFORE.lock() {
                *slot = fg.0 as isize;
            }
        }
    }
}

/// 若本窗意外成为前台，把焦点还给启动前正在用的窗口（避免打断输入）。
pub fn restore_foreground_if_stole(window: &WebviewWindow<tauri::Wry>) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let ours = HWND(hwnd.0);
    unsafe {
        if GetForegroundWindow() != ours {
            return;
        }
        let prev = FOREGROUND_BEFORE.lock().map(|g| *g).unwrap_or(0);
        if prev == 0
            || prev == ours.0 as isize
            || !IsWindow(Some(HWND(prev as _))).as_bool()
        {
            return;
        }
        let target = HWND(prev as _);
        let fg_thread = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let target_thread = GetWindowThreadProcessId(target, None);
        let cur_thread = GetCurrentThreadId();
        let attached_fg =
            AttachThreadInput(cur_thread, fg_thread, true).as_bool() && fg_thread != cur_thread;
        let attached_target = AttachThreadInput(cur_thread, target_thread, true).as_bool()
            && target_thread != cur_thread;
        let _ = SetForegroundWindow(target);
        if attached_target {
            let _ = AttachThreadInput(cur_thread, target_thread, false);
        }
        if attached_fg {
            let _ = AttachThreadInput(cur_thread, fg_thread, false);
        }
    }
}

fn hwnd_from_window(window: &WebviewWindow<tauri::Wry>) -> Option<HWND> {
    window.hwnd().ok().map(|h| HWND(h.0))
}

pub fn enforce_nonactivating(hwnd: HWND) {
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let new_ex = ex | WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0;
        if new_ex != ex {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex as isize);
        }
    }
}

pub fn tune_frameless_window(window: &WebviewWindow<tauri::Wry>) {
    let Some(hwnd) = hwnd_from_window(window) else {
        return;
    };
    enforce_nonactivating(hwnd);

    unsafe {
        let ncr = DWMNCRENDERINGPOLICY(DWMNCRP_DISABLED.0);
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_NCRENDERING_POLICY,
            (&ncr as *const DWMNCRENDERINGPOLICY).cast(),
            std::mem::size_of::<DWMNCRENDERINGPOLICY>() as u32,
        );

        let corner = DWM_WINDOW_CORNER_PREFERENCE(DWMWCP_DONOTROUND.0);
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            (&corner as *const DWM_WINDOW_CORNER_PREFERENCE).cast(),
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );

        let border_color: u32 = DWMWA_COLOR_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            (&border_color as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );

        let backdrop = DWM_SYSTEMBACKDROP_TYPE(DWMSBT_NONE.0);
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            (&backdrop as *const DWM_SYSTEMBACKDROP_TYPE).cast(),
            std::mem::size_of::<DWM_SYSTEMBACKDROP_TYPE>() as u32,
        );

        // Win11 拖动/任务栏交互时禁用 DWM 过渡，减少浅蓝方框闪一下
        let transitions_off: u32 = 1;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            (&transitions_off as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );

        // Win11：任务栏/拖动时出现的白色可见边框
        let frame_thick: u32 = 0;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_VISIBLE_FRAME_BORDER_THICKNESS,
            (&frame_thick as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
        let caption_none: u32 = DWMWA_COLOR_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_COLOR,
            (&caption_none as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
        let host_brush_off: u32 = 0;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_HOSTBACKDROPBRUSH,
            (&host_brush_off as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
        let no_nc_paint: u32 = 0;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_ALLOW_NCPAINT,
            (&no_nc_paint as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
    }
}

/// 收起态用圆角 HRGN 裁掉 WebView2 矩形白角；展开面板时恢复矩形区域。
pub fn apply_window_shape(
    window: &WebviewWindow<tauri::Wry>,
    logical_w: u32,
    logical_h: u32,
    radius: u32,
    capsule_only: bool,
) {
    let Some(hwnd) = hwnd_from_window(window) else {
        return;
    };
    tune_frameless_window(window);
    let scale = window.scale_factor().unwrap_or(1.0);
    let w = (logical_w as f64 * scale).round().max(1.0) as i32;
    let h = (logical_h as f64 * scale).round().max(1.0) as i32;
    let r = if capsule_only {
        (radius as f64 * scale).round().max(2.0) as i32
    } else {
        (16.0 * scale).round().max(2.0) as i32
    };
    unsafe {
        let region = CreateRoundRectRgn(0, 0, w + 1, h + 1, r * 2, r * 2);
        if !region.is_invalid() {
            let _ = SetWindowRgn(hwnd, Some(region), true);
        }
        let _ = InvalidateRect(Some(hwnd), None, true);
    }
}

/// 切换置顶后 Win32 可能把窗体压到其它窗口后面；用 `SWP_SHOWWINDOW` 拉回前台但不抢焦点。
pub fn apply_topmost_z_order(window: &WebviewWindow<tauri::Wry>, on_top: bool) {
    let Some(hwnd) = hwnd_from_window(window) else {
        return;
    };
    unsafe {
        let flags = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_SHOWWINDOW;
        let insert = if on_top {
            Some(HWND_TOPMOST)
        } else {
            Some(HWND_NOTOPMOST)
        };
        let _ = SetWindowPos(hwnd, insert, 0, 0, 0, 0, flags);
        if !on_top {
            let _ = SetWindowPos(hwnd, Some(HWND_TOP), 0, 0, 0, 0, flags);
        }
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    }
}

/// `Window::show()` 在首次显示后走 `SW_SHOW` 会抢焦点；透明挂件应始终无激活显示。
pub fn show_without_activate(window: &WebviewWindow<tauri::Wry>) {
    tune_frameless_window(window);
    let Some(hwnd) = hwnd_from_window(window) else {
        return;
    };
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    }
    let _ = window.set_shadow(false);
    restore_foreground_if_stole(window);
}
