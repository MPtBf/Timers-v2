export interface Block {
  id: number;
  name: string;
  startMs: number;
  endMs: number | null;
}

export interface DayLaneBlock {
  id: number;
  name: string;
  startMs: number;
  endMs: number;
  open: boolean;
}

export interface DayRange {
  fromMs: number;
  toMs: number;
}

export interface DayViewBounds {
  fromMs: number;
  toMs: number;
}

/**
 * Lays out a block inside a day's visible window (e.g. 06:00–24:00), returning
 * percentage offsets for absolute positioning. Clips the block to the window,
 * resolves open blocks to `nowMs`, and returns null when nothing is visible.
 */
export function layoutBlockInDay(
  block: Block,
  bounds: DayViewBounds,
  nowMs: number
): { topPct: number; heightPct: number } | null {
  const span = bounds.toMs - bounds.fromMs;
  if (span <= 0) return null;

  const open = block.endMs === null;
  const rawEnd = open ? Math.min(nowMs, bounds.toMs) : (block.endMs as number);
  const start = Math.max(block.startMs, bounds.fromMs);
  const end = Math.min(rawEnd, bounds.toMs);

  if (end <= start) return null;

  return {
    topPct: ((start - bounds.fromMs) / span) * 100,
    heightPct: ((end - start) / span) * 100,
  };
}

export function isValidBlockName(name: string): boolean {
  return name.trim().length > 0;
}

export function isValidBlockRange(startMs: number, endMs: number | null): boolean {
  return endMs === null || endMs >= startMs;
}

export function buildDayLane(
  blocks: Block[],
  range: DayRange,
  nowMs: number
): DayLaneBlock[] {
  const result: DayLaneBlock[] = [];

  for (const b of blocks) {
    if (b.startMs >= range.toMs) continue;

    const start = Math.max(b.startMs, range.fromMs);
    const open = b.endMs === null;
    const rawEnd = b.endMs ?? Math.min(nowMs, range.toMs);
    const end = Math.min(rawEnd, range.toMs);

    if (end <= start) continue;

    result.push({ id: b.id, name: b.name, startMs: start, endMs: end, open });
  }

  result.sort((a, b) => a.startMs - b.startMs || a.id - b.id);
  return result;
}

/** Deterministic hue (0-360) from a block name. */
export function blockHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash*143 + 158*name.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

/** Deterministic HSL color for a block name (S=80%, L=50%). */
export function blockColor(name: string): string {
  return `hsl(${blockHue(name)}, 70%, 30%)`;
}

export interface Debouncer {
  push: () => void;
  cancel: () => void;
}

/** Timer-based debouncer; `fn` runs once after `ms` of silence. */
export function activityDebounce(fn: () => void, ms: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    push: () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, ms);
    },
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
