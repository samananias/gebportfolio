import type { StageStateResult } from "../crop/types";

export type { StageStateResult };

/**
 * Bench spine for `/remove-background`: exactly one working plate is open;
 * the others rest as stamped rows (spec 0010 Feature 2). The pipeline is
 * removal-only — no frame, guide, preset, zoom, or canvas exists here.
 */
export type RemoveStageId = "source" | "remove" | "download";

/**
 * Pipeline state. `consent` sits between `ready` and `removing`: the
 * first-run model download never starts until the visitor confirms it
 * (spec 0010 Feature 4), and the run token lets them abort it.
 */
export type RemovePipelineStage = "idle" | "reading" | "ready" | "consent" | "removing" | "removed";

export interface RemoveError {
  /** The plate that owns the alert (spec 0010: errors surface where they happen). */
  stage: RemoveStageId;
  message: string;
}
