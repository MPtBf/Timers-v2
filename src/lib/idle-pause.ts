import type { TimerState } from "./timer.svelte";

export interface IdlePauseCheck {
  state: TimerState;
  autoPause: boolean;
  idleMs: number;
  thresholdMs: number;
  overtime: boolean;
}

export function shouldAutoPause(opts: IdlePauseCheck): boolean {
  return (
    opts.state === "running" &&
    opts.autoPause &&
    !opts.overtime &&
    opts.idleMs >= opts.thresholdMs
  );
}
