import type { BlockKind } from "./activity";

export interface LogBlock {
  id: number | null;
  activityId: number | null;
  kind: BlockKind;
  startMs: number;
  endMs: number | null;
  timerLabel: string;
}

export type LogOp =
  | { type: "open"; block: LogBlock }
  | { type: "close"; timerLabel: string; endMs: number }
  | {
      type: "finish";
      activityId: number;
      efficiency: number | null;
      usefulness: number | null;
      endedMs: number;
    };

export class ActivityLogger {
  private _timerLabel: string;
  private _logEnabled: boolean;
  private _activityId: number | null = null;
  private _openKind: BlockKind | null = null;

  constructor(timerLabel: string, logEnabled = true) {
    this._timerLabel = timerLabel;
    this._logEnabled = logEnabled;
  }

  get timerLabel(): string {
    return this._timerLabel;
  }

  get logEnabled(): boolean {
    return this._logEnabled;
  }

  get activityId(): number | null {
    return this._activityId;
  }

  get openKind(): BlockKind | null {
    return this._openKind;
  }

  get hasOpenBlock(): boolean {
    return this._openKind !== null;
  }

  setLogEnabled(enabled: boolean): void {
    this._logEnabled = enabled;
  }

  restore(activityId: number | null, openKind: BlockKind | null): void {
    this._activityId = activityId;
    this._openKind = openKind;
  }

  start(activityId: number | null, startMs: number): LogOp[] {
    if (!this._logEnabled || activityId === null || this._openKind !== null) return [];
    this._activityId = activityId;
    this._openKind = "work";
    return [{ type: "open", block: this._block(activityId, "work", startMs, null) }];
  }

  begin(activityId: number | null, startMs: number): LogOp[] {
    const ops: LogOp[] = [];
    if (this._openKind !== null) {
      ops.push({ type: "close", timerLabel: this._timerLabel, endMs: startMs });
      this._openKind = null;
    }
    if (this._logEnabled && activityId !== null) {
      this._activityId = activityId;
      this._openKind = "work";
      ops.push({ type: "open", block: this._block(activityId, "work", startMs, null) });
    } else {
      this._activityId = null;
    }
    return ops;
  }

  pause(nowMs: number, kind: BlockKind = "break"): LogOp[] {
    if (this._openKind !== "work") return [];
    this._openKind = kind;
    return [
      { type: "close", timerLabel: this._timerLabel, endMs: nowMs },
      { type: "open", block: this._block(null, kind, nowMs, null) },
    ];
  }

  resume(nowMs: number): LogOp[] {
    if (this._openKind !== "break" && this._openKind !== "away") return [];
    if (this._activityId === null) return [];
    this._openKind = "work";
    return [
      { type: "close", timerLabel: this._timerLabel, endMs: nowMs },
      { type: "open", block: this._block(this._activityId, "work", nowMs, null) },
    ];
  }

  stop(nowMs: number): LogOp[] {
    if (this._openKind === null) return [];
    this._openKind = null;
    return [{ type: "close", timerLabel: this._timerLabel, endMs: nowMs }];
  }

  finish(
    efficiency: number | null,
    usefulness: number | null,
    endedMs: number
  ): LogOp[] {
    const ops: LogOp[] = [];
    if (this._openKind !== null) {
      ops.push({ type: "close", timerLabel: this._timerLabel, endMs: endedMs });
      this._openKind = null;
    }
    if (this._activityId !== null) {
      ops.push({
        type: "finish",
        activityId: this._activityId,
        efficiency,
        usefulness,
        endedMs,
      });
      this._activityId = null;
    }
    return ops;
  }

  private _block(
    activityId: number | null,
    kind: BlockKind,
    startMs: number,
    endMs: number | null
  ): LogBlock {
    return { id: null, activityId, kind, startMs, endMs, timerLabel: this._timerLabel };
  }
}
