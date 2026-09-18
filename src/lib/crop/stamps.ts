/**
 * Studio bench stamp treatment per stage (ink-on-paper; blue stays scarce).
 * Shared by every stage row on the /crop bench so the state language stays
 * identical across the tool — one source prevents stage/detail drift.
 * Mirrors the shape of `src/lib/lab/stamps.ts`.
 *
 * @param state - Bench stage state (`"waiting" | "current" | "done" | "locked"`)
 * @returns The full class string for the stamp `<span>`.
 *
 * @example
 * ```typescript
 * const classes = getCropStampClass("current"); // "... border-text text-text"
 * ```
 */
const STAMP_BASE =
  "text-micro inline-flex shrink-0 items-center rounded-sm border px-2 py-0.5 font-mono font-bold tracking-[0.14em] uppercase";

export type CropStageState = "waiting" | "current" | "done" | "locked";

export function getCropStampClass(state: CropStageState): string {
  if (state === "current") return `${STAMP_BASE} border-text text-text`;
  if (state === "done") return `${STAMP_BASE} border-primary text-primary`;
  if (state === "locked") return `${STAMP_BASE} border-border-custom text-text-muted border-dashed`;
  return `${STAMP_BASE} border-text text-text-muted`;
}
