import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildDayLane,
  layoutBlockInDay,
  isValidBlockName,
  isValidBlockRange,
  blockHue,
  blockColor,
  activityDebounce,
  type Block,
} from "../activity";

const MIN = 60000;
const DAY = 86400000;

function block(partial: Partial<Block> = {}): Block {
  return { id: 1, name: "Писать парсер", startMs: 0, endMs: null, ...partial };
}

describe("isValidBlockName", () => {
  it("accepts non-empty names", () => {
    expect(isValidBlockName("Парсер")).toBe(true);
    expect(isValidBlockName("  a  ")).toBe(true);
  });

  it("rejects empty or whitespace-only names", () => {
    expect(isValidBlockName("")).toBe(false);
    expect(isValidBlockName("   ")).toBe(false);
  });
});

describe("isValidBlockRange", () => {
  it("accepts end >= start", () => {
    expect(isValidBlockRange(1000, 2000)).toBe(true);
    expect(isValidBlockRange(1000, 1000)).toBe(true);
  });

  it("accepts open blocks", () => {
    expect(isValidBlockRange(1000, null)).toBe(true);
  });

  it("rejects end < start", () => {
    expect(isValidBlockRange(5000, 1000)).toBe(false);
  });
});

describe("buildDayLane", () => {
  const range = { fromMs: 0, toMs: DAY };

  it("returns empty lane for empty input", () => {
    expect(buildDayLane([], range, DAY)).toEqual([]);
  });

  it("sorts blocks by start time", () => {
    const a = block({ id: 1, startMs: 3000, endMs: 4000 });
    const b = block({ id: 2, startMs: 1000, endMs: 2000 });
    const c = block({ id: 3, startMs: 500, endMs: 900 });
    expect(buildDayLane([a, b, c], range, DAY).map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("is stable on start-time ties, ordering by id", () => {
    const a = block({ id: 5, startMs: 1000, endMs: 2000 });
    const b = block({ id: 2, startMs: 1000, endMs: 1500 });
    expect(buildDayLane([a, b], range, DAY).map((r) => r.id)).toEqual([2, 5]);
  });

  it("clips start before the range to range start", () => {
    const a = block({ startMs: -MIN, endMs: 2 * MIN });
    const result = buildDayLane([a], range, DAY);
    expect(result[0].startMs).toBe(0);
    expect(result[0].endMs).toBe(2 * MIN);
  });

  it("clips end after the range to range end", () => {
    const a = block({ startMs: DAY - MIN, endMs: DAY + MIN });
    const result = buildDayLane([a], range, DAY);
    expect(result[0].startMs).toBe(DAY - MIN);
    expect(result[0].endMs).toBe(DAY);
  });

  it("excludes blocks entirely before the range", () => {
    expect(buildDayLane([block({ startMs: -2 * MIN, endMs: -MIN })], range, DAY)).toEqual([]);
  });

  it("excludes blocks entirely after the range", () => {
    expect(
      buildDayLane([block({ startMs: DAY + MIN, endMs: DAY + 2 * MIN })], range, DAY)
    ).toEqual([]);
  });

  it("resolves an open block to now, clipped to the range", () => {
    const result = buildDayLane([block({ startMs: 3 * MIN, endMs: null })], range, 5 * MIN);
    expect(result[0].endMs).toBe(5 * MIN);
    expect(result[0].open).toBe(true);
  });

  it("clips an open block to range end when now is beyond it", () => {
    const result = buildDayLane([block({ startMs: DAY - MIN, endMs: null })], range, DAY + MIN);
    expect(result[0].endMs).toBe(DAY);
    expect(result[0].open).toBe(true);
  });

  it("excludes an open block that starts at or after now", () => {
    expect(buildDayLane([block({ startMs: 6 * MIN, endMs: null })], range, 5 * MIN)).toEqual([]);
  });

  it("drops zero-length and negative-length blocks", () => {
    const zero = block({ id: 1, startMs: 1000, endMs: 1000 });
    const neg = block({ id: 2, startMs: 5000, endMs: 1000 });
    expect(buildDayLane([zero, neg], range, DAY)).toEqual([]);
  });

  it("sets open=false for closed blocks", () => {
    const result = buildDayLane([block({ startMs: MIN, endMs: 2 * MIN })], range, DAY);
    expect(result[0].open).toBe(false);
    expect(result[0].name).toBe("Писать парсер");
  });

  it("does not mutate the input rows", () => {
    const a = block({ startMs: -MIN, endMs: DAY + MIN });
    buildDayLane([a], range, DAY);
    expect(a.startMs).toBe(-MIN);
    expect(a.endMs).toBe(DAY + MIN);
  });
});

describe("layoutBlockInDay", () => {
  // Visible window 06:00 (21600000) .. 24:00 (86400000).
  const bounds = { fromMs: 21600000, toMs: 86400000 };

  it("returns null when the block does not intersect the window", () => {
    expect(layoutBlockInDay(block({ startMs: 0, endMs: 1000 }), bounds, 86400000)).toBeNull();
    expect(
      layoutBlockInDay(block({ startMs: 86400000, endMs: 86500000 }), bounds, 86400000)
    ).toBeNull();
  });

  it("positions a block with minute precision", () => {
    // 06:30 → 07:30.
    const start = 21600000 + 30 * 60000;
    const end = start + 3600000;
    const layout = layoutBlockInDay(block({ startMs: start, endMs: end }), bounds, 86400000)!;
    expect(layout.topPct).toBeCloseTo((30 * 60000 / (18 * 3600000)) * 100, 6);
    expect(layout.heightPct).toBeCloseTo((3600000 / (18 * 3600000)) * 100, 6);
  });

  it("clips a block that starts before the window", () => {
    const layout = layoutBlockInDay(block({ startMs: 0, endMs: 21600000 + 3600000 }), bounds, 86400000)!;
    expect(layout.topPct).toBe(0);
    expect(layout.heightPct).toBeCloseTo((3600000 / (18 * 3600000)) * 100, 6);
  });

  it("clips a block that ends after the window", () => {
    const layout = layoutBlockInDay(
      block({ startMs: 86400000 - 3600000, endMs: 86400000 + 3600000 }),
      bounds,
      86400000
    )!;
    expect(layout.heightPct).toBeCloseTo((3600000 / (18 * 3600000)) * 100, 6);
  });

  it("resolves an open block to now, clipped to the window", () => {
    const start = 21600000 + 3600000;
    const now = start + 3600000;
    const layout = layoutBlockInDay(block({ startMs: start, endMs: null }), bounds, now)!;
    expect(layout.heightPct).toBeCloseTo((3600000 / (18 * 3600000)) * 100, 6);
  });

  it("returns null for an open block that has not started yet relative to now", () => {
    const start = 21600000 + 3600000;
    expect(
      layoutBlockInDay(block({ startMs: start, endMs: null }), bounds, start - 1000)
    ).toBeNull();
  });

  it("returns null for zero or negative span", () => {
    expect(layoutBlockInDay(block({ startMs: 1000, endMs: 1000 }), bounds, 86400000)).toBeNull();
    expect(layoutBlockInDay(block({ startMs: 5000, endMs: 1000 }), bounds, 86400000)).toBeNull();
  });
});

describe("blockColor", () => {
  it("is deterministic for the same name", () => {
    expect(blockColor("Парсер")).toBe(blockColor("Парсер"));
  });

  it("returns hue in range for any name", () => {
    for (const n of ["a", "Парсер", "", "zzzzzzzz"]) {
      const hue = blockHue(n);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe("activityDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once after the delay of silence", () => {
    const fn = vi.fn();
    const d = activityDebounce(fn, 10000);
    d.push();
    d.push();
    d.push();
    vi.advanceTimersByTime(9999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on each push", () => {
    const fn = vi.fn();
    const d = activityDebounce(fn, 10000);
    d.push();
    vi.advanceTimersByTime(5000);
    d.push();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel prevents the pending call", () => {
    const fn = vi.fn();
    const d = activityDebounce(fn, 10000);
    d.push();
    vi.advanceTimersByTime(5000);
    d.cancel();
    vi.advanceTimersByTime(20000);
    expect(fn).not.toHaveBeenCalled();
  });
});
