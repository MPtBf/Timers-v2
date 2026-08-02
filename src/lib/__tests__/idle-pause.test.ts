import { describe, it, expect } from "vitest";
import { shouldAutoPause } from "../idle-pause";

describe("shouldAutoPause", () => {
  const base = { autoPause: true, idleMs: 120000, thresholdMs: 120000, overtime: false };

  it("pauses when running and idle exceeds threshold", () => {
    expect(shouldAutoPause({ ...base, state: "running", idleMs: 121000 })).toBe(true);
  });

  it("pauses at exactly the threshold", () => {
    expect(shouldAutoPause({ ...base, state: "running", idleMs: 120000 })).toBe(true);
  });

  it("does not pause when idle is below threshold", () => {
    expect(shouldAutoPause({ ...base, state: "running", idleMs: 119999 })).toBe(false);
  });

  it("does not pause when timer is stopped", () => {
    expect(shouldAutoPause({ ...base, state: "stopped", idleMs: 999999 })).toBe(false);
  });

  it("does not pause when timer is already paused", () => {
    expect(shouldAutoPause({ ...base, state: "paused", idleMs: 999999 })).toBe(false);
  });

  it("does not pause when autoPause is disabled", () => {
    expect(shouldAutoPause({ ...base, state: "running", autoPause: false, idleMs: 999999 })).toBe(false);
  });

  it("does not pause during overtime", () => {
    expect(shouldAutoPause({ ...base, state: "running", overtime: true, idleMs: 999999 })).toBe(false);
  });

  it("does not pause at zero idle time", () => {
    expect(shouldAutoPause({ ...base, state: "running", idleMs: 0 })).toBe(false);
  });
});
