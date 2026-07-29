import { describe, it, expect, beforeEach } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { setClickThrough, setOpacity, flashWindow, beepSystem } from "../ipc";

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

  it("rejects on unknown command", async () => {
    mockIPC((_cmd) => {
      throw new Error("unknown command");
    });
    await expect(setClickThrough(true)).rejects.toThrow("unknown command");
  });
});
