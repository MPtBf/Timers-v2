import type { TimerState } from "./timer.svelte";

export type { TimerState } from "./timer.svelte";

export interface TimerStateReport {
  durationMs: number;
  remainingMs: number;
  state: TimerState;
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
  version: number;
  timers: TimerSnapshot[];
}

export function serializeSession(timers: TimerSnapshot[]): string {
  return JSON.stringify({ version: 2, timers });
}

export function parseSession(text: string): TimerSnapshot[] | null {
  try {
    const data = JSON.parse(text) as Partial<SessionFile>;
    if (!data || typeof data.version !== "number" || !Array.isArray(data.timers)) {
      return null;
    }
    if (data.version !== 1 && data.version !== 2) return null;
    return data.timers
      .filter(isValidSnapshot)
      .map((t) => ({
        id: t.id,
        durationMs: Math.round(t.durationMs),
        remainingMs: Math.round(t.remainingMs),
        state: t.state,
        soundOn: t.soundOn,
        pinned: t.pinned,
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
      }));
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
    typeof v.h === "number"
  );
}
