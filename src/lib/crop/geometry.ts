/**
 * Pure framing geometry for the ID Photo Studio pan model.
 *
 * The crop frame is fixed and centered; the photo pans underneath it.
 * These helpers are DOM-free so they stay unit-testable without a
 * browser. All coordinates are in natural image pixels unless noted.
 */

export interface FrameBox {
  /** Left edge of the sampled square in natural image pixels. */
  x: number;
  /** Top edge of the sampled square in natural image pixels. */
  y: number;
  /** Side length of the sampled square in natural image pixels. */
  size: number;
}

export interface PanOffset {
  x: number;
  y: number;
}

export interface StageRect {
  x: number;
  y: number;
  size: number;
}

/**
 * Seeds the initial export box: the largest centered square.
 *
 * @param imageWidth - Natural image width in pixels
 * @param imageHeight - Natural image height in pixels
 * @returns Centered square box in natural image pixels
 */
export function initialFrame(imageWidth: number, imageHeight: number): FrameBox {
  const size = Math.min(imageWidth, imageHeight);
  return {
    x: (imageWidth - size) / 2,
    y: (imageHeight - size) / 2,
    size,
  };
}

/**
 * Clamps a pan offset so the frame stays fully inside the image.
 * This is the coverage invariant: no empty area may appear in the frame.
 *
 * @param imageWidth - Natural image width in pixels
 * @param imageHeight - Natural image height in pixels
 * @param frameSize - Frame side length in natural image pixels
 * @param panX - Desired frame left edge in natural image pixels
 * @param panY - Desired frame top edge in natural image pixels
 * @returns Clamped offset in natural image pixels
 */
export function clampPanOffset(
  imageWidth: number,
  imageHeight: number,
  frameSize: number,
  panX: number,
  panY: number
): PanOffset {
  const maxX = Math.max(0, imageWidth - frameSize);
  const maxY = Math.max(0, imageHeight - frameSize);
  return {
    x: Math.min(Math.max(0, panX), maxX),
    y: Math.min(Math.max(0, panY), maxY),
  };
}

/**
 * Sampled square side in natural image pixels at a given zoom.
 *
 * `zoom = 1` is the "cover" fit: the image's shorter side exactly spans
 * the fixed frame (the largest centered square). `zoom > 1` enlarges the
 * image underneath the fixed frame, so the sampled region shrinks —
 * zoom is a composition control, not a screen magnifier. Values below 1
 * are invalid (the image could not cover the frame).
 *
 * @param minSide - Shorter natural side of the image in pixels
 * @param zoom - Zoom multiplier (>= 1)
 * @returns Sampled square side in natural image pixels
 *
 * @example
 * ```typescript
 * sampledSizeForZoom(3000, 2); // 1500 — the frame now covers half the side
 * ```
 */
export function sampledSizeForZoom(minSide: number, zoom: number): number {
  return minSide / Math.max(1, zoom);
}

/**
 * Re-derives the frame box after a zoom change, keeping the frame's
 * center anchored: zooming enlarges the image around the currently
 * framed content instead of jumping to the top-left corner. The result
 * is re-clamped so the coverage invariant still holds.
 *
 * @param imageWidth - Natural image width in pixels
 * @param imageHeight - Natural image height in pixels
 * @param current - Frame box at the previous zoom
 * @param zoom - New zoom multiplier (>= 1)
 * @returns Re-centered, clamped frame box at the new zoom
 */
export function repanForZoom(
  imageWidth: number,
  imageHeight: number,
  current: FrameBox,
  zoom: number
): FrameBox {
  const size = sampledSizeForZoom(Math.min(imageWidth, imageHeight), zoom);
  const centerX = current.x + current.size / 2;
  const centerY = current.y + current.size / 2;
  const clamped = clampPanOffset(
    imageWidth,
    imageHeight,
    size,
    centerX - size / 2,
    centerY - size / 2
  );
  return { x: clamped.x, y: clamped.y, size };
}

export interface GuideEllipse {
  /** Center x in frame-relative units (0 = left edge, 1 = right edge). */
  cx: number;
  /** Center y in frame-relative units (0 = top edge, 1 = bottom edge). */
  cy: number;
  /** Horizontal radius in frame-relative units. */
  rx: number;
  /** Vertical radius in frame-relative units. */
  ry: number;
}

export interface FaceGuide {
  /** Head oval in frame-relative units. Never rendered to export. */
  head: GuideEllipse;
  /** Shoulder line endpoints in frame-relative units. */
  shoulders: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * Computes the preset-adaptive face-placement guide in frame-relative
 * units. The overlay assists framing only — the export path must never
 * call this.
 *
 * Proportions encode a document-photo composition: the head oval sits in
 * the upper-center of the frame and the shoulder line crosses the lower
 * third. Ratios come from the canonical preset data so the guide adapts
 * to `2x2` versus `1x1` without hardcoded pixel ovals.
 *
 * @param presetId - Canonical preset key from `ID_PRESETS`
 * @returns Head oval and shoulder line in frame-relative units
 */
export function faceGuideForPreset(presetId: string): FaceGuide {
  const isSmall = presetId === "1x1";
  // The 1x1 frame crops tighter, so the guide sits slightly larger and
  // lower to keep shoulders inside the printable area.
  return {
    head: isSmall
      ? { cx: 0.5, cy: 0.36, rx: 0.24, ry: 0.3 }
      : { cx: 0.5, cy: 0.34, rx: 0.22, ry: 0.28 },
    shoulders: isSmall
      ? { x1: 0.2, y1: 0.78, x2: 0.8, y2: 0.78 }
      : { x1: 0.22, y1: 0.76, x2: 0.78, y2: 0.76 },
  };
}

/**
 * Computes the fixed frame rectangle on a square stage.
 * The frame is always centered; only its size varies with zoom.
 *
 * @param stagePx - Stage side length in CSS pixels
 * @param frameSizeNatural - Frame side length in natural image pixels
 * @param fitScale - Shared fit transform (stage px per natural px)
 * @returns Centered square rect in CSS pixels
 */
export function frameStageRect(
  stagePx: number,
  frameSizeNatural: number,
  fitScale: number
): StageRect {
  const size = frameSizeNatural * fitScale;
  return {
    x: (stagePx - size) / 2,
    y: (stagePx - size) / 2,
    size,
  };
}
