import { invoke } from "@tauri-apps/api/core";
import type { TimerSnapshot } from "./session";
import type { Activity, ActivityBlock, ActivityBlockRow, Suggestions } from "./activity";

export interface PanelInit {
  timerLabel: string;
  logEnabled: boolean | null;
  autoPause: boolean | null;
  activityId: number | null;
  activityName: string | null;
  minutes: number | null;
}

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

export async function createTaskPanel(
  timerLabel: string,
  logEnabled: boolean | null,
  autoPause: boolean | null,
  minutes: number | null
): Promise<void> {
  await invoke("create_task_panel", { timerLabel, logEnabled, autoPause, minutes });
}

export async function createFinishPanel(
  timerLabel: string,
  activityId: number | null,
  activityName: string | null
): Promise<void> {
  await invoke("create_finish_panel", { timerLabel, activityId, activityName });
}

export async function getPanelInit(): Promise<PanelInit | null> {
  return await invoke<PanelInit | null>("get_panel_init");
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

export async function activityUpsert(activity: Activity): Promise<number> {
  return await invoke<number>("activity_upsert", { activity });
}

export async function activityOpenBlock(block: ActivityBlock): Promise<number> {
  return await invoke<number>("activity_open_block", { block });
}

export async function activityCloseBlock(
  timerLabel: string,
  endMs: number
): Promise<number | null> {
  return await invoke<number | null>("activity_close_block", { timerLabel, endMs });
}

export async function activityFinish(
  activityId: number,
  efficiency: number | null,
  usefulness: number | null,
  endedMs: number
): Promise<void> {
  return await invoke<void>("activity_finish", { activityId, efficiency, usefulness, endedMs });
}

export async function activityUpdateBlock(block: ActivityBlock): Promise<void> {
  return await invoke<void>("activity_update_block", { block });
}

export async function activityDeleteBlock(id: number): Promise<void> {
  return await invoke<void>("activity_delete_block", { id });
}

export async function activityDeleteActivity(id: number): Promise<void> {
  return await invoke<void>("activity_delete_activity", { id });
}

export async function activityQuery(fromMs: number, toMs: number): Promise<ActivityBlockRow[]> {
  return await invoke<ActivityBlockRow[]>("activity_query", { fromMs, toMs });
}

export async function activityGetOpenBlock(timerLabel: string): Promise<ActivityBlockRow | null> {
  return await invoke<ActivityBlockRow | null>("activity_get_open_block", { timerLabel });
}

export async function activityGetGlobalOpenBlock(): Promise<ActivityBlockRow | null> {
  return await invoke<ActivityBlockRow | null>("activity_get_global_open_block");
}

export async function activitySuggestions(): Promise<Suggestions> {
  return await invoke<Suggestions>("activity_suggestions");
}

export async function activityReconcile(cutoffMs: number): Promise<number> {
  return await invoke<number>("activity_reconcile", { cutoffMs });
}

export async function quitAll(): Promise<void> {
  await invoke("quit_all");
}
