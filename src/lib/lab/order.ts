import type { CollectionEntry } from "astro:content";

type ExperimentEntry = CollectionEntry<"experiments">;

const STATUS_ORDER: Record<ExperimentEntry["data"]["status"], number> = {
  active: 0,
  completed: 1,
  abandoned: 2,
};

/**
 * Ledger order shared by the index rows and every entry record:
 * active → completed → shelved, title as tiebreak.
 *
 * Lives in its own module because `getStaticPaths` is evaluated outside
 * the component frontmatter scope and cannot see page-level constants.
 *
 * @param experiments - Experiments in any order.
 * @returns A new array sorted in ledger order (input is not mutated).
 */
export function sortExperimentsLedger(experiments: ExperimentEntry[]): ExperimentEntry[] {
  return [...experiments].sort((a, b) => {
    const orderA = STATUS_ORDER[a.data.status] ?? 99;
    const orderB = STATUS_ORDER[b.data.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.data.title.localeCompare(b.data.title);
  });
}
