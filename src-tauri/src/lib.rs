use tauri::Manager;
use windows::Win32::Foundation::COLORREF;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    FlashWindowEx, FLASHWINFO, FLASHW_ALL, FLASHW_TIMERNOFG,
    GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WINDOW_EX_STYLE,
    WS_EX_LAYERED, WS_EX_TRANSPARENT, SetLayeredWindowAttributes, LWA_ALPHA,
};

fn hwnd(window: &tauri::WebviewWindow) -> HWND {
    window.hwnd().unwrap()
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
    unsafe {
        SetWindowLongW(h, GWL_EXSTYLE, new.0 as i32);
    }
}

#[tauri::command]
fn set_opacity(window: tauri::WebviewWindow, opacity: f64) {
    let h = hwnd(&window);
    let current = unsafe { GetWindowLongW(h, GWL_EXSTYLE) };
    let current = WINDOW_EX_STYLE(current as u32);
    let layered = current | WS_EX_LAYERED;
    unsafe {
        SetWindowLongW(h, GWL_EXSTYLE, layered.0 as i32);
        let _ = SetLayeredWindowAttributes(h, COLORREF(0), (opacity * 255.0) as u8, LWA_ALPHA);
    }
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

#[tauri::command]
fn beep_system() {
    std::process::Command::new("powershell")
        .args(["-c", "[console]::beep(800,50)"])
        .spawn()
        .ok();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if let Some(window) = app.get_webview_window("main") {
                let h = hwnd(&window);
                let current = unsafe { GetWindowLongW(h, GWL_EXSTYLE) };
                let current = WINDOW_EX_STYLE(current as u32);
                let layered = current | WS_EX_LAYERED;
                unsafe {
                    SetWindowLongW(h, GWL_EXSTYLE, layered.0 as i32);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_click_through,
            set_opacity,
            flash_window,
            beep_system,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
