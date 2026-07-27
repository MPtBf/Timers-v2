use tauri::Manager;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    FlashWindowEx, FlashwInfo, FLASHWINFO, FLASHW_ALL, FLASHW_TIMERNOFG,
    GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
    SetLayeredWindowAttributes, LWA_ALPHA,
};

fn hwnd(window: &tauri::Window) -> HWND {
    HWND(window.hwnd() as isize)
}

#[tauri::command]
fn set_click_through(window: tauri::Window, enabled: bool) {
    let h = hwnd(&window);
    let current = unsafe { GetWindowLongW(h, GWL_EXSTYLE) };
    let new = if enabled {
        current | WS_EX_TRANSPARENT as i32
    } else {
        current & !(WS_EX_TRANSPARENT as i32)
    };
    unsafe {
        SetWindowLongW(h, GWL_EXSTYLE, new);
    }
}

#[tauri::command]
fn set_opacity(window: tauri::Window, opacity: f64) {
    let h = hwnd(&window);
    let current = unsafe { GetWindowLongW(h, GWL_EXSTYLE) };
    let layered = current | WS_EX_LAYERED as i32;
    unsafe {
        SetWindowLongW(h, GWL_EXSTYLE, layered);
        SetLayeredWindowAttributes(h, 0, (opacity * 255.0) as u8, LWA_ALPHA);
    }
}

#[tauri::command]
fn flash_window(window: tauri::Window) {
    let h = hwnd(&window);
    let info = FLASHWINFO {
        cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
        hwnd: h,
        dwFlags: FLASHW_ALL | FLASHW_TIMERNOFG,
        uCount: 3,
        dwTimeout: 0,
    };
    unsafe {
        FlashWindowEx(&info);
    }
}

#[tauri::command]
fn beep_system() {
    unsafe {
        windows::Win32::UI::WindowsAndMessaging::Beep(800, 50);
    }
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
                let layered = current | WS_EX_LAYERED as i32;
                unsafe {
                    SetWindowLongW(h, GWL_EXSTYLE, layered);
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
