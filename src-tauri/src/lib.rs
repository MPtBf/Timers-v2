use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use std::time::Instant;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::WindowEvent;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows::Win32::Foundation::COLORREF;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
use windows::Win32::Foundation::POINT;
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};
use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY};
use windows::core::PCWSTR;
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::UI::WindowsAndMessaging::{
    FlashWindowEx, FLASHWINFO, FLASHW_ALL, FLASHW_TIMERNOFG,
    GetWindowLongW, SetWindowLongW, SetWindowPos,
    GWL_EXSTYLE, HWND_BOTTOM, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, SWP_NOZORDER, SWP_FRAMECHANGED,
    WINDOW_EX_STYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
    SetLayeredWindowAttributes, LWA_ALPHA,
};

const HUB_LABEL: &str = "hub";
const TIMER_PREFIX: &str = "timer-";
const SESSION_FILE: &str = "session.json";
const SESSION_TMP_FILE: &str = "session.json.tmp";
const DEFAULT_W: f64 = 95.0;
const DEFAULT_H: f64 = 96.0;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TimerSnapshot {
    id: u32,
    duration_ms: u64,
    remaining_ms: i64,
    state: String,
    sound_on: bool,
    pinned: bool,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

struct PendingInit(Mutex<HashMap<String, TimerSnapshot>>);

struct BirthTimes(Mutex<HashMap<String, Instant>>);

const BIRTH_GRACE_MS: u64 = 2000;

fn lower_timers_except(app: &tauri::AppHandle, stay: &str) {
    for (label, win) in app.webview_windows() {
        if label != stay && is_timer_label(&label) {
            let h = hwnd(&win);
            unsafe {
                let _ = SetWindowPos(h, Some(HWND_BOTTOM), 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
        }
    }
}

fn hwnd(window: &tauri::WebviewWindow) -> HWND {
    window.hwnd().unwrap()
}

fn apply_window_style(h: HWND, style: WINDOW_EX_STYLE, opacity: u8, nudge: bool) {
    unsafe {
        SetWindowLongW(h, GWL_EXSTYLE, style.0 as i32);
        let _ = SetLayeredWindowAttributes(h, COLORREF(0), opacity, LWA_ALPHA);
        if nudge {
            let _ = SetWindowPos(h, None, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER | SWP_FRAMECHANGED);
        }
    }
}

fn is_timer_label(label: &str) -> bool {
    label.starts_with(TIMER_PREFIX)
}

#[tauri::command]
fn set_click_through(window: tauri::WebviewWindow, enabled: bool) {
    let h = hwnd(&window);
    let current = unsafe { GetWindowLongW(h, GWL_EXSTYLE) };
    let current = WINDOW_EX_STYLE(current as u32);
    let new = if enabled {
        current | WS_EX_TRANSPARENT
    } else {
        current & !WS_EX_TRANSPARENT
    };
    let layered = new | WS_EX_LAYERED;
    let nudge = (current & WS_EX_TRANSPARENT) != (new & WS_EX_TRANSPARENT);
    let current_opacity = if enabled { 128 } else { 255 };
    apply_window_style(h, layered, current_opacity, nudge);
}

#[tauri::command]
fn set_opacity(window: tauri::WebviewWindow, opacity: f64) {
    let h = hwnd(&window);
    let current = unsafe { GetWindowLongW(h, GWL_EXSTYLE) };
    let current = WINDOW_EX_STYLE(current as u32);
    let layered = current | WS_EX_LAYERED;
    apply_window_style(h, layered, (opacity * 255.0) as u8, false);
}

#[tauri::command]
fn apply_dwm(window: tauri::WebviewWindow) {
    let h = hwnd(&window);
    unsafe {
        let current = GetWindowLongW(h, GWL_EXSTYLE);
        let current = WINDOW_EX_STYLE(current as u32);
        SetWindowLongW(h, GWL_EXSTYLE, (current | WS_EX_LAYERED).0 as i32);
        let policy: u32 = 2;
        DwmSetWindowAttribute(h, DWMWINDOWATTRIBUTE(2), &policy as *const _ as *const std::ffi::c_void, std::mem::size_of::<u32>() as u32);
        let allow_ncpaint: u32 = 0;
        DwmSetWindowAttribute(h, DWMWINDOWATTRIBUTE(4), &allow_ncpaint as *const _ as *const std::ffi::c_void, std::mem::size_of::<u32>() as u32);
    }
}

#[tauri::command]
fn raise_window(window: tauri::WebviewWindow) {
    let h = hwnd(&window);
    unsafe {
        let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

#[tauri::command]
fn get_modifier_state() -> (bool, bool) {
    let ctrl = unsafe { GetAsyncKeyState(0x11) } < 0;
    let shift = unsafe { GetAsyncKeyState(0x10) } < 0;
    (ctrl, shift)
}

#[tauri::command]
fn get_idle_time() -> u64 {
    let mut lii = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    if unsafe { GetLastInputInfo(&mut lii) }.as_bool() {
        let now = unsafe { GetTickCount() };
        now.wrapping_sub(lii.dwTime) as u64
    } else {
        0
    }
}

#[tauri::command]
fn get_cursor_pos() -> (i32, i32) {
    let mut pt = POINT { x: 0, y: 0 };
    unsafe { let _ = GetCursorPos(&mut pt); }
    (pt.x, pt.y)
}

#[tauri::command]
fn flash_window(window: tauri::WebviewWindow) {
    let h = hwnd(&window);
    let info = FLASHWINFO {
        cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
        hwnd: h,
        dwFlags: FLASHW_ALL | FLASHW_TIMERNOFG,
        uCount: 3,
        dwTimeout: 0,
    };
    unsafe {
        let _ = FlashWindowEx(&info);
    }
}

static TICK_WAV: &[u8] = include_bytes!("../sounds/tick.wav");

#[tauri::command]
fn beep_system() {
    unsafe {
        PlaySoundW(
            PCWSTR(TICK_WAV.as_ptr() as *const u16),
            None,
            SND_MEMORY | SND_ASYNC,
        );
    }
}

#[tauri::command]
fn create_timer_window(app: tauri::AppHandle, snapshot: TimerSnapshot, state: State<PendingInit>) -> Result<(), String> {
    let label = format!("{TIMER_PREFIX}{}", snapshot.id);
    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }
    let url = WebviewUrl::App(format!("index.html?timer={}", snapshot.id).into());
    let win = WebviewWindowBuilder::new(&app, label.clone(), url)
        .title("Timer")
        .inner_size(
            if snapshot.w > 0 { snapshot.w as f64 } else { DEFAULT_W },
            if snapshot.h > 0 { snapshot.h as f64 } else { DEFAULT_H },
        )
        .position(snapshot.x as f64, snapshot.y as f64)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(snapshot.pinned)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;

    state.0.lock().unwrap().insert(label.clone(), snapshot.clone());

    let id_for_event = snapshot.id;
    let hub = app.get_webview_window(HUB_LABEL);
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            if let Some(hub) = hub.as_ref() {
                let _ = hub.emit("timer-closed", id_for_event);
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn get_timer_init(window: WebviewWindow, state: State<PendingInit>) -> Option<TimerSnapshot> {
    state.0.lock().unwrap().remove(window.label())
}

#[tauri::command]
fn hide_timers(app: tauri::AppHandle) {
    for (label, win) in app.webview_windows() {
        if is_timer_label(&label) {
            let _ = win.hide();
        }
    }
}

#[tauri::command]
fn show_timers(app: tauri::AppHandle) {
    for (label, win) in app.webview_windows() {
        if is_timer_label(&label) {
            let _ = win.show();
        }
    }
}

#[tauri::command]
fn set_timers_always_on_top(app: tauri::AppHandle, pinned: bool) {
    for (label, win) in app.webview_windows() {
        if is_timer_label(&label) {
            let _ = win.set_always_on_top(pinned);
            let _ = win.emit("pin-all", pinned);
        }
    }
}

#[tauri::command]
fn mute_all(app: tauri::AppHandle, muted: bool) {
    for (label, win) in app.webview_windows() {
        if is_timer_label(&label) {
            let _ = win.emit("mute-all", muted);
        }
    }
}

#[tauri::command]
fn close_timer(app: tauri::AppHandle, id: u32) {
    let label = format!("{TIMER_PREFIX}{id}");
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.close();
    }
}

#[tauri::command]
fn focus_timer(app: tauri::AppHandle, id: u32) {
    let label = format!("{TIMER_PREFIX}{id}");
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn save_session(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let final_path = dir.join(SESSION_FILE);
    let tmp_path = dir.join(SESSION_TMP_FILE);
    fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_session(app: tauri::AppHandle) -> Option<String> {
    let dir = app.path().app_config_dir().ok()?;
    fs::read_to_string(dir.join(SESSION_FILE)).ok()
}

#[tauri::command]
fn quit_all(app: tauri::AppHandle) {
    for (_, win) in app.webview_windows() {
        let _ = win.destroy();
    }
    app.exit(0);
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_hub = MenuItem::with_id(app, "show-hub", "Показать хаб", true, None::<&str>)?;
    let hide_timers_item = MenuItem::with_id(app, "hide-timers", "Скрыть таймеры", true, None::<&str>)?;
    let show_timers_item = MenuItem::with_id(app, "show-timers", "Показать таймеры", true, None::<&str>)?;
    let mute_item = MenuItem::with_id(app, "mute-all", "Заглушить все", true, None::<&str>)?;
    let unmute_item = MenuItem::with_id(app, "unmute-all", "Включить звук", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_hub, &hide_timers_item, &show_timers_item, &mute_item, &unmute_item, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-hub" => {
                if let Some(hub) = app.get_webview_window(HUB_LABEL) {
                    let _ = hub.show();
                    let _ = hub.set_focus();
                }
            }
            "hide-timers" => hide_timers(app.clone()),
            "show-timers" => show_timers(app.clone()),
            "mute-all" => mute_all(app.clone(), true),
            "unmute-all" => mute_all(app.clone(), false),
            "quit" => {
                if let Some(hub) = app.get_webview_window(HUB_LABEL) {
                    let _ = hub.emit("request-quit", ());
                } else {
                    quit_all(app.clone());
                }
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(hub) = app.get_webview_window(HUB_LABEL) {
                    let _ = hub.show();
                    let _ = hub.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(hub) = app.get_webview_window(HUB_LABEL) {
                let _ = hub.show();
                let _ = hub.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(PendingInit(Mutex::new(HashMap::new())))
        .manage(BirthTimes(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            set_click_through,
            set_opacity,
            apply_dwm,
            raise_window,
            flash_window,
            beep_system,
            get_modifier_state,
            get_idle_time,
            get_cursor_pos,
            create_timer_window,
            get_timer_init,
            hide_timers,
            show_timers,
            set_timers_always_on_top,
            mute_all,
            close_timer,
            focus_timer,
            save_session,
            load_session,
            quit_all,
        ]);

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp::init_with_config(
            tauri_plugin_mcp::PluginConfig::new("Timers-v2".to_string())
                .start_socket_server(true)
                .socket_path("/tmp/tauri-mcp.sock".into()),
        ));
    }

    builder
        .setup(|app| {
            setup_tray(app)?;

            if let Some(hub) = app.get_webview_window(HUB_LABEL) {
                let hub_for_close = hub.clone();
                let app_handle = app.handle().clone();
                app.state::<BirthTimes>().0.lock().unwrap().insert(HUB_LABEL.to_string(), Instant::now());
                hub.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hub_for_close.hide();
                    }
                    if let WindowEvent::Focused(true) = event {
                        let recent = app_handle
                            .state::<BirthTimes>()
                            .0
                            .lock()
                            .unwrap()
                            .get(HUB_LABEL)
                            .map(|t| t.elapsed().as_millis() < BIRTH_GRACE_MS as u128)
                            .unwrap_or(false);
                        if !recent {
                            lower_timers_except(&app_handle, HUB_LABEL);
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests;
