import React, { useCallback, useEffect, useRef, useState } from "react";
import { BG_SWATCH, type BgOption, type IdPresetId } from "../../lib/crop/presets";
import { clampPanOffset, faceGuideForPreset, repanForZoom } from "../../lib/crop/geometry";
import { NUDGE_LARGE_STEP_PX, NUDGE_STEP_PX } from "./constants";
import type { CropBox } from "./types";

interface UseCropCanvasParams {
  sourceRef: React.RefObject<HTMLImageElement | null>;
  cutoutRef: React.RefObject<HTMLImageElement | null>;
  box: CropBox | null;
  setBox: React.Dispatch<React.SetStateAction<CropBox | null>>;
  presetId: IdPresetId;
  bg: BgOption;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  showGuide: boolean;
  announceFrame: (message: string) => void;
}

export function useCropCanvas({
  sourceRef,
  cutoutRef,
  box,
  setBox,
  presetId,
  bg,
  zoom,
  setZoom,
  showGuide,
  announceFrame,
}: UseCropCanvasParams) {
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guideRef = useRef(true);
  const presetRef = useRef<IdPresetId>("2x2");
  const viewRef = useRef({ fitScale: 1 });
  const boxRef = useRef<CropBox | null>(null);

  boxRef.current = box;
  guideRef.current = showGuide;
  presetRef.current = presetId;

  // The canvas is a square stage (matching its CSS aspect-ratio). The crop
  // frame is fixed and centered; the photo pans underneath it. Every
  // screen coordinate flows through fitScale so the overlay square is
  // really square on screen — the same geometry handleExport samples, so
  // the preview never misleads.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = cutoutRef.current ?? sourceRef.current;
    const current = boxRef.current;
    if (!canvas || !img || !current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const stageSize = canvas.clientWidth || 480;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(stageSize * dpr);
    canvas.height = Math.round(stageSize * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Transparency shows the shared CSS checkerboard through the cleared
    // canvas; the class resolves from the theme, so dark mode reads it too
    // (spec 0009 §6). Opaque swatches simply paint over it.
    if (bg !== "transparent") {
      ctx.fillStyle = BG_SWATCH[bg];
      ctx.fillRect(0, 0, stageSize, stageSize);
    } else {
      ctx.clearRect(0, 0, stageSize, stageSize);
    }
    // Zoom scales ONLY the image; the frame is pinned to the stage and the
    // guide stays fixed relative to it. zoom = 1 is the cover fit (the
    // image's shorter side exactly spans the stage), so what the stage
    // shows is exactly what handleExport samples.
    const minSide = Math.min(img.naturalWidth, img.naturalHeight);
    const imageScale = (stageSize / minSide) * zoom;
    // Pan offset: sampled-region origin relative to the image origin, in
    // natural pixels. The stage (the frame) always displays the box region.
    const clamped = clampPanOffset(
      img.naturalWidth,
      img.naturalHeight,
      current.size,
      current.x,
      current.y
    );
    viewRef.current.fitScale = imageScale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      -clamped.x * imageScale,
      -clamped.y * imageScale,
      img.naturalWidth * imageScale,
      img.naturalHeight * imageScale
    );
    // The stage itself is the frame: a two-tone stroke marks it — a wide ink
    // halo under a narrow paper line — so it stays legible over any photo in
    // either theme. Colors are read from the tokens at draw time, never
    // hardcoded (spec 0009 §6). Never drawn by handleExport.
    const styles = getComputedStyle(canvas);
    const ink = styles.getPropertyValue("--color-text").trim();
    const paper = styles.getPropertyValue("--color-surface").trim();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, stageSize - 4, stageSize - 4);
    ctx.strokeStyle = paper;
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, stageSize - 6, stageSize - 6);
    // Preview-only face-placement guide: head oval plus shoulder line,
    // inked twice (halo then light dash) for the same legibility contract.
    // Never drawn in handleExport — the exported file keeps source
    // pixels only.
    if (guideRef.current) {
      const guide = faceGuideForPreset(presetRef.current);
      const strokeGuide = () => {
        ctx.beginPath();
        ctx.ellipse(
          guide.head.cx * stageSize,
          guide.head.cy * stageSize,
          guide.head.rx * stageSize,
          guide.head.ry * stageSize,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(guide.shoulders.x1 * stageSize, guide.shoulders.y1 * stageSize);
        ctx.lineTo(guide.shoulders.x2 * stageSize, guide.shoulders.y2 * stageSize);
        ctx.stroke();
      };
      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3.5;
      strokeGuide();
      ctx.strokeStyle = paper;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      strokeGuide();
      ctx.restore();
    }
  }, [bg, zoom]);

  useEffect(() => {
    draw();
  }, [draw, box, presetId, showGuide]);

  // Keep the backing buffer matched to the layout when the stage resizes,
  // otherwise the preview blurs and the drag mapping drifts.
  useEffect(() => {
    const observer = new ResizeObserver(() => draw());
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [draw]);

  // Theme swaps put the new palette on <html> as a class; redraw so the
  // frame, guide, and checkerboard re-ink in the new tokens (spec 0009 §6).
  // Disconnected on unmount.
  useEffect(() => {
    const observer = new MutationObserver(() => draw());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [draw]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const current = boxRef.current;
      const img = cutoutRef.current ?? sourceRef.current;
      if (!canvas || !current || !img) return;
      const holder = canvas as HTMLCanvasElement & {
        dragOrigin?: { startX: number; startY: number; boxX: number; boxY: number; scale: number };
      };
      holder.dragOrigin = {
        startX: event.clientX,
        startY: event.clientY,
        boxX: current.x,
        boxY: current.y,
        // Screen pixels to natural pixels: invert the letterbox fit (including zoom).
        scale: 1 / (viewRef.current.fitScale || 1),
      };
      setDragging(true);
      canvas.setPointerCapture(event.pointerId);
    },
    [cutoutRef, sourceRef]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const current = boxRef.current;
      const img = cutoutRef.current ?? sourceRef.current;
      const holder = canvas as
        | (HTMLCanvasElement & {
            dragOrigin?: {
              startX: number;
              startY: number;
              boxX: number;
              boxY: number;
              scale: number;
            };
          })
        | null;
      const origin = holder?.dragOrigin;
      if (!canvas || !current || !img || !origin || !dragging) return;
      // Dragging right moves the photo right, so the frame samples further
      // left: subtract the screen delta (converted to natural pixels).
      const clamped = clampPanOffset(
        img.naturalWidth,
        img.naturalHeight,
        current.size,
        origin.boxX - (event.clientX - origin.startX) * origin.scale,
        origin.boxY - (event.clientY - origin.startY) * origin.scale
      );
      setBox({ ...current, x: clamped.x, y: clamped.y });
    },
    [cutoutRef, dragging, setBox, sourceRef]
  );

  const endDrag = useCallback(() => {
    setDragging(false);
    // One settled announcement per drag instead of one per pixel.
    const current = boxRef.current;
    if (current) announceFrame(`Sample origin ${current.x} by ${current.y} pixels.`);
  }, [announceFrame]);

  /** Pans the sampled region by whole pixels; the shared keyboard/button path. */
  const panBy = useCallback(
    (deltaX: number, deltaY: number) => {
      const current = boxRef.current;
      const img = cutoutRef.current ?? sourceRef.current;
      if (!current || !img) return;
      const clamped = clampPanOffset(
        img.naturalWidth,
        img.naturalHeight,
        current.size,
        current.x + deltaX,
        current.y + deltaY
      );
      setBox({ ...current, x: clamped.x, y: clamped.y });
      announceFrame(`Sample origin ${clamped.x} by ${clamped.y} pixels.`);
    },
    [announceFrame, cutoutRef, setBox, sourceRef]
  );

  const onFrameKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      const step = event.shiftKey ? NUDGE_LARGE_STEP_PX : NUDGE_STEP_PX;
      // Arrow keys move the photo; the frame stays fixed. Pressing Right
      // slides the photo right, so the frame samples further left.
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        panBy(step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        panBy(-step, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        panBy(0, step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        panBy(0, -step);
      }
    },
    [panBy]
  );

  // Zoom scales only the image under the fixed frame — the frame and face
  // guide never move or resize. The frame's center stays anchored, so the
  // image enlarges around the framed content, and the box is re-clamped so
  // the coverage invariant still holds at any zoom.
  const onZoomChange = useCallback(
    (next: number) => {
      setZoom(next);
      const img = cutoutRef.current ?? sourceRef.current;
      const current = boxRef.current;
      if (!img || !current) return;
      setBox(repanForZoom(img.naturalWidth, img.naturalHeight, current, next));
      announceFrame(`Zoom ${next.toFixed(2)}x.`);
    },
    [announceFrame, cutoutRef, setBox, setZoom, sourceRef]
  );

  return {
    canvasRef,
    draw,
    onPointerDown,
    onPointerMove,
    endDrag,
    onFrameKeyDown,
    panBy,
    onZoomChange,
  };
}
