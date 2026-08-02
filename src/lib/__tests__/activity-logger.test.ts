import { describe, it, expect } from "vitest";
import { ActivityLogger, type LogOp } from "../activity-logger";

function closeOps(ops: LogOp[]) {
  return ops.filter((o) => o.type === "close");
}

function openOps(ops: LogOp[]) {
  return ops.filter((o) => o.type === "open");
}

function finishOps(ops: LogOp[]) {
  return ops.filter((o) => o.type === "finish");
}

describe("ActivityLogger", () => {
  it("start opens a work block for an activity", () => {
    const l = new ActivityLogger("timer-1");
    const ops = l.start(7, 1000);
    expect(ops).toHaveLength(1);
    expect(openOps(ops)[0]).toEqual({
      type: "open",
      block: { id: null, activityId: 7, kind: "work", startMs: 1000, endMs: null, timerLabel: "timer-1" },
    });
    expect(l.activityId).toBe(7);
    expect(l.openKind).toBe("work");
  });

  it("start does nothing when logging is disabled", () => {
    const l = new ActivityLogger("timer-1", false);
    expect(l.start(7, 1000)).toEqual([]);
    expect(l.activityId).toBeNull();
    expect(l.openKind).toBeNull();
  });

  it("start does nothing without an activity id", () => {
    const l = new ActivityLogger("timer-1");
    expect(l.start(null, 1000)).toEqual([]);
  });

  it("start twice does not open a second block", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    expect(l.start(7, 2000)).toEqual([]);
    expect(l.openKind).toBe("work");
  });

  it("pause closes the work block and opens a break", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    const ops = l.pause(5000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 5000 }]);
    expect(openOps(ops)[0].block).toMatchObject({
      activityId: null,
      kind: "break",
      startMs: 5000,
      timerLabel: "timer-1",
    });
    expect(l.openKind).toBe("break");
  });

  it("pause with kind away opens an away block", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    const ops = l.pause(5000, "away");
    expect(openOps(ops)[0].block).toMatchObject({ kind: "away", startMs: 5000 });
    expect(l.openKind).toBe("away");
  });

  it("pause when nothing is open returns no ops", () => {
    const l = new ActivityLogger("timer-1");
    expect(l.pause(1000)).toEqual([]);
  });

  it("pause when already paused returns no ops", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    l.pause(2000);
    expect(l.pause(3000)).toEqual([]);
  });

  it("resume closes the break and reopens the same activity", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    l.pause(5000);
    const ops = l.resume(8000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 8000 }]);
    expect(openOps(ops)[0].block).toMatchObject({ activityId: 7, kind: "work", startMs: 8000 });
    expect(l.openKind).toBe("work");
  });

  it("resume from an away block reopens the activity", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    l.pause(5000, "away");
    l.resume(9000);
    expect(l.openKind).toBe("work");
  });

  it("resume without an open break returns no ops", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    expect(l.resume(2000)).toEqual([]);
  });

  it("stop closes the open block and keeps the activity", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    const ops = l.stop(9000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 9000 }]);
    expect(l.openKind).toBeNull();
    expect(l.activityId).toBe(7);
  });

  it("stop with nothing open returns no ops", () => {
    const l = new ActivityLogger("timer-1");
    expect(l.stop(1000)).toEqual([]);
  });

  it("finish closes the open block and emits one finish op", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    const ops = l.finish(80, 60, 10000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 10000 }]);
    expect(finishOps(ops)).toEqual([
      { type: "finish", activityId: 7, efficiency: 80, usefulness: 60, endedMs: 10000 },
    ]);
    expect(l.activityId).toBeNull();
    expect(l.openKind).toBeNull();
  });

  it("finish while paused closes the break and finishes the activity", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    l.pause(5000);
    const ops = l.finish(50, 50, 6000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 6000 }]);
    expect(finishOps(ops)).toHaveLength(1);
  });

  it("finish without an open block emits only the finish op", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    l.stop(2000);
    const ops = l.finish(10, 20, 3000);
    expect(closeOps(ops)).toEqual([]);
    expect(finishOps(ops)).toHaveLength(1);
  });

  it("finish with logging off returns no ops", () => {
    const l = new ActivityLogger("timer-1", false);
    expect(l.finish(50, 50, 1000)).toEqual([]);
  });

  it("restore sets activity and open kind", () => {
    const l = new ActivityLogger("timer-1");
    l.restore(7, "work");
    expect(l.activityId).toBe(7);
    expect(l.openKind).toBe("work");
    const ops = l.stop(2000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 2000 }]);
  });

  it("begin opens a fresh work block and binds the activity", () => {
    const l = new ActivityLogger("timer-1");
    const ops = l.begin(7, 1000);
    expect(ops).toHaveLength(1);
    expect(openOps(ops)[0].block).toMatchObject({ activityId: 7, kind: "work", startMs: 1000 });
    expect(l.activityId).toBe(7);
    expect(l.openKind).toBe("work");
  });

  it("begin with logging off clears activity and opens nothing", () => {
    const l = new ActivityLogger("timer-1", false);
    const ops = l.begin(7, 1000);
    expect(ops).toEqual([]);
    expect(l.activityId).toBeNull();
    expect(l.openKind).toBeNull();
  });

  it("begin without activity id clears a stale binding", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    l.stop(2000);
    expect(l.activityId).toBe(7);
    const ops = l.begin(null, 3000);
    expect(ops).toEqual([]);
    expect(l.activityId).toBeNull();
    expect(l.openKind).toBeNull();
  });

  it("begin closes a leftover open block before opening the new work", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    const ops = l.begin(8, 2000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 2000 }]);
    expect(openOps(ops)[0].block).toMatchObject({ activityId: 8, kind: "work", startMs: 2000 });
    expect(l.activityId).toBe(8);
    expect(l.openKind).toBe("work");
  });

  it("begin closes a leftover open block when logging off", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    l.setLogEnabled(false);
    const ops = l.begin(null, 2000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 2000 }]);
    expect(l.activityId).toBeNull();
    expect(l.openKind).toBeNull();
  });

  it("begin closes a leftover break block and keeps activity cleared", () => {
    const l = new ActivityLogger("timer-1");
    l.start(7, 1000);
    l.pause(2000);
    expect(l.openKind).toBe("break");
    const ops = l.begin(null, 3000);
    expect(closeOps(ops)).toEqual([{ type: "close", timerLabel: "timer-1", endMs: 3000 }]);
    expect(l.openKind).toBeNull();
  });
});
