import type { LogOp } from "./activity-logger";
import { blockOpen, blockClose } from "./ipc";

export interface LogRunner {
  open(name: string, startMs: number): Promise<number>;
  close(endMs: number): Promise<number | null>;
}

export const ipcLogRunner: LogRunner = {
  open: (name, startMs) => blockOpen(name, startMs),
  close: (endMs) => blockClose(endMs),
};

export async function executeOps(ops: LogOp[], runner: LogRunner): Promise<void> {
  for (const op of ops) {
    switch (op.type) {
      case "open":
        await runner.open(op.name, op.startMs);
        break;
      case "close":
        await runner.close(op.endMs);
        break;
    }
  }
}
