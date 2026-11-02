import { describe, it, expect } from "vitest";
import { executeOps, type LogRunner } from "../logger-runner";
import type { LogOp } from "../activity-logger";

function recordingRunner(): { calls: string[]; runner: LogRunner; fail: (on: "open" | "close") => void } {
  const calls: string[] = [];
  let failOn: "open" | "close" | null = null;
  const fail = (on: "open" | "close") => { failOn = on; };
  const runner: LogRunner = {
    open: async (name, startMs) => {
      if (failOn === "open") throw new Error("open failed");
      calls.push(`open:${name}:${startMs}`);
      return 1;
    },
    close: async (endMs) => {
      if (failOn === "close") throw new Error("close failed");
      calls.push(`close:${endMs}`);
      return null;
    },
  };
  return { calls, runner, fail };
}

describe("executeOps", () => {
  it("executes nothing for empty ops", async () => {
    const { calls, runner } = recordingRunner();
    await executeOps([], runner);
    expect(calls).toEqual([]);
  });

  it("opens a block", async () => {
    const { calls, runner } = recordingRunner();
    await executeOps([{ type: "open", name: "Парсер", startMs: 1000 }], runner);
    expect(calls).toEqual(["open:Парсер:1000"]);
  });

  it("closes a block", async () => {
    const { calls, runner } = recordingRunner();
    await executeOps([{ type: "close", endMs: 2000 }], runner);
    expect(calls).toEqual(["close:2000"]);
  });

  it("preserves order of a mixed sequence", async () => {
    const { calls, runner } = recordingRunner();
    const ops: LogOp[] = [
      { type: "open", name: "Парсер", startMs: 1000 },
      { type: "close", endMs: 2000 },
      { type: "open", name: "Почта", startMs: 3000 },
      { type: "close", endMs: 4000 },
    ];
    await executeOps(ops, runner);
    expect(calls).toEqual([
      "open:Парсер:1000",
      "close:2000",
      "open:Почта:3000",
      "close:4000",
    ]);
  });

  it("propagates an open error", async () => {
    const { runner, fail } = recordingRunner();
    fail("open");
    await expect(executeOps([{ type: "open", name: "Парсер", startMs: 1000 }], runner)).rejects.toThrow("open failed");
  });

  it("propagates a close error", async () => {
    const { runner, fail } = recordingRunner();
    fail("close");
    await expect(executeOps([{ type: "close", endMs: 2000 }], runner)).rejects.toThrow("close failed");
  });
});
