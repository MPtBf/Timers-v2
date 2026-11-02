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
};

describe("session serialization", () => {
  it("roundtrips snapshots at version 2", () => {
    const text = serializeSession([base]);
    expect(parseSession(text)).toEqual([base]);
  });

  it("writes version 2 and no activityId", () => {
    const text = serializeSession([base]);
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(2);
    expect(parsed.timers[0]).not.toHaveProperty("activityId");
  });

  it("returns null for unknown version", () => {
    const text = JSON.stringify({ version: 3, timers: [base] });
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
    const text = JSON.stringify({ version: 2, timers: [base, bad] });
    expect(parseSession(text)).toEqual([base]);
  });

  it("returns empty list for empty session", () => {
    expect(parseSession(serializeSession([]))).toEqual([]);
  });

  it("migrates version 1 by discarding activityId", () => {
    const legacy = { ...base, activityId: 42 };
    const text = JSON.stringify({ version: 1, timers: [legacy] });
    expect(parseSession(text)).toEqual([base]);
  });

  it("rounds float durationMs/remainingMs to integers", () => {
    const floaty = { ...base, durationMs: 300000.1, remainingMs: 269894.6999999881 };
    const text = JSON.stringify({ version: 2, timers: [floaty] });
    expect(parseSession(text)).toEqual([{ ...base, durationMs: 300000, remainingMs: 269895 }]);
  });
});
