import { describe, it, expect, beforeEach } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import {
  setClickThrough, setOpacity, flashWindow, beepSystem,
  createTimerWindow, saveSession, hideTimers, closeTimer,
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
    await saveSession('{"version":1}');
    expect(calls[0]).toEqual(["save_session", { json: '{"version":1}' }]);
  });

  it("hideTimers sends command with no args", async () => {
    await hideTimers();
    expect(calls[0][0]).toBe("hide_timers");
  });

  it("closeTimer sends id", async () => {
    await closeTimer(4);
    expect(calls[0]).toEqual(["close_timer", { id: 4 }]);
  });

  it("rejects on unknown command", async () => {
    mockIPC((_cmd) => {
      throw new Error("unknown command");
    });
    await expect(setClickThrough(true)).rejects.toThrow("unknown command");
  });
});
