import { invoke } from "@tauri-apps/api/core";

export async function setClickThrough(enabled: boolean): Promise<void> {
  await invoke("set_click_through", { enabled });
}

export async function setOpacity(opacity: number): Promise<void> {
  await invoke("set_opacity", { opacity });
}

export async function flashWindow(): Promise<void> {
  await invoke("flash_window");
}

export async function beepSystem(): Promise<void> {
  await invoke("beep_system");
}
