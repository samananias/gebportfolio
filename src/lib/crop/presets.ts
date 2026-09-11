/**
 * Canonical ID-photo presets for the ID Photo Studio tool.
 *
 * Single source of truth for print sizes, background options, and export
 * caps. The frontend island and the `GET /api/crop/config` route must import
 * from here — never hardcode pixel dimensions elsewhere.
 *
 * v1 pixel spec is square at 300 DPI. Rectangular passport variants are out
 * of scope and may be added as extra preset keys without breaking this
 * contract (see docs/plans/0006-id-photo-studio-specification.md).
 */

export interface IdPreset {
  /** Stable key used in API payloads and telemetry. */
  id: string;
  /** Human label shown in the UI, e.g. "2x2 (PH ID)". */
  label: string;
  /** Physical size in inches: [width, height]. */
  inches: readonly [number, number];
  /** Physical size in millimetres: [width, height]. */
  millimetres: readonly [number, number];
  /** Export size in pixels at 300 DPI: [width, height]. */
  pixelsAt300Dpi: readonly [number, number];
}

export const ID_PRESETS = {
  "2x2": {
    id: "2x2",
    label: "2x2 (PH ID)",
    inches: [2, 2],
    millimetres: [51, 51],
    pixelsAt300Dpi: [600, 600],
  },
  "1x1": {
    id: "1x1",
    label: "1x1 (PH ID)",
    inches: [1, 1],
    millimetres: [25, 25],
    pixelsAt300Dpi: [300, 300],
  },
} as const satisfies Record<string, IdPreset>;

export type IdPresetId = keyof typeof ID_PRESETS;

export const ID_PRESET_IDS = Object.keys(ID_PRESETS) as IdPresetId[];

/** Background choices offered after removal. */
export const BG_OPTIONS = ["white", "light-blue", "transparent"] as const;

export type BgOption = (typeof BG_OPTIONS)[number];

/** Upload and export guardrails enforced by validators and the API stub. */
export const EXPORT = {
  formats: ["image/jpeg", "image/png"],
  /** Maximum accepted upload size: 8 MiB. */
  maxInputBytes: 8 * 1024 * 1024,
  /** Maximum accepted upload dimension (either side): 4000 px. */
  maxInputDimensionPx: 4000,
  /** Print resolution assumed for the canonical pixel sizes. */
  printDpi: 300,
} as const;

/** Model metadata surfaced by `GET /api/crop/config` for honest UI copy. */
export const REMOVAL_MODEL = {
  name: "@imgly/background-removal-js",
  license: "AGPL-3.0",
  runtime: "WASM + ONNX, runs fully in the browser",
  /** Approximate first-load download; cached by the browser afterwards. */
  approximateDownloadMb: 40,
} as const;
