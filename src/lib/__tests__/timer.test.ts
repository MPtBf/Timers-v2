import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimerModel } from "../timer.svelte";

describe("TimerModel", () => {
  let timer: TimerModel;
  let now: number;

  beforeEach(() => {
    now = 0;
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    timer = new TimerModel();
  });

  afterEach(() => {
    timer.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function advanceTime(ms: number) {
    now += ms;
    vi.advanceTimersByTime(ms);
  }

  describe("initial state", () => {
    it("starts in stopped state", () => {
      expect(timer.state).toBe("stopped");
    });

    it("has zero remaining and elapsed time", () => {
      expect(timer.remainingMs).toBe(0);
      expect(timer.elapsedMs).toBe(0);
      expect(timer.durationMs).toBe(0);
    });

    it("is not in overtime", () => {
      expect(timer.isOvertime).toBe(false);
    });

    it("has zero progress", () => {
      expect(timer.progress).toBe(0);
    });

    it("displays 0:00.00", () => {
      expect(timer.formattedTime).toBe("0:00.00");
    });
  });

  describe("setDuration", () => {
    it("sets duration in stopped state", () => {
      timer.setDuration(5);
      expect(timer.durationMs).toBe(300000);
      expect(timer.remainingMs).toBe(300000);
    });

    it("does nothing when running", () => {
      timer.setDuration(5);
      timer.start();
      timer.setDuration(10);
      expect(timer.durationMs).toBe(300000);
    });

    it("rejects zero or negative values", () => {
      timer.setDuration(0);
      expect(timer.durationMs).toBe(0);
      timer.setDuration(-5);
      expect(timer.durationMs).toBe(0);
    });
  });

  describe("start", () => {
    it("transitions to running", () => {
      timer.setDuration(5);
      timer.start();
      expect(timer.state).toBe("running");
    });

    it("does not start with zero duration", () => {
      timer.start();
      expect(timer.state).toBe("stopped");
    });

    it("does not start if already running", () => {
      timer.setDuration(5);
      timer.start();
      timer.start();
      expect(timer.state).toBe("running");
    });
  });

  describe("pause and resume", () => {
    it("pauses from running state", () => {
      timer.setDuration(5);
      timer.start();
      timer.pause();
      expect(timer.state).toBe("paused");
    });

    it("does not pause from stopped state", () => {
      timer.pause();
      expect(timer.state).toBe("stopped");
    });

    it("resumes from paused state", () => {
      timer.setDuration(5);
      timer.start();
      timer.pause();
      timer.resume();
      expect(timer.state).toBe("running");
    });
  });

  describe("stop", () => {
    it("stops from running state and resets time", () => {
      timer.setDuration(5);
      timer.start();
      advanceTime(2000);
      timer.stop();
      expect(timer.state).toBe("stopped");
      expect(timer.remainingMs).toBe(300000);
      expect(timer.elapsedMs).toBe(0);
    });

    it("stops from paused state", () => {
      timer.setDuration(5);
      timer.start();
      timer.pause();
      timer.stop();
      expect(timer.state).toBe("stopped");
    });
  });

  describe("progress", () => {
    it("is 0 at start", () => {
      timer.setDuration(60);
      expect(timer.progress).toBe(0);
    });

    it("increases over time", () => {
      timer.setDuration(1);
      timer.start();
      advanceTime(30000);
      expect(timer.progress).toBeCloseTo(0.5, 1);
    });

    it("is 1 at finish and in overtime", () => {
      timer.setDuration(1 / 60);
      timer.start();
      advanceTime(2000);
      expect(timer.progress).toBe(1);
    });
  });

  describe("overtime", () => {
    it("enters overtime when remaining reaches zero", () => {
      timer.setDuration(1 / 60);
      timer.start();
      advanceTime(1500);
      expect(timer.isOvertime).toBe(true);
      expect(timer.remainingMs).toBeLessThan(0);
      expect(timer.progress).toBe(1);
    });

    it("keeps counting negatively in overtime", () => {
      timer.setDuration(1 / 60);
      timer.start();
      advanceTime(2000);
      const r1 = timer.remainingMs;
      advanceTime(1000);
      expect(timer.remainingMs).toBeLessThan(r1);
    });

    it("displays negative time string", () => {
      timer.setDuration(1 / 60);
      timer.start();
      advanceTime(2000);
      expect(timer.formattedTime.startsWith("-")).toBe(true);
    });
  });

  describe("callbacks", () => {
    it("calls onTick during running", () => {
      const onTick = vi.fn();
      timer.on({ onTick });
      timer.setDuration(5);
      timer.start();
      advanceTime(100);
      expect(onTick).toHaveBeenCalled();
    });

    it("calls onStateChange on state transitions", () => {
      const onStateChange = vi.fn();
      timer.on({ onStateChange });
      timer.setDuration(5);

      timer.start();
      expect(onStateChange).toHaveBeenCalledWith("running");

      timer.pause();
      expect(onStateChange).toHaveBeenCalledWith("paused");

      timer.resume();
      expect(onStateChange).toHaveBeenCalledWith("running");

      timer.stop();
      expect(onStateChange).toHaveBeenCalledWith("stopped");
    });

    it("calls onFinished when timer reaches zero", () => {
      const onFinished = vi.fn();
      timer.on({ onFinished });
      timer.setDuration(1 / 60);
      timer.start();
      advanceTime(1500);
      expect(onFinished).toHaveBeenCalled();
    });

    it("does not call onFinished multiple times", () => {
      const onFinished = vi.fn();
      timer.on({ onFinished });
      timer.setDuration(1 / 60);
      timer.start();
      advanceTime(5000);
      expect(onFinished).toHaveBeenCalledTimes(1);
    });
  });

  describe("formattedTime", () => {
    it("formats minutes and seconds", () => {
      timer.setDuration(5.5);
      expect(timer.formattedTime).toBe("5:30.00");
    });

    it("formats hours when duration >= 60 minutes", () => {
      timer.setDuration(90);
      expect(timer.formattedTime).toBe("1:30:00");
    });

    it("shows negative sign in overtime", () => {
      timer.setDuration(1 / 60);
      timer.start();
      advanceTime(2000);
      expect(timer.formattedTime).toMatch(/^-/);
    });

    it("updates time display while running", () => {
      timer.setDuration(1);
      timer.start();
      advanceTime(500);
      const after = timer.formattedTime;
      expect(after).not.toBe("1:00.00");
    });
  });

  describe("reset", () => {
    it("resets to initial state", () => {
      timer.setDuration(5);
      timer.start();
      advanceTime(2000);
      timer.reset();
      expect(timer.state).toBe("stopped");
      expect(timer.remainingMs).toBe(300000);
      expect(timer.elapsedMs).toBe(0);
    });
  });

  describe("restore", () => {
    it("restores stopped state with duration and remaining", () => {
      timer.restore(300000, 180000, "stopped");
      expect(timer.durationMs).toBe(300000);
      expect(timer.remainingMs).toBe(180000);
      expect(timer.elapsedMs).toBe(120000);
      expect(timer.state).toBe("stopped");
    });

    it("restores running state and starts ticking", () => {
      timer.restore(300000, 180000, "running");
      expect(timer.state).toBe("running");
      const before = timer.remainingMs;
      advanceTime(1000);
      expect(timer.remainingMs).toBeLessThan(before);
    });

    it("restores paused state without ticking", () => {
      timer.restore(300000, 180000, "paused");
      expect(timer.state).toBe("paused");
      const before = timer.remainingMs;
      advanceTime(1000);
      expect(timer.remainingMs).toBe(before);
    });

    it("marks finished when restored with non-positive remaining", () => {
      const onFinished = vi.fn();
      timer.on({ onFinished });
      timer.restore(300000, -5000, "running");
      expect(timer.isOvertime).toBe(true);
      advanceTime(1000);
      expect(onFinished).not.toHaveBeenCalled();
    });

    it("clamps negative elapsed time", () => {
      timer.restore(300000, 400000, "stopped");
      expect(timer.elapsedMs).toBe(0);
    });

    it("clamps non-positive duration to zero", () => {
      timer.restore(-100, 0, "stopped");
      expect(timer.durationMs).toBe(0);
    });
  });

  describe("off", () => {
    it("clears all callbacks", () => {
      const onTick = vi.fn();
      timer.on({ onTick });
      timer.off();
      timer.setDuration(5);
      timer.start();
      advanceTime(100);
      expect(onTick).not.toHaveBeenCalled();
    });
  });
});
