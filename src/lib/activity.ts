export type BlockKind = "work" | "break" | "away";
export type ActivityStatus = "active" | "finished";
export type RatingMode = "efficiency" | "usefulness" | "average";

export interface Activity {
  id: number | null;
  name: string;
  category: string;
  tags: string[];
  parentId: number | null;
  logEnabled: boolean;
  status: ActivityStatus;
  efficiency: number | null;
  usefulness: number | null;
  startedMs: number;
  endedMs: number | null;
}

export interface ActivityBlock {
  id: number | null;
  activityId: number | null;
  kind: BlockKind;
  startMs: number;
  endMs: number | null;
  timerLabel: string;
}

export interface ActivityBlockRow {
  id: number;
  activityId: number | null;
  kind: BlockKind;
  startMs: number;
  endMs: number | null;
  timerLabel: string;
  activityName: string | null;
  activityCategory: string | null;
  tags: string[] | null;
  status: ActivityStatus | null;
  efficiency: number | null;
  usefulness: number | null;
  logEnabled: boolean | null;
}

export interface DayLaneBlock {
  id: number;
  activityId: number | null;
  kind: BlockKind;
  startMs: number;
  endMs: number;
  open: boolean;
  activityName: string | null;
  activityCategory: string | null;
  tags: string[] | null;
  status: ActivityStatus | null;
  efficiency: number | null;
  usefulness: number | null;
}

export interface ActivitySummary {
  id: number;
  name: string;
  category: string;
  status: ActivityStatus;
}

export interface Suggestions {
  categories: string[];
  activities: ActivitySummary[];
}

export interface DayRange {
  fromMs: number;
  toMs: number;
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

export function parseTags(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string");
  } catch {
    return [];
  }
}

export function ratingMetric(
  efficiency: number | null,
  usefulness: number | null,
  mode: RatingMode
): number | null {
  if (mode === "efficiency") return efficiency;
  if (mode === "usefulness") return usefulness;
  if (efficiency !== null && usefulness !== null) return (efficiency + usefulness) / 2;
  return efficiency ?? usefulness;
}

export function buildDayLane(
  rows: ActivityBlockRow[],
  range: DayRange,
  nowMs: number
): DayLaneBlock[] {
  const result: DayLaneBlock[] = [];

  for (const r of rows) {
    if (r.startMs >= range.toMs) continue;

    const start = Math.max(r.startMs, range.fromMs);
    const open = r.endMs === null;
    const rawEnd = r.endMs ?? Math.min(nowMs, range.toMs);
    const end = Math.min(rawEnd, range.toMs);

    if (end <= start) continue;

    result.push({
      id: r.id,
      activityId: r.activityId,
      kind: r.kind,
      startMs: start,
      endMs: end,
      open,
      activityName: r.activityName,
      activityCategory: r.activityCategory,
      tags: r.tags,
      status: r.status,
      efficiency: r.efficiency,
      usefulness: r.usefulness,
    });
  }

  result.sort((a, b) => a.startMs - b.startMs || a.id - b.id);
  return result;
}
