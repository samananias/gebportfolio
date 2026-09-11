/**
 * Pure validators for the ID Photo Studio backend.
 *
 * No runtime dependencies and no I/O — safe to import from Workers API
 * routes and unit-testable without a Cloudflare environment.
 */

import { BG_OPTIONS, EXPORT, ID_PRESETS, type IdPresetId } from "./presets";

export interface FileMeta {
  mimeType: string;
  sizeBytes: number;
  widthPx: number;
  heightPx: number;
}

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validates upload metadata before any processing is attempted.
 *
 * @param meta - Client-reported file metadata (type, size, dimensions)
 * @returns Validity plus a user-facing error message when invalid
 *
 * @example
 * ```typescript
 * const result = validateFileMeta({ mimeType: "image/jpeg", sizeBytes: 1024, widthPx: 800, heightPx: 600 });
 * // { isValid: true, error: null }
 * ```
 */
export function validateFileMeta(meta: FileMeta): ValidationResult {
  if (!EXPORT.formats.includes(meta.mimeType as (typeof EXPORT.formats)[number])) {
    return {
      isValid: false,
      error: "Only JPEG and PNG photos are supported.",
    };
  }
  if (!Number.isFinite(meta.sizeBytes) || meta.sizeBytes <= 0) {
    return { isValid: false, error: "The photo could not be read. Try another file." };
  }
  if (meta.sizeBytes > EXPORT.maxInputBytes) {
    return { isValid: false, error: "The photo is too large. Use a file under 8 MB." };
  }
  if (
    !Number.isFinite(meta.widthPx) ||
    !Number.isFinite(meta.heightPx) ||
    meta.widthPx <= 0 ||
    meta.heightPx <= 0
  ) {
    return { isValid: false, error: "The photo dimensions could not be read." };
  }
  if (meta.widthPx > EXPORT.maxInputDimensionPx || meta.heightPx > EXPORT.maxInputDimensionPx) {
    return {
      isValid: false,
      error: "The photo is too large. Use an image under 4000 px per side.",
    };
  }
  return { isValid: true, error: null };
}

/**
 * Checks that a preset id matches a canonical entry in `ID_PRESETS`.
 *
 * @param value - Unknown preset id from the client
 * @returns The narrowed preset id, or null when unknown
 */
export function validatePresetId(value: unknown): IdPresetId | null {
  if (typeof value !== "string") return null;
  return (Object.keys(ID_PRESETS) as IdPresetId[]).includes(value as IdPresetId)
    ? (value as IdPresetId)
    : null;
}

export interface ExportOptions {
  preset: unknown;
  background: unknown;
  format: unknown;
}

/**
 * Validates the export options submitted before download.
 *
 * @param options - Raw preset, background, and format selections
 * @returns Validity plus a user-facing error message when invalid
 */
export function validateExportOpts(options: ExportOptions): ValidationResult {
  if (validatePresetId(options.preset) === null) {
    return { isValid: false, error: "Choose a valid photo size (2x2 or 1x1)." };
  }
  if (
    typeof options.background !== "string" ||
    !BG_OPTIONS.includes(options.background as (typeof BG_OPTIONS)[number])
  ) {
    return { isValid: false, error: "Choose a valid background option." };
  }
  if (
    typeof options.format !== "string" ||
    !EXPORT.formats.includes(options.format as (typeof EXPORT.formats)[number])
  ) {
    return { isValid: false, error: "Choose a valid export format (JPEG or PNG)." };
  }
  return { isValid: true, error: null };
}
