import type { TimerState } from "./timer.svelte";

export type { TimerState } from "./timer.svelte";

export interface TimerStateReport {
  durationMs: number;
  remainingMs: number;
  state: TimerState;
  activityId?: number | null;
}

export interface TimerSnapshot extends TimerStateReport {
  id: number;
  soundOn: boolean;
  pinned: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SessionFile {
  version: 1;
  timers: TimerSnapshot[];
}

export function serializeSession(timers: TimerSnapshot[]): string {
  return JSON.stringify({ version: 1, timers });
}

export function parseSession(text: string): TimerSnapshot[] | null {
  try {
    const data = JSON.parse(text) as Partial<SessionFile>;
    if (!data || data.version !== 1 || !Array.isArray(data.timers)) return null;
    return data.timers
      .filter(isValidSnapshot)
      .map((t) => ({ ...t, activityId: t.activityId ?? null }));
  } catch {
    return null;
  }
}

function isValidSnapshot(s: unknown): s is TimerSnapshot {
  if (typeof s !== "object" || s === null) return false;
  const v = s as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    typeof v.durationMs === "number" &&
    typeof v.remainingMs === "number" &&
    (v.state === "stopped" || v.state === "running" || v.state === "paused") &&
    typeof v.soundOn === "boolean" &&
    typeof v.pinned === "boolean" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.w === "number" &&
    typeof v.h === "number" &&
    (v.activityId === undefined ||
      v.activityId === null ||
      typeof v.activityId === "number")
  );
}
