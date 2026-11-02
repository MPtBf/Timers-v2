export const HUB_LABEL = "hub";
export const TIMER_PREFIX = "timer-";
export const DASHBOARD_LABEL = "dashboard";

export function isTimerLabel(label: string): boolean {
  return label.startsWith(TIMER_PREFIX);
}

export function isDashboardLabel(label: string): boolean {
  return label === DASHBOARD_LABEL;
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
