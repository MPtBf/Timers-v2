import { describe, it, expect } from "vitest";
import { ActivityLogger, type LogOp } from "../activity-logger";

function openOps(ops: LogOp[]) {
  return ops.filter((o) => o.type === "open");
}

function closeOps(ops: LogOp[]) {
  return ops.filter((o) => o.type === "close");
}

describe("ActivityLogger", () => {
  it("begin opens a block for a non-empty name", () => {
    const l = new ActivityLogger();
    const ops = l.begin("Парсер", 1000);
    expect(ops).toEqual([{ type: "open", name: "Парсер", startMs: 1000 }]);
    expect(l.name).toBe("Парсер");
    expect(l.hasOpenBlock).toBe(true);
  });

  it("begin trims the name", () => {
    const l = new ActivityLogger();
    expect(l.begin("  Парсер  ", 1000)).toEqual([
      { type: "open", name: "Парсер", startMs: 1000 },
    ]);
  });

  it("begin with empty name opens nothing", () => {
    const l = new ActivityLogger();
    expect(l.begin("", 1000)).toEqual([]);
    expect(l.begin("   ", 1000)).toEqual([]);
    expect(l.hasOpenBlock).toBe(false);
  });

  it("begin with null name opens nothing", () => {
    const l = new ActivityLogger();
    expect(l.begin(null, 1000)).toEqual([]);
    expect(l.name).toBeNull();
  });

  it("begin closes a leftover open block before opening a new one", () => {
    const l = new ActivityLogger();
    l.begin("Парсер", 1000);
    const ops = l.begin("Почта", 2000);
    expect(closeOps(ops)).toEqual([{ type: "close", endMs: 2000 }]);
    expect(openOps(ops)).toEqual([{ type: "open", name: "Почта", startMs: 2000 }]);
    expect(l.name).toBe("Почта");
  });

  it("stop closes the open block and forgets the name", () => {
    const l = new ActivityLogger();
    l.begin("Парсер", 1000);
    expect(l.stop(9000)).toEqual([{ type: "close", endMs: 9000 }]);
    expect(l.hasOpenBlock).toBe(false);
    expect(l.name).toBeNull();
  });

  it("stop with nothing open returns no ops", () => {
    const l = new ActivityLogger();
    expect(l.stop(1000)).toEqual([]);
  });

  it("switchTo closes the old and opens the new", () => {
    const l = new ActivityLogger();
    l.begin("Парсер", 1000);
    const ops = l.switchTo("Почта", 5000);
    expect(closeOps(ops)).toEqual([{ type: "close", endMs: 5000 }]);
    expect(openOps(ops)).toEqual([{ type: "open", name: "Почта", startMs: 5000 }]);
  });

  it("switchTo with empty name only closes", () => {
    const l = new ActivityLogger();
    l.begin("Парсер", 1000);
    const ops = l.switchTo("", 5000);
    expect(ops).toEqual([{ type: "close", endMs: 5000 }]);
    expect(l.hasOpenBlock).toBe(false);
    expect(l.name).toBeNull();
  });

  it("restore rebuilds open state from a name", () => {
    const l = new ActivityLogger();
    l.restore("Парсер");
    expect(l.name).toBe("Парсер");
    expect(l.hasOpenBlock).toBe(true);
    expect(l.stop(2000)).toEqual([{ type: "close", endMs: 2000 }]);
  });

  it("restore with null leaves no open block", () => {
    const l = new ActivityLogger();
    l.restore(null);
    expect(l.hasOpenBlock).toBe(false);
  });
});
