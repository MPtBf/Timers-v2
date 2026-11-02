export type LogOp =
  | { type: "open"; name: string; startMs: number }
  | { type: "close"; endMs: number };

/**
 * Pure block-flow planner. Tracks the current task name and whether a block is
 * open. Produces a minimal sequence of open/close operations; never emits
 * activity ids, block kinds, timer labels, or finish operations.
 */
export class ActivityLogger {
  private _name: string | null = null;
  private _open: boolean = false;

  get name(): string | null {
    return this._name;
  }

  get hasOpenBlock(): boolean {
    return this._open;
  }

  restore(name: string | null): void {
    this._name = name ? name.trim() || null : null;
    this._open = this._name !== null;
  }

  /** Begin logging a task. Closes a leftover open block first if needed. */
  begin(name: string | null, startMs: number): LogOp[] {
    const ops: LogOp[] = [];
    if (this._open) {
      ops.push({ type: "close", endMs: startMs });
      this._open = false;
    }
    const trimmed = name ? name.trim() || null : null;
    this._name = trimmed;
    if (trimmed !== null) {
      this._open = true;
      ops.push({ type: "open", name: trimmed, startMs });
    }
    return ops;
  }

  /** Close the current block and forget the name. */
  stop(nowMs: number): LogOp[] {
    if (!this._open) {
      this._name = null;
      return [];
    }
    this._open = false;
    this._name = null;
    return [{ type: "close", endMs: nowMs }];
  }

  /** Swap the running task: close the current block and open a new one. */
  switchTo(name: string | null, nowMs: number): LogOp[] {
    const ops: LogOp[] = [];
    if (this._open) {
      ops.push({ type: "close", endMs: nowMs });
      this._open = false;
    }
    const trimmed = name ? name.trim() || null : null;
    this._name = trimmed;
    if (trimmed !== null) {
      this._open = true;
      ops.push({ type: "open", name: trimmed, startMs: nowMs });
    }
    return ops;
  }
}
