import { describe, it, expect } from "vitest";
import { executeOps, type LogRunner } from "../logger-runner";
import type { LogOp, LogBlock } from "../activity-logger";

function recordingRunner(): { calls: string[]; runner: LogRunner; fail: (on: "open" | "close" | "finish") => void } {
  const calls: string[] = [];
  let failOn: "open" | "close" | "finish" | null = null;
  const fail = (on: "open" | "close" | "finish") => { failOn = on; };
  const runner: LogRunner = {
    openBlock: async (b) => {
      if (failOn === "open") throw new Error("open failed");
      calls.push(`open:${b.kind}:${b.timerLabel}:${b.activityId}`);
      return 1;
    },
    closeBlock: async (label, endMs) => {
      if (failOn === "close") throw new Error("close failed");
      calls.push(`close:${label}:${endMs}`);
      return null;
    },
    finish: async (id, eff, use, endMs) => {
      if (failOn === "finish") throw new Error("finish failed");
      calls.push(`finish:${id}:${eff}:${use}:${endMs}`);
    },
  };
  return { calls, runner, fail };
}

const block = (over: Partial<LogBlock> = {}): LogBlock => ({
  id: null,
  activityId: 5,
  kind: "work",
  startMs: 1000,
  endMs: null,
  timerLabel: "timer-1",
  ...over,
});

describe("executeOps", () => {
  it("executes nothing for empty ops", async () => {
    const { calls, runner } = recordingRunner();
    await executeOps([], runner);
    expect(calls).toEqual([]);
  });

  it("opens a block", async () => {
    const { calls, runner } = recordingRunner();
    await executeOps([{ type: "open", block: block() }], runner);
    expect(calls).toEqual(["open:work:timer-1:5"]);
  });

  it("closes a block", async () => {
    const { calls, runner } = recordingRunner();
    await executeOps([{ type: "close", timerLabel: "timer-1", endMs: 2000 }], runner);
    expect(calls).toEqual(["close:timer-1:2000"]);
  });

  it("finishes an activity", async () => {
    const { calls, runner } = recordingRunner();
    await executeOps([{ type: "finish", activityId: 5, efficiency: 80, usefulness: 90, endedMs: 2000 }], runner);
    expect(calls).toEqual(["finish:5:80:90:2000"]);
  });

  it("finishes with null ratings", async () => {
    const { calls, runner } = recordingRunner();
    await executeOps([{ type: "finish", activityId: 5, efficiency: null, usefulness: null, endedMs: 2000 }], runner);
    expect(calls).toEqual(["finish:5:null:null:2000"]);
  });

  it("preserves order of a mixed sequence", async () => {
    const { calls, runner } = recordingRunner();
    const ops: LogOp[] = [
      { type: "open", block: block({ activityId: 5 }) },
      { type: "close", timerLabel: "timer-1", endMs: 2000 },
      { type: "open", block: block({ kind: "break", activityId: null, startMs: 2000 }) },
      { type: "close", timerLabel: "timer-1", endMs: 3000 },
      { type: "open", block: block({ kind: "work", activityId: 5, startMs: 3000 }) },
      { type: "finish", activityId: 5, efficiency: 80, usefulness: 90, endedMs: 4000 },
    ];
    await executeOps(ops, runner);
    expect(calls).toEqual([
      "open:work:timer-1:5",
      "close:timer-1:2000",
      "open:break:timer-1:null",
      "close:timer-1:3000",
      "open:work:timer-1:5",
      "finish:5:80:90:4000",
    ]);
  });

  it("propagates an open error", async () => {
    const { runner, fail } = recordingRunner();
    fail("open");
    await expect(executeOps([{ type: "open", block: block() }], runner)).rejects.toThrow("open failed");
  });

  it("propagates a close error", async () => {
    const { runner, fail } = recordingRunner();
    fail("close");
    await expect(executeOps([{ type: "close", timerLabel: "timer-1", endMs: 2000 }], runner)).rejects.toThrow("close failed");
  });

  it("propagates a finish error", async () => {
    const { runner, fail } = recordingRunner();
    fail("finish");
    await expect(executeOps([{ type: "finish", activityId: 5, efficiency: 80, usefulness: 90, endedMs: 2000 }], runner)).rejects.toThrow("finish failed");
  });
});
