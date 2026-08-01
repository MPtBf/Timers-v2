import { TIMER } from "../constants";

export type TimerState = "stopped" | "running" | "paused";

export interface TimerCallbacks {
  onTick?: (remainingMs: number, elapsedMs: number) => void;
  onStateChange?: (state: TimerState) => void;
  onFinished?: () => void;
}

export class TimerModel {
  private _state: TimerState = "stopped";
  private _durationMs: number = 0;
  private _remainingMs: number = 0;
  private _elapsedMs: number = 0;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _lastTickTime: number = 0;
  private _callbacks: TimerCallbacks = {};
  private _hasFinished: boolean = false;

  get state(): TimerState {
    return this._state;
  }

  get remainingMs(): number {
    return this._remainingMs;
  }

  get elapsedMs(): number {
    return this._elapsedMs;
  }

  get durationMs(): number {
    return this._durationMs;
  }

  get isOvertime(): boolean {
    return this._remainingMs < 0;
  }

  get progress(): number {
    if (this._durationMs <= 0) return 0;
    if (this._remainingMs <= 0) return 1;
    return 1 - this._remainingMs / this._durationMs;
  }

  get formattedTime(): string {
    const abs = Math.abs(this._remainingMs);
    const totalSec = Math.floor(abs / 1000);
    const ms = Math.floor((abs % 1000) / 10);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const sign = this.isOvertime ? "-" : "";

    if (h > 0) {
      return `${sign}${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${sign}${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  }

  on(callbacks: TimerCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  off(): void {
    this._callbacks = {};
  }

  setDuration(minutes: number): void {
    if (this._state !== "stopped") return;
    this._durationMs = Math.max(0, Math.round(minutes * 60000));
    this._remainingMs = this._durationMs;
    this._elapsedMs = 0;
    this._hasFinished = false;
    this._emitTick();
  }

  start(): void {
    if (this._state !== "stopped" || this._durationMs <= 0) return;
    this._state = "running";
    this._remainingMs = this._durationMs;
    this._elapsedMs = 0;
    this._hasFinished = false;
    this._lastTickTime = performance.now();
    this._startInterval();
    this._emitTick();
    this._emitState();
  }

  pause(): void {
    if (this._state !== "running") return;
    this._state = "paused";
    this._stopInterval();
    this._emitTick();
    this._emitState();
  }

  resume(): void {
    if (this._state !== "paused") return;
    this._state = "running";
    this._lastTickTime = performance.now();
    this._startInterval();
    this._emitState();
  }

  stop(): void {
    if (this._state === "stopped") return;
    this._state = "stopped";
    this._stopInterval();
    this._remainingMs = this._durationMs;
    this._elapsedMs = 0;
    this._hasFinished = false;
    this._emitTick();
    this._emitState();
  }

  reset(): void {
    this.stop();
  }

  restore(durationMs: number, remainingMs: number, state: "stopped" | "running" | "paused"): void {
    this.stop();
    this._durationMs = Math.max(0, Math.round(durationMs));
    this._remainingMs = Math.round(remainingMs);
    this._elapsedMs = Math.max(0, this._durationMs - this._remainingMs);
    this._hasFinished = this._remainingMs <= 0;
    this._emitTick();
    if (state === "running") {
      this._state = "running";
      this._lastTickTime = performance.now();
      this._startInterval();
      this._emitState();
    } else if (state === "paused") {
      this._state = "paused";
      this._emitState();
    }
  }

  destroy(): void {
    this._stopInterval();
    this._callbacks = {};
  }

  private _startInterval(): void {
    this._stopInterval();
    this._intervalId = setInterval(() => this._tick(), TIMER.tickIntervalMs);
  }

  private _stopInterval(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  private _tick(): void {
    if (this._state !== "running") return;

    const now = performance.now();
    const dt = now - this._lastTickTime;
    this._lastTickTime = now;

    this._remainingMs -= dt;
    this._elapsedMs += dt;

    this._emitTick();

    if (!this._hasFinished && this._remainingMs <= 0) {
      this._hasFinished = true;
      this._callbacks.onFinished?.();
    }
  }

  private _emitTick(): void {
    this._callbacks.onTick?.(this._remainingMs, this._elapsedMs);
  }

  private _emitState(): void {
    this._callbacks.onStateChange?.(this._state);
  }
}
