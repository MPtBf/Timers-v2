import { describe, it, expect } from "vitest";
import { computeInteractionMode, getInteractionAction } from "../interaction";

describe("computeInteractionMode", () => {
  it("returns auto when mouse is not over", () => {
    expect(computeInteractionMode({ ctrlHeld: false, shiftHeld: false, mouseOver: false })).toBe("auto");
    expect(computeInteractionMode({ ctrlHeld: true, shiftHeld: false, mouseOver: false })).toBe("auto");
    expect(computeInteractionMode({ ctrlHeld: false, shiftHeld: true, mouseOver: false })).toBe("auto");
    expect(computeInteractionMode({ ctrlHeld: true, shiftHeld: true, mouseOver: false })).toBe("auto");
  });

  it("returns auto when mouse over without modifiers", () => {
    expect(computeInteractionMode({ ctrlHeld: false, shiftHeld: false, mouseOver: true })).toBe("auto");
  });

  it("returns interactive when mouse over with Ctrl", () => {
    expect(computeInteractionMode({ ctrlHeld: true, shiftHeld: false, mouseOver: true })).toBe("interactive");
  });

  it("returns hidden when mouse over with Shift", () => {
    expect(computeInteractionMode({ ctrlHeld: false, shiftHeld: true, mouseOver: true })).toBe("hidden");
  });

  it("Shift overrides Ctrl when both held", () => {
    expect(computeInteractionMode({ ctrlHeld: true, shiftHeld: true, mouseOver: true })).toBe("hidden");
  });
});

describe("getInteractionAction", () => {
  it("auto: 0.5 opacity, click-through enabled", () => {
    expect(getInteractionAction("auto")).toEqual({ opacity: 0.5, clickThrough: true });
  });

  it("interactive: 1.0 opacity, click-through disabled", () => {
    expect(getInteractionAction("interactive")).toEqual({ opacity: 1.0, clickThrough: false });
  });

  it("hidden: 0.0 opacity, click-through enabled", () => {
    expect(getInteractionAction("hidden")).toEqual({ opacity: 0.0, clickThrough: true });
  });
});
