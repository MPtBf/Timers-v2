import { describe, it, expect } from "vitest";
import {
  parseTags,
  serializeTags,
  ratingMetric,
  buildDayLane,
  type ActivityBlockRow,
  type DayLaneBlock,
} from "../activity";

const MIN = 60000;
const DAY = 86400000;

function row(partial: Partial<ActivityBlockRow> = {}): ActivityBlockRow {
  return {
    id: 1,
    activityId: 1,
    kind: "work",
    startMs: 0,
    endMs: null,
    timerLabel: "timer-1",
    activityName: "Писать парсер",
    activityCategory: "Работа",
    tags: null,
    status: "active",
    efficiency: null,
    usefulness: null,
    logEnabled: true,
    ...partial,
  };
}

function lane(partial: Partial<DayLaneBlock> = {}): DayLaneBlock {
  return {
    id: 1,
    activityId: 1,
    kind: "work",
    startMs: 0,
    endMs: 0,
    open: false,
    activityName: "Писать парсер",
    activityCategory: "Работа",
    tags: null,
    status: "active",
    efficiency: null,
    usefulness: null,
    ...partial,
  };
}

describe("serializeTags / parseTags", () => {
  it("roundtrips empty array", () => {
    expect(parseTags(serializeTags([]))).toEqual([]);
  });

  it("roundtrips tags preserving order and duplicates", () => {
    const tags = ["глубокий", "один", "глубокий"];
    expect(parseTags(serializeTags(tags))).toEqual(tags);
  });

  it("returns [] for non-array JSON", () => {
    expect(parseTags('{"a":1}')).toEqual([]);
    expect(parseTags("null")).toEqual([]);
    expect(parseTags("42")).toEqual([]);
  });

  it("filters out non-string elements", () => {
    expect(parseTags('[1, "ok", true]')).toEqual(["ok"]);
  });

  it("returns [] for invalid JSON", () => {
    expect(parseTags("not json")).toEqual([]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("ratingMetric", () => {
  it("efficiency mode returns efficiency", () => {
    expect(ratingMetric(80, 40, "efficiency")).toBe(80);
  });

  it("usefulness mode returns usefulness", () => {
    expect(ratingMetric(80, 40, "usefulness")).toBe(40);
  });

  it("average of both ratings", () => {
    expect(ratingMetric(80, 40, "average")).toBe(60);
  });

  it("average falls back to the single present rating", () => {
    expect(ratingMetric(80, null, "average")).toBe(80);
    expect(ratingMetric(null, 40, "average")).toBe(40);
  });

  it("returns null when no ratings are present", () => {
    expect(ratingMetric(null, null, "efficiency")).toBeNull();
    expect(ratingMetric(null, null, "average")).toBeNull();
  });
});

describe("buildDayLane", () => {
  const range = { fromMs: 0, toMs: DAY };

  it("returns empty lane for empty input", () => {
    expect(buildDayLane([], range, DAY)).toEqual([]);
  });

  it("sorts blocks by start time", () => {
    const a = row({ id: 1, startMs: 3000, endMs: 4000 });
    const b = row({ id: 2, startMs: 1000, endMs: 2000 });
    const c = row({ id: 3, startMs: 500, endMs: 900 });
    const result = buildDayLane([a, b, c], range, DAY);
    expect(result.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("is stable on start-time ties, ordering by id", () => {
    const a = row({ id: 5, startMs: 1000, endMs: 2000 });
    const b = row({ id: 2, startMs: 1000, endMs: 1500 });
    const result = buildDayLane([a, b], range, DAY);
    expect(result.map((r) => r.id)).toEqual([2, 5]);
  });

  it("clips start before the range to range start", () => {
    const a = row({ startMs: -MIN, endMs: 2 * MIN });
    const result = buildDayLane([a], range, DAY);
    expect(result[0].startMs).toBe(0);
    expect(result[0].endMs).toBe(2 * MIN);
  });

  it("clips end after the range to range end", () => {
    const a = row({ startMs: DAY - MIN, endMs: DAY + MIN });
    const result = buildDayLane([a], range, DAY);
    expect(result[0].startMs).toBe(DAY - MIN);
    expect(result[0].endMs).toBe(DAY);
  });

  it("excludes blocks entirely before the range", () => {
    const a = row({ startMs: -2 * MIN, endMs: -MIN });
    expect(buildDayLane([a], range, DAY)).toEqual([]);
  });

  it("excludes blocks entirely after the range", () => {
    const a = row({ startMs: DAY + MIN, endMs: DAY + 2 * MIN });
    expect(buildDayLane([a], range, DAY)).toEqual([]);
  });

  it("resolves an open block to now, clipped to the range", () => {
    const a = row({ startMs: 3 * MIN, endMs: null });
    const result = buildDayLane([a], range, 5 * MIN);
    expect(result[0].endMs).toBe(5 * MIN);
    expect(result[0].open).toBe(true);
  });

  it("clips an open block to range end when now is beyond it", () => {
    const a = row({ startMs: DAY - MIN, endMs: null });
    const result = buildDayLane([a], range, DAY + MIN);
    expect(result[0].endMs).toBe(DAY);
    expect(result[0].open).toBe(true);
  });

  it("excludes an open block that starts at or after now", () => {
    const a = row({ startMs: 6 * MIN, endMs: null });
    expect(buildDayLane([a], range, 5 * MIN)).toEqual([]);
  });

  it("drops zero-length and negative-length blocks", () => {
    const zero = row({ id: 1, startMs: 1000, endMs: 1000 });
    const neg = row({ id: 2, startMs: 5000, endMs: 1000 });
    expect(buildDayLane([zero, neg], range, DAY)).toEqual([]);
  });

  it("carries activity fields and sets open=false for closed blocks", () => {
    const a = row({ startMs: MIN, endMs: 2 * MIN, efficiency: 80, usefulness: 60 });
    const result = buildDayLane([a], range, DAY);
    expect(result[0]).toEqual(
      lane({
        startMs: MIN,
        endMs: 2 * MIN,
        efficiency: 80,
        usefulness: 60,
      })
    );
  });

  it("keeps break blocks with null activity fields", () => {
    const a = row({
      id: 2,
      activityId: null,
      kind: "break",
      startMs: MIN,
      endMs: 2 * MIN,
      activityName: null,
      activityCategory: null,
      tags: null,
      status: null,
      efficiency: null,
      usefulness: null,
    });
    const result = buildDayLane([a], range, DAY);
    expect(result[0].activityId).toBeNull();
    expect(result[0].activityName).toBeNull();
    expect(result[0].efficiency).toBeNull();
  });

  it("does not mutate the input rows", () => {
    const a = row({ startMs: -MIN, endMs: DAY + MIN });
    buildDayLane([a], range, DAY);
    expect(a.startMs).toBe(-MIN);
    expect(a.endMs).toBe(DAY + MIN);
  });
});
