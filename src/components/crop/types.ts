import type { CropStageState } from "../../lib/crop/stamps";

/**
 * Pipeline state. `consent` sits between `ready` and `removing`: the
 * first-run model download never starts until the visitor confirms it
 * (spec 0009 §6), and the run token lets them abort it.
 */
export type Stage = "idle" | "ready" | "consent" | "removing" | "removed";

/** Bench spine: exactly one working stage is open; the others rest as stamped rows. */
export type BenchStageId = "source" | "frame" | "export";

/** Exported square in natural image pixels; the fixed frame samples it. */
export interface CropBox {
  x: number;
  y: number;
  size: number;
}

export interface CropError {
  stage: BenchStageId;
  message: string;
}

/** Which half of the removal pipeline is running (mirrors `RemovalProgress.phase`). */
export type RemovalPhase = "download" | "process";

export interface StageStateResult {
  state: CropStageState;
  label: string;
}
