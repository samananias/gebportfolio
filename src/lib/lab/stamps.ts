/**
 * Ledger stamp treatment per status (ink-on-paper; blue stays scarce).
 * Shared by the ledger list and every entry record so the state language
 * stays identical across the Lab — one source prevents list/detail drift.
 *
 * @param status - Experiment status (`"active" | "completed" | "abandoned"`)
 * @returns The full class string for the stamp `<span>`.
 *
 * @example
 * ```typescript
 * const classes = getLabStampClass("completed"); // "... border-primary text-primary"
 * ```
 */
const STAMP_BASE =
  "text-micro inline-flex items-center rounded-sm border px-2 py-0.5 font-mono font-bold tracking-[0.14em] uppercase";

export function getLabStampClass(status: string): string {
  if (status === "active") return `${STAMP_BASE} border-text text-text`;
  if (status === "completed") return `${STAMP_BASE} border-primary text-primary`;
  return `${STAMP_BASE} border-border-custom text-text-muted border-dashed`;
}
