import { describe, it, expect } from "vitest";
import { isTimerLabel, timerIdFromLabel, timerLabel, HUB_LABEL } from "../windows";

describe("window label helpers", () => {
  it("identifies hub as non-timer", () => {
    expect(isTimerLabel(HUB_LABEL)).toBe(false);
    expect(timerIdFromLabel(HUB_LABEL)).toBeNull();
  });

  it("parses numeric timer id", () => {
    expect(isTimerLabel("timer-3")).toBe(true);
    expect(timerIdFromLabel("timer-3")).toBe(3);
  });

  it("rejects non-numeric suffix", () => {
    expect(timerIdFromLabel("timer-abc")).toBeNull();
  });

  it("rejects bare prefix", () => {
    expect(timerIdFromLabel("timer-")).toBeNull();
  });

  it("builds label from id", () => {
    expect(timerLabel(7)).toBe("timer-7");
  });
});
