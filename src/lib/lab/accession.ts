/**
 * Stable ledger accession number for an experiment entry.
 *
 * Derived from the content slug so adding or re-sorting entries never
 * renumbers existing rows (Lab critique P1). Used by both the ledger list
 * (`/experiments`) and every entry page (`/experiments/[slug]`) so a row and
 * its record always agree on the accession.
 *
 * @param id - The experiment content id (filename slug)
 * @returns A zero-padded ledger number, e.g. "EXP.07"
 *
 * @example
 * ```typescript
 * const number = formatEntryNumber("id-photo-studio"); // "EXP.07"
 * ```
 */
export function formatEntryNumber(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100;
  }
  return `EXP.${String(hash).padStart(2, "0")}`;
}
