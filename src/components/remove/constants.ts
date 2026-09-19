import type { RemoveStageId } from "./types";

/** Storage key for the two-mode deep link (distinct from the crop page's key). */
export const REMOVE_MODE_STORAGE_KEY = "remove-mode";

/** Bench plate metadata: ordinal, heading id for `aria-labelledby`, panel id for `aria-controls`. */
export const STAGE_META: Record<
  RemoveStageId,
  { ordinal: string; headingId: string; panelId: string }
> = {
  source: { ordinal: "01 ·", headingId: "remove-step-source", panelId: "remove-panel-source" },
  remove: { ordinal: "02 ·", headingId: "remove-step-remove", panelId: "remove-panel-remove" },
  download: {
    ordinal: "03 ·",
    headingId: "remove-step-download",
    panelId: "remove-panel-download",
  },
};

/** Plate titles, including the ordinal the E2E contract asserts. */
export const STAGE_LABEL: Record<RemoveStageId, string> = {
  source: "01 · Source photo",
  remove: "02 · Remove the background",
  download: "03 · Download the cutout",
};
