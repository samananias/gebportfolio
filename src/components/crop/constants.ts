import type { BgOption } from "../../lib/crop/presets";
import type { BenchStageId } from "./types";

/** Export formats with honest one-line disclosures (spec 0009 §5). */
export const EXPORT_FORMATS = [
  { id: "image/png", label: "PNG", disclosure: "Keeps transparency." },
  { id: "image/jpeg", label: "JPEG", disclosure: "Flattened onto white." },
] as const;

export type ExportFormatId = (typeof EXPORT_FORMATS)[number]["id"];

/** Keyboard-free pan step shared by the four nudge buttons (spec 0009 §7). */
export const NUDGE_STEP_PX = 4;

/** Shift-held pan step on the framing canvas. */
export const NUDGE_LARGE_STEP_PX = 20;

/** Panning fires in bursts: the live message settles before announcing. */
export const FRAME_ANNOUNCE_DEBOUNCE_MS = 600;

/** Persisted "model already cached" flag for the consent gate (spec 0009 §6). */
export const MODEL_CONSENT_KEY = "crop-model-consent";

/**
 * Reads the persisted consent flag without trusting the store: a throwing
 * `localStorage` (private mode, quota) simply reports "not cached".
 *
 * @returns True when a previous removal succeeded on this device
 */
export function readModelConsent(): boolean {
  try {
    return window.localStorage.getItem(MODEL_CONSENT_KEY) !== null;
  } catch {
    return false;
  }
}

/** Writes the consent flag; called only after a successful removal, so a failed download is disclosed again next time. */
export function writeModelConsent(): void {
  try {
    window.localStorage.setItem(MODEL_CONSENT_KEY, new Date().toISOString());
  } catch {
    // A throwing store must never break the pipeline (spec 0009 §6).
  }
}

export const BG_LABEL: Record<BgOption, string> = {
  white: "White",
  "light-blue": "Light blue",
  transparent: "Transparent",
};

export const STAGE_META: Record<BenchStageId, { ordinal: string; panelId: string }> = {
  source: { ordinal: "01 ·", panelId: "crop-panel-source" },
  frame: { ordinal: "02 ·", panelId: "crop-panel-frame" },
  export: { ordinal: "03 ·", panelId: "crop-panel-export" },
};

export const STAGE_LABEL: Record<BenchStageId, string> = {
  source: "01 · Source portrait",
  frame: "02 · Frame the face",
  export: "03 · Export print file",
};
