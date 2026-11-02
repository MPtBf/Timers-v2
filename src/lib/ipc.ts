import { invoke } from "@tauri-apps/api/core";
import type { TimerSnapshot } from "./session";
import type { Block } from "./activity";

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

export async function createDashboardWindow(): Promise<void> {
  await invoke("create_dashboard_window");
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

export async function closeTimer(id: number): Promise<boolean> {
  return await invoke<boolean>("close_timer", { id });
}

export async function focusTimer(id: number): Promise<boolean> {
  return await invoke<boolean>("focus_timer", { id });
}

export async function saveSession(json: string): Promise<void> {
  await invoke("save_session", { json });
}

export async function loadSession(): Promise<string | null> {
  return await invoke<string | null>("load_session");
}

export async function getActivityDbPath(): Promise<string> {
  return await invoke<string>("get_activity_db_path");
}

export async function activityInit(): Promise<void> {
  await invoke<void>("activity_init");
}

export async function blockOpen(
  name: string,
  startMs: number,
  endMs: number | null = null
): Promise<number> {
  return await invoke<number>("block_open", { name, startMs, endMs });
}

export async function blockClose(endMs: number): Promise<number | null> {
  return await invoke<number | null>("block_close", { endMs });
}

export async function blockDelete(id: number): Promise<void> {
  await invoke<void>("block_delete", { id });
}

export async function blockUpdate(
  id: number,
  name: string,
  startMs: number,
  endMs: number | null
): Promise<void> {
  await invoke<void>("block_update", { id, name, startMs, endMs });
}

export async function blockQuery(fromMs: number, toMs: number): Promise<Block[]> {
  return await invoke<Block[]>("block_query", { fromMs, toMs });
}

export async function blockSuggestions(): Promise<string[]> {
  return await invoke<string[]>("block_suggestions");
}

export async function activityReconcile(): Promise<number> {
  return await invoke<number>("activity_reconcile");
}

export async function quitAll(): Promise<void> {
  await invoke("quit_all");
}
