import type { ActivityBlockRow } from "./activity";

export interface TaskPrefill {
  category: string;
  name: string;
  tags: string;
  logEnabled: boolean;
  autoPause: boolean;
  activityId: number | null;
  canContinue: boolean;
}

export function dealBlockedMessage(
  globalOpenBlock: ActivityBlockRow | null,
  timerLabel: string
): string | null {
  if (globalOpenBlock !== null && globalOpenBlock.timerLabel !== timerLabel) {
    return `Дело уже открыто на таймере ${globalOpenBlock.timerLabel}`;
  }
  return null;
}

export function computeTaskPrefill(
  openBlock: ActivityBlockRow | null,
  autoPauseDefault: boolean
): TaskPrefill {
  if (openBlock === null) {
    return {
      category: "",
      name: "",
      tags: "",
      logEnabled: true,
      autoPause: autoPauseDefault,
      activityId: null,
      canContinue: false,
    };
  }
  const activityId = openBlock.activityId;
  const hasActivity = activityId !== null && openBlock.activityName !== null;
  return {
    category: openBlock.activityCategory ?? "",
    name: openBlock.activityName ?? "",
    tags: (openBlock.tags ?? []).join(", "),
    logEnabled: openBlock.logEnabled ?? true,
    autoPause: autoPauseDefault,
    activityId,
    canContinue: hasActivity,
  };
}
