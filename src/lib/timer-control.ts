export interface StartCommand {
  timerLabel: string;
  minutes: number;
  activityId: number | null;
  activityName: string | null;
  logEnabled: boolean;
  autoPause: boolean;
}

export interface FinishCommand {
  timerLabel: string;
  activityId: number;
  efficiency: number;
  usefulness: number;
  endedMs: number;
}

export interface ConfigCommand {
  timerLabel: string;
  logEnabled: boolean;
  autoPause: boolean;
}

export interface LogState {
  logEnabled: boolean;
  autoPause: boolean;
  activityId: number | null;
  activityName: string | null;
}

export interface RequestFinishCommand {
  timerLabel: string;
  activityId: number | null;
  activityName: string | null;
}

export interface TimerControl {
  start: StartCommand | null;
  finish: FinishCommand | null;
  config: ConfigCommand | null;
}

export function createTimerControl(): TimerControl {
  return { start: null, finish: null, config: null };
}
