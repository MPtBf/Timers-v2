import { describe, it, expect } from "vitest";
import { computeTaskPrefill } from "../task-panel";
import type { ActivityBlockRow } from "../activity";

const workRow = (over: Partial<ActivityBlockRow> = {}): ActivityBlockRow => ({
  id: 10,
  activityId: 5,
  kind: "work",
  startMs: 1000,
  endMs: null,
  timerLabel: "timer-1",
  activityName: "Парсер",
  activityCategory: "Работа",
  tags: ["dev", "rust"],
  status: "active",
  efficiency: null,
  usefulness: null,
  logEnabled: true,
  ...over,
});

describe("computeTaskPrefill", () => {
  it("returns empty prefill when no open block", () => {
    expect(computeTaskPrefill(null, true)).toEqual({
      category: "",
      name: "",
      tags: "",
      logEnabled: true,
      autoPause: true,
      activityId: null,
      canContinue: false,
    });
  });

  it("returns empty prefill with autoPause default when no open block and default false", () => {
    expect(computeTaskPrefill(null, false)).toEqual({
      category: "",
      name: "",
      tags: "",
      logEnabled: true,
      autoPause: false,
      activityId: null,
      canContinue: false,
    });
  });

  it("prefills fields from an open work block", () => {
    const got = computeTaskPrefill(workRow(), true);
    expect(got.category).toBe("Работа");
    expect(got.name).toBe("Парсер");
    expect(got.tags).toBe("dev, rust");
    expect(got.activityId).toBe(5);
    expect(got.logEnabled).toBe(true);
    expect(got.canContinue).toBe(true);
  });

  it("respects logEnabled=false from the joined activity", () => {
    const got = computeTaskPrefill(workRow({ logEnabled: false }), true);
    expect(got.logEnabled).toBe(false);
  });

  it("uses empty tag list when tags are null", () => {
    const got = computeTaskPrefill(workRow({ tags: null }), true);
    expect(got.tags).toBe("");
  });

  it("canContinue=false when activity join is missing (deleted activity)", () => {
    const got = computeTaskPrefill(workRow({ activityId: null, activityName: null, activityCategory: null, tags: null }), true);
    expect(got.activityId).toBeNull();
    expect(got.canContinue).toBe(false);
    expect(got.name).toBe("");
  });

  it("prefills empty fields from a break block (activity is null)", () => {
    const got = computeTaskPrefill(workRow({ kind: "break", activityId: null, activityName: null, activityCategory: null, tags: null }), true);
    expect(got.name).toBe("");
    expect(got.category).toBe("");
    expect(got.canContinue).toBe(false);
    expect(got.logEnabled).toBe(true);
  });

  it("keeps activityId but canContinue=false when name is null yet id present", () => {
    const got = computeTaskPrefill(workRow({ activityId: 5, activityName: null }), true);
    expect(got.activityId).toBe(5);
    expect(got.canContinue).toBe(false);
    expect(got.name).toBe("");
  });
});
