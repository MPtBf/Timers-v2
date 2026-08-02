import type { LogOp, LogBlock } from "./activity-logger";
import {
  activityOpenBlock,
  activityCloseBlock,
  activityFinish,
} from "./ipc";

export interface LogRunner {
  openBlock(block: LogBlock): Promise<number>;
  closeBlock(timerLabel: string, endMs: number): Promise<number | null>;
  finish(
    activityId: number,
    efficiency: number | null,
    usefulness: number | null,
    endedMs: number
  ): Promise<void>;
}

export const ipcLogRunner: LogRunner = {
  openBlock: (block) =>
    activityOpenBlock({
      id: null,
      timerLabel: block.timerLabel,
      activityId: block.activityId,
      kind: block.kind,
      startMs: block.startMs,
      endMs: null,
    }),
  closeBlock: (timerLabel, endMs) => activityCloseBlock(timerLabel, endMs),
  finish: (activityId, efficiency, usefulness, endedMs) =>
    activityFinish(activityId, efficiency, usefulness, endedMs),
};

export async function executeOps(ops: LogOp[], runner: LogRunner): Promise<void> {
  for (const op of ops) {
    switch (op.type) {
      case "open":
        await runner.openBlock(op.block);
        break;
      case "close":
        await runner.closeBlock(op.timerLabel, op.endMs);
        break;
      case "finish":
        await runner.finish(op.activityId, op.efficiency, op.usefulness, op.endedMs);
        break;
    }
  }
}
