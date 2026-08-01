import { invoke } from "@tauri-apps/api/core";
import type { TimerSnapshot } from "./session";

export async function setClickThrough(enabled: boolean): Promise<void> {
  await invoke("set_click_through", { enabled });
}

export async function setOpacity(opacity: number): Promise<void> {
  await invoke("set_opacity", { opacity });
}

export async function applyDwm(): Promise<void> {
  await invoke("apply_dwm");
}

export async function raiseWindow(): Promise<void> {
  await invoke("raise_window");
}

export async function flashWindow(): Promise<void> {
  await invoke("flash_window");
}

export async function beepSystem(): Promise<void> {
  await invoke("beep_system");
}

export async function getModifierState(): Promise<[boolean, boolean]> {
  return await invoke<[boolean, boolean]>("get_modifier_state");
}

export async function getCursorPos(): Promise<[number, number]> {
  return await invoke<[number, number]>("get_cursor_pos");
}

export async function getIdleTime(): Promise<number> {
  return await invoke<number>("get_idle_time");
}

export async function createTimerWindow(snapshot: TimerSnapshot): Promise<void> {
  await invoke("create_timer_window", { snapshot });
}

export async function getTimerInit(): Promise<TimerSnapshot | null> {
  return await invoke<TimerSnapshot | null>("get_timer_init");
}

export async function hideTimers(): Promise<void> {
  await invoke("hide_timers");
}

export async function showTimers(): Promise<void> {
  await invoke("show_timers");
}

export async function setTimersAlwaysOnTop(pinned: boolean): Promise<void> {
  await invoke("set_timers_always_on_top", { pinned });
}

export async function muteAll(muted: boolean): Promise<void> {
  await invoke("mute_all", { muted });
}

export async function closeTimer(id: number): Promise<void> {
  await invoke("close_timer", { id });
}

export async function focusTimer(id: number): Promise<void> {
  await invoke("focus_timer", { id });
}

export async function saveSession(json: string): Promise<void> {
  await invoke("save_session", { json });
}

export async function loadSession(): Promise<string | null> {
  return await invoke<string | null>("load_session");
}

export async function quitAll(): Promise<void> {
  await invoke("quit_all");
}
