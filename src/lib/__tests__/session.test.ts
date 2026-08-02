import { describe, it, expect } from "vitest";
import { serializeSession, parseSession, type TimerSnapshot } from "../session";

const base: TimerSnapshot = {
  id: 1,
  durationMs: 300000,
  remainingMs: 120000,
  state: "running",
  soundOn: true,
  pinned: false,
  x: 10,
  y: 20,
  w: 95,
  h: 96,
  activityId: null,
};

describe("session serialization", () => {
  it("roundtrips snapshots", () => {
    const text = serializeSession([base]);
    expect(parseSession(text)).toEqual([base]);
  });

  it("returns null for version mismatch", () => {
    const text = JSON.stringify({ version: 2, timers: [base] });
    expect(parseSession(text)).toBeNull();
  });

  it("returns null for invalid json", () => {
    expect(parseSession("not json")).toBeNull();
  });

  it("returns null for non-object payload", () => {
    expect(parseSession("42")).toBeNull();
  });

  it("filters invalid entries", () => {
    const bad = { ...base, state: "weird" };
    const text = JSON.stringify({ version: 1, timers: [base, bad] });
    expect(parseSession(text)).toEqual([base]);
  });

  it("returns empty list for empty session", () => {
    expect(parseSession(serializeSession([]))).toEqual([]);
  });

  it("roundtrips activityId on snapshots", () => {
    const withActivity = { ...base, activityId: 42 };
    const text = serializeSession([withActivity]);
    expect(parseSession(text)).toEqual([withActivity]);
  });

  it("rejects snapshot with non-number activityId", () => {
    const bad = { ...base, activityId: "nope" };
    const text = JSON.stringify({ version: 1, timers: [base, bad] });
    expect(parseSession(text)).toEqual([base]);
  });

  it("rounds float durationMs/remainingMs to integers", () => {
    const floaty = { ...base, durationMs: 300000.1, remainingMs: 269894.6999999881 };
    const text = JSON.stringify({ version: 1, timers: [floaty] });
    expect(parseSession(text)).toEqual([{ ...base, durationMs: 300000, remainingMs: 269895 }]);
  });
});
