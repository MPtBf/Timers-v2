export const HUB_LABEL = "hub";
export const TIMER_PREFIX = "timer-";
export const TASK_PANEL_PREFIX = "task-";
export const FINISH_PANEL_PREFIX = "finish-";

export function isTimerLabel(label: string): boolean {
  return label.startsWith(TIMER_PREFIX);
}

export function isTaskPanelLabel(label: string): boolean {
  return label.startsWith(TASK_PANEL_PREFIX);
}

export function isFinishPanelLabel(label: string): boolean {
  return label.startsWith(FINISH_PANEL_PREFIX);
}

export function panelTimerLabel(label: string): string | null {
  const prefix = isTaskPanelLabel(label)
    ? TASK_PANEL_PREFIX
    : isFinishPanelLabel(label)
      ? FINISH_PANEL_PREFIX
      : null;
  if (prefix === null) return null;
  const timer = label.slice(prefix.length);
  return isTimerLabel(timer) && timer.length > TIMER_PREFIX.length ? timer : null;
}

export function timerIdFromLabel(label: string): number | null {
  if (!isTimerLabel(label)) return null;
  const suffix = label.slice(TIMER_PREFIX.length);
  if (suffix.length === 0) return null;
  const id = Number(suffix);
  return Number.isInteger(id) ? id : null;
}

export function timerLabel(id: number): string {
  return `${TIMER_PREFIX}${id}`;
}
