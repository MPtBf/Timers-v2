import { describe, it, expect, beforeEach } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import {
  setClickThrough, setOpacity, flashWindow, beepSystem,
  createTimerWindow, saveSession, hideTimers, closeTimer,
  activityInit, blockOpen, blockClose, blockDelete, blockUpdate,
  blockQuery, blockSuggestions, activityReconcile, createDashboardWindow,
} from "../ipc";
import type { TimerSnapshot } from "../session";

describe("IPC wrappers", () => {
  let calls: Array<[string, unknown]>;

  beforeEach(() => {
    calls = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return null;
    });
  });

  it("setClickThrough sends enabled=true", async () => {
    await setClickThrough(true);
    expect(calls[0]).toEqual(["set_click_through", { enabled: true }]);
  });

  it("setClickThrough sends enabled=false", async () => {
    await setClickThrough(false);
    expect(calls[0]).toEqual(["set_click_through", { enabled: false }]);
  });

  it("setOpacity sends opacity value", async () => {
    await setOpacity(0.5);
    expect(calls[0]).toEqual(["set_opacity", { opacity: 0.5 }]);
  });

  it("flashWindow sends command with no args", async () => {
    await flashWindow();
    expect(calls[0][0]).toBe("flash_window");
  });

  it("beepSystem sends command with no args", async () => {
    await beepSystem();
    expect(calls[0][0]).toBe("beep_system");
  });

  it("createTimerWindow sends snapshot payload", async () => {
    const snapshot: TimerSnapshot = {
      id: 1,
      durationMs: 300000,
      remainingMs: 300000,
      state: "stopped",
      soundOn: true,
      pinned: false,
      x: 10,
      y: 20,
      w: 95,
      h: 96,
    };
    await createTimerWindow(snapshot);
    expect(calls[0]).toEqual(["create_timer_window", { snapshot }]);
  });

  it("saveSession sends json string", async () => {
    await saveSession('{"version":2}');
    expect(calls[0]).toEqual(["save_session", { json: '{"version":2}' }]);
  });

  it("hideTimers sends command with no args", async () => {
    await hideTimers();
    expect(calls[0][0]).toBe("hide_timers");
  });

  it("closeTimer sends id", async () => {
    await closeTimer(4);
    expect(calls[0]).toEqual(["close_timer", { id: 4 }]);
  });

  it("activityInit sends command with no args", async () => {
    await activityInit();
    expect(calls[0][0]).toBe("activity_init");
  });

  it("blockOpen sends name and startMs", async () => {
    await blockOpen("Парсер", 1000);
    expect(calls[0]).toEqual(["block_open", { name: "Парсер", startMs: 1000, endMs: null }]);
  });

  it("blockOpen sends endMs when a closed block is created", async () => {
    await blockOpen("Еда", 1000, 2000);
    expect(calls[0]).toEqual(["block_open", { name: "Еда", startMs: 1000, endMs: 2000 }]);
  });

  it("blockClose sends endMs only", async () => {
    await blockClose(5000);
    expect(calls[0]).toEqual(["block_close", { endMs: 5000 }]);
  });

  it("blockDelete sends id", async () => {
    await blockDelete(7);
    expect(calls[0]).toEqual(["block_delete", { id: 7 }]);
  });

  it("blockUpdate sends id, name, startMs, endMs", async () => {
    await blockUpdate(7, "Парсер", 1000, 2000);
    expect(calls[0]).toEqual(["block_update", { id: 7, name: "Парсер", startMs: 1000, endMs: 2000 }]);
  });

  it("blockUpdate sends null endMs for open block", async () => {
    await blockUpdate(7, "Парсер", 1000, null);
    expect(calls[0]).toEqual(["block_update", { id: 7, name: "Парсер", startMs: 1000, endMs: null }]);
  });

  it("blockQuery sends range", async () => {
    await blockQuery(0, 100000);
    expect(calls[0]).toEqual(["block_query", { fromMs: 0, toMs: 100000 }]);
  });

  it("blockSuggestions sends command with no args", async () => {
    await blockSuggestions();
    expect(calls[0][0]).toBe("block_suggestions");
  });

  it("activityReconcile sends command with no args", async () => {
    await activityReconcile();
    expect(calls[0][0]).toBe("activity_reconcile");
  });

  it("createDashboardWindow sends command with no args", async () => {
    await createDashboardWindow();
    expect(calls[0][0]).toBe("create_dashboard_window");
  });

  it("block commands never carry legacy fields", async () => {
    await blockOpen("Парсер", 1000);
    await blockClose(2000);
    await blockUpdate(1, "Парсер", 1000, 2000);
    for (const [, args] of calls) {
      const a = args as Record<string, unknown>;
      expect(a).not.toHaveProperty("timerLabel");
      expect(a).not.toHaveProperty("activityId");
      expect(a).not.toHaveProperty("kind");
      expect(a).not.toHaveProperty("category");
    }
  });

  it("rejects on unknown command", async () => {
    mockIPC((_cmd) => {
      throw new Error("unknown command");
    });
    await expect(setClickThrough(true)).rejects.toThrow("unknown command");
  });
});

