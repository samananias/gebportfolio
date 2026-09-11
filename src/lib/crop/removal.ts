/**
 * Shared in-browser background-removal pipeline for the ID Photo tooling.
 *
 * Both the crop studio (`/crop`) and the removal-only page
 * (`/remove-background`) import these helpers so the ML path — lazy
 * `@imgly/background-removal` import, fetch progress, object-URL
 * lifecycle, and failure copy — lives in exactly one place (see
 * docs/plans/0007-image-editing-improvements.md Feature 3).
 *
 * Nothing here posts image bytes anywhere. Telemetry stays the caller's
 * concern via `POST /api/crop/usage` (metadata-only).
 */

import { EXPORT, REMOVAL_MODEL } from "./presets";

export interface RemovalProgress {
  /** Stable identifier of the current stage, e.g. `fetch:*.onnx`. */
  key: string;
  /** Zero-based index of the current chunk or step. */
  current: number;
  /** Total chunks or steps when known, otherwise zero. */
  total: number;
}

export type RemovalResult =
  { ok: true; blob: Blob; ms: number } | { ok: false; error: string; ms: number };

/**
 * Decodes a URL (blob or data URL) into an `HTMLImageElement`.
 *
 * @param url - Object URL or data URL of the image
 * @returns A resolved image element
 *
 * @example
 * ```typescript
 * const img = await loadImage(URL.createObjectURL(file));
 * ```
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo could not be read."));
    img.src = url;
  });
}

/**
 * Downscales an image so neither side exceeds `cap` pixels (existing
 * upload guard from the presets). Returns the input unchanged when it
 * already fits.
 *
 * @param img - Decoded image element
 * @param cap - Maximum side length in pixels
 * @returns A PNG-backed image at or under the cap
 */
export async function fitWithinCap(img: HTMLImageElement, cap: number): Promise<HTMLImageElement> {
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= cap) return img;
  const scale = cap / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return img;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Blob URL instead of a data URL: one re-encode, no multi-megabyte
  // string, no second decode penalty.
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return loadImage(canvas.toDataURL("image/png"));
  return loadImage(URL.createObjectURL(blob));
}

/**
 * Runs in-browser background removal (WASM + ONNX, browser-cached model).
 * Resolves with a transparent PNG cutout, or a non-fatal error string.
 * Photos never leave the device (see ADR 0008).
 *
 * @param src - `src` URL of the source image element
 * @param onProgress - Optional progress callback surfaced as `fetch:*`
 * @returns Cutout blob plus elapsed milliseconds, or an error message
 */
export async function removeBackgroundInBrowser(
  src: string,
  onProgress?: (progress: RemovalProgress) => void
): Promise<RemovalResult> {
  const startedAt = performance.now();
  const done = () => Math.round(performance.now() - startedAt);
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    const blob = await removeBackground(src, {
      progress: (key: string, current: number, total: number) => {
        if (!onProgress || !key.startsWith("fetch:")) return;
        onProgress({ key, current, total });
      },
    });
    return { ok: true, blob, ms: done() };
  } catch {
    return {
      ok: false,
      error: "Background removal failed. You can still use the original photo.",
      ms: done(),
    };
  }
}

export { EXPORT, REMOVAL_MODEL };
