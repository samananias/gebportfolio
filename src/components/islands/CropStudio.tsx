import React, { useCallback, useEffect, useRef, useState } from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import {
  BG_OPTIONS,
  EXPORT,
  ID_PRESETS,
  REMOVAL_MODEL,
  type BgOption,
  type IdPresetId,
} from "../../lib/crop/presets";
import { validateExportOpts, validateFileMeta } from "../../lib/crop/validation";
import {
  clampPanOffset,
  faceGuideForPreset,
  initialFrame,
  repanForZoom,
} from "../../lib/crop/geometry";
import {
  fitWithinCap,
  loadImage,
  removeBackgroundInBrowser,
  type RemovalProgress,
} from "../../lib/crop/removal";

type Stage = "idle" | "ready" | "removing" | "removed";

/** Exported square in natural image pixels; the fixed frame samples it. */
interface CropBox {
  x: number;
  y: number;
  size: number;
}

const BG_SWATCH: Record<BgOption, string> = {
  white: "#ffffff",
  "light-blue": "#d0e6ff",
  transparent: "transparent",
};

const BG_LABEL: Record<BgOption, string> = {
  white: "White",
  "light-blue": "Light blue",
  transparent: "Transparent",
};

export default function CropStudio() {
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("Choose a portrait to begin. JPEG or PNG, up to 8 MB.");
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<IdPresetId>("2x2");
  const [bg, setBg] = useState<BgOption>("white");
  const [format] = useState<string>("image/png");
  const [progress, setProgress] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGuide, setShowGuide] = useState(true);
  const [box, setBox] = useState<CropBox | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guideRef = useRef(true);
  const presetRef = useRef<IdPresetId>("2x2");
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const cutoutRef = useRef<HTMLImageElement | null>(null);
  const viewRef = useRef({ fitScale: 1 });
  const boxRef = useRef<CropBox | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  boxRef.current = box;
  guideRef.current = showGuide;
  presetRef.current = presetId;

  // Hydration signal so E2E/render tests can wait for the island's event
  // handlers to be attached before driving the file input.
  useEffect(() => {
    rootRef.current?.setAttribute("data-crop-hydrated", "true");
  }, []);

  const announce = useCallback((message: string) => setStatus(message), []);

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
    const stage = canvas.clientWidth || 480;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(stage * dpr);
    canvas.height = Math.round(stage * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bgValue = BG_SWATCH[bg];
    if (bgValue === "transparent") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, stage, stage);
      ctx.fillStyle = "#e3e6ec";
      const cell = 16;
      for (let y = 0; y < stage; y += cell) {
        for (let x = 0; x < stage; x += cell) {
          if ((x / cell + y / cell) % 2 === 0) ctx.fillRect(x, y, cell, cell);
        }
      }
    } else {
      ctx.fillStyle = bgValue;
      ctx.fillRect(0, 0, stage, stage);
    }
    // Zoom scales ONLY the image; the frame is pinned to the stage and the
    // guide stays fixed relative to it. zoom = 1 is the cover fit (the
    // image's shorter side exactly spans the stage), so what the stage
    // shows is exactly what handleExport samples.
    const minSide = Math.min(img.naturalWidth, img.naturalHeight);
    const imageScale = (stage / minSide) * zoom;
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
    // The stage itself is the frame: a hairline inset border marks it, then
    // the preview-only face-placement guide anchors to the same square.
    ctx.strokeStyle = "rgba(15, 12, 10, 0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, stage - 2, stage - 2);
    // Preview-only face-placement guide: head oval plus shoulder line.
    // Never drawn in handleExport — the exported file keeps source
    // pixels only.
    if (guideRef.current) {
      const guide = faceGuideForPreset(presetRef.current);
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.ellipse(
        guide.head.cx * stage,
        guide.head.cy * stage,
        guide.head.rx * stage,
        guide.head.ry * stage,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(guide.shoulders.x1 * stage, guide.shoulders.y1 * stage);
      ctx.lineTo(guide.shoulders.x2 * stage, guide.shoulders.y2 * stage);
      ctx.stroke();
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

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      // Validate synchronously first so the feedback is instant and never
      // depends on image decoding (a .txt file never decodes to an image).
      const earlyCheck = validateFileMeta({
        mimeType: file.type,
        sizeBytes: file.size,
        widthPx: 1,
        heightPx: 1,
      });
      if (!earlyCheck.isValid && earlyCheck.error !== "The photo dimensions could not be read.") {
        setError(earlyCheck.error);
        announce(earlyCheck.error ?? "That photo could not be used.");
        setExportUrl(null);
        return;
      }
      setError(null);
      setExportUrl(null);
      const url = URL.createObjectURL(file);
      try {
        const probe = await loadImage(url).catch(() => null);
        const check = validateFileMeta({
          mimeType: file.type,
          sizeBytes: file.size,
          widthPx: probe?.naturalWidth ?? 0,
          heightPx: probe?.naturalHeight ?? 0,
        });
        if (!check.isValid) {
          setError(check.error);
          announce(check.error ?? "That photo could not be used.");
          return;
        }
        if (!probe) {
          const message = "The photo could not be read. Try another file.";
          setError(message);
          announce(message);
          return;
        }
        const fitted = await fitWithinCap(probe, EXPORT.maxInputDimensionPx);
        sourceRef.current = fitted;
        cutoutRef.current = null;
        setBox(initialFrame(fitted.naturalWidth, fitted.naturalHeight));
        setZoom(1);
        setStage("ready");
        announce("Portrait loaded. Remove the background, then drag the photo to frame the face.");
      } catch {
        setError("The photo could not be read. Try another file.");
      }
    },
    [announce]
  );

  const handleRemove = useCallback(async () => {
    const source = sourceRef.current;
    if (!source) return;
    setError(null);
    setStage("removing");
    setProgress(0);
    announce("Downloading the on-device model on first run, then cutting out the portrait.");
    const result = await removeBackgroundInBrowser(source.src, (p: RemovalProgress) => {
      if (p.total > 0) setProgress(Math.round((p.current / p.total) * 100));
    });
    setProgress(null);
    if (!result.ok) {
      setStage("ready");
      setError(result.error);
      announce(result.error);
      return;
    }
    cutoutRef.current = await loadImage(URL.createObjectURL(result.blob));
    setStage("removed");
    draw();
    announce("Background removed on your device. Adjust the framing, then export.");
    try {
      await fetch("/api/crop/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "removal_succeeded",
          preset: presetId,
          ms: result.ms,
        }),
      });
    } catch {
      // Telemetry is best-effort.
    }
  }, [announce, draw, presetId]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
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
  }, []);

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
    [dragging]
  );

  const endDrag = useCallback(() => setDragging(false), []);

  // Zoom scales only the image under the fixed frame — the frame and face
  // guide never move or resize. The frame's center stays anchored, so the
  // image enlarges around the framed content, and the box is re-clamped so
  // the coverage invariant still holds at any zoom.
  const onZoomChange = useCallback((next: number) => {
    setZoom(next);
    const img = cutoutRef.current ?? sourceRef.current;
    const current = boxRef.current;
    if (!img || !current) return;
    setBox(repanForZoom(img.naturalWidth, img.naturalHeight, current, next));
  }, []);

  const onFrameKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const current = boxRef.current;
    const img = cutoutRef.current ?? sourceRef.current;
    if (!current || !img) return;
    const step = event.shiftKey ? 20 : 4;
    // Arrow keys move the photo; the frame stays fixed. Pressing Right
    // slides the photo right, so the frame samples further left.
    let panX = current.x;
    let panY = current.y;
    if (event.key === "ArrowLeft") panX = current.x + step;
    else if (event.key === "ArrowRight") panX = current.x - step;
    else if (event.key === "ArrowUp") panY = current.y + step;
    else if (event.key === "ArrowDown") panY = current.y - step;
    else return;
    event.preventDefault();
    const clamped = clampPanOffset(img.naturalWidth, img.naturalHeight, current.size, panX, panY);
    setBox({ ...current, x: clamped.x, y: clamped.y });
  }, []);

  const handleExport = useCallback(async () => {
    const img = cutoutRef.current ?? sourceRef.current;
    const current = boxRef.current;
    if (!img || !current) return;
    const check = validateExportOpts({ preset: presetId, background: bg, format });
    if (!check.isValid) {
      setError(check.error);
      return;
    }
    setError(null);
    const [target] = ID_PRESETS[presetId].pixelsAt300Dpi;
    const out = document.createElement("canvas");
    out.width = target;
    out.height = target;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const bgValue = BG_SWATCH[bg];
    if (format === "image/jpeg" || bgValue !== "transparent") {
      ctx.fillStyle = bgValue === "transparent" ? "#ffffff" : bgValue;
      ctx.fillRect(0, 0, target, target);
    }
    ctx.drawImage(img, current.x, current.y, current.size, current.size, 0, 0, target, target);
    setExportUrl(out.toDataURL(format, 0.92));
    announce(`Exported ${ID_PRESETS[presetId].label} at ${target} by ${target} pixels.`);
    try {
      await fetch("/api/crop/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "exported", preset: presetId, ms: 0 }),
      });
    } catch {
      // Telemetry is best-effort.
    }
    statusRef.current?.focus();
  }, [announce, bg, format, presetId]);

  const resetAll = useCallback(() => {
    sourceRef.current = null;
    cutoutRef.current = null;
    setBox(null);
    setExportUrl(null);
    setError(null);
    setProgress(null);
    setZoom(1);
    setStage("idle");
    announce("Cleared. Choose a portrait to begin. JPEG or PNG, up to 8 MB.");
    if (fileRef.current) fileRef.current.value = "";
  }, [announce]);

  const exportSize = ID_PRESETS[presetId].pixelsAt300Dpi[0];
  const canWork = stage !== "idle";

  return (
    <div id="crop-studio" ref={rootRef} className="space-y-8">
      <section
        aria-labelledby="crop-step-source"
        className="border-structural border-border-custom bg-surface rounded-sm p-6"
      >
        <h2 id="crop-step-source" className="font-display text-h4 text-text font-bold">
          01 · Source portrait
        </h2>
        <p className="text-small text-text-muted mt-2 leading-relaxed">
          JPEG or PNG up to 8 MB. The file stays on this device — nothing is uploaded.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            id="crop-file"
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(event) => {
              const input = event.target as HTMLInputElement;
              void handleFile(input.files?.[0]);
              // Reset the value so selecting the same file twice still fires change.
              input.value = "";
            }}
          />
          <label
            htmlFor="crop-file"
            className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <DoodleIcon name="interface/upload" className="size-4" />
            Choose portrait
          </label>
          {canWork && (
            <button
              type="button"
              onClick={resetAll}
              className="bg-surface text-text border-structural border-border-custom inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <DoodleIcon name="interface/sync" className="size-4" />
              Start over
            </button>
          )}
        </div>
      </section>

      <section
        aria-labelledby="crop-step-frame"
        className="border-structural border-border-custom bg-surface rounded-sm p-6"
      >
        <h2 id="crop-step-frame" className="font-display text-h4 text-text font-bold">
          02 · Frame the face
        </h2>
        <p
          ref={statusRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="text-small text-text-muted mt-2 leading-relaxed outline-none"
        >
          {status}
        </p>
        <p className="text-small text-text-muted mt-2 leading-relaxed">
          Drag the photo and zoom it under the fixed square until the face fits the guide. The
          exported file matches the framed view exactly.
        </p>
        {error && (
          <p
            role="alert"
            className="text-small mt-3 flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 dark:text-rose-300"
          >
            <DoodleIcon name="interface/caution" className="size-3.5 shrink-0" />
            {error}
          </p>
        )}

        {canWork ? (
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <canvas
                ref={canvasRef}
                className="border-border-custom w-full cursor-move touch-none rounded-md border"
                style={{ aspectRatio: "1 / 1" }}
                role="application"
                aria-label="Crop frame. Drag to move the photo, or focus and use arrow keys."
                tabIndex={0}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onFrameKeyDown}
              />
              <div className="mt-3 flex items-center gap-3">
                <label
                  htmlFor="crop-zoom"
                  className="text-caption text-text-muted font-mono font-semibold tracking-wider uppercase"
                >
                  Image zoom
                </label>
                <input
                  id="crop-zoom"
                  type="range"
                  min={1}
                  max={4}
                  step={0.05}
                  value={zoom}
                  onChange={(event) => onZoomChange(Number(event.target.value))}
                  className="w-full"
                />
                <span className="text-caption text-text-muted font-mono">{zoom.toFixed(2)}x</span>
              </div>
              {zoom > 1 && box && box.size < exportSize && (
                <p className="text-caption text-text-muted mt-2 leading-relaxed">
                  Zoomed past the photo&rsquo;s resolution — the export is enlarged and may look
                  soft.
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                <label
                  htmlFor="crop-guide"
                  className="text-caption text-text-muted font-mono font-semibold tracking-wider uppercase"
                >
                  Face guide
                </label>
                <button
                  id="crop-guide"
                  type="button"
                  role="switch"
                  aria-checked={showGuide}
                  onClick={() => setShowGuide((previous) => !previous)}
                  className="bg-surface-subtle text-text border-structural border-border-custom inline-flex h-8 cursor-pointer items-center rounded-md border px-3 font-sans font-medium"
                >
                  {showGuide ? "On" : "Off"}
                </button>
              </div>
              <p className="text-small text-text-muted mt-2 leading-relaxed">
                Guide only — it never exports. Center the head in the oval with shoulders on the
                line.
              </p>
            </div>
            <div className="space-y-5 lg:col-span-2">
              <fieldset>
                <legend className="text-caption text-text font-mono font-bold tracking-wider uppercase">
                  Photo size
                </legend>
                <div
                  className="mt-2 grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-label="Photo size"
                >
                  {(Object.keys(ID_PRESETS) as IdPresetId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={presetId === id}
                      onClick={() => setPresetId(id)}
                      className={`border-structural cursor-pointer rounded-md border px-3 py-2 text-left transition-[transform,box-shadow] duration-200 ${
                        presetId === id
                          ? "bg-primary text-bg border-text"
                          : "bg-surface-subtle text-text border-border-custom hover:shadow-[2px_2px_0_var(--color-text)]"
                      }`}
                    >
                      <span className="text-small block font-bold">{ID_PRESETS[id].label}</span>
                      <span className="text-caption block font-mono">
                        {ID_PRESETS[id].pixelsAt300Dpi[0]}px
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-caption text-text font-mono font-bold tracking-wider uppercase">
                  Background
                </legend>
                <div
                  className="mt-2 grid grid-cols-3 gap-2"
                  role="radiogroup"
                  aria-label="Background"
                >
                  {BG_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={bg === option}
                      onClick={() => setBg(option)}
                      className={`border-structural flex cursor-pointer flex-col items-center gap-1.5 rounded-md border px-2 py-2 transition-[transform,box-shadow] duration-200 ${
                        bg === option
                          ? "border-text shadow-[2px_2px_0_var(--color-text)]"
                          : "border-border-custom hover:shadow-[2px_2px_0_var(--color-text)]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="border-border-custom block h-8 w-full rounded-sm border"
                        style={{ backgroundColor: BG_SWATCH[option] }}
                      />
                      <span className="text-caption text-text font-medium">{BG_LABEL[option]}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={stage === "removing"}
                  className="bg-primary text-bg border-structural border-text inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] disabled:pointer-events-none disabled:opacity-50"
                >
                  <DoodleIcon name="files/file-image" className="size-4" />
                  {stage === "removing"
                    ? "Removing background…"
                    : stage === "removed"
                      ? "Remove again"
                      : "Remove background"}
                </button>
                {stage === "removing" && progress !== null && (
                  <p className="text-caption text-text-muted font-mono">Model {progress}%</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="border-border-custom bg-surface-subtle mt-4 flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-12 text-center">
            <DoodleIcon name="interface/photo" className="text-text-muted size-8" />
            <p className="text-small text-text-muted">No portrait yet. Choose a photo first.</p>
          </div>
        )}
      </section>

      <section
        aria-labelledby="crop-step-export"
        className="border-structural border-border-custom bg-surface rounded-sm p-6"
      >
        <h2 id="crop-step-export" className="font-display text-h4 text-text font-bold">
          03 · Export print file
        </h2>
        <p className="text-small text-text-muted mt-2 leading-relaxed">
          Exports the framed square at {exportSize} by {exportSize} pixels (
          {ID_PRESETS[presetId].label}).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!canWork}
            className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] disabled:pointer-events-none disabled:opacity-50"
          >
            <DoodleIcon name="interface/download" className="size-4" />
            Export {presetId} photo
          </button>
          {exportUrl && (
            <a
              href={exportUrl}
              download={`id-photo-${presetId}.${format === "image/png" ? "png" : "jpg"}`}
              className="bg-surface text-text border-structural border-border-custom inline-flex h-11 items-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
            >
              <DoodleIcon name="interface/download" className="size-4" />
              Download file
            </a>
          )}
        </div>
      </section>

      <aside className="border-border-custom bg-surface-subtle rounded-md border p-4">
        <p className="text-caption text-text-muted leading-relaxed">
          On-device processing via {REMOVAL_MODEL.name} ({REMOVAL_MODEL.license}). First run
          downloads a one-time model (~{REMOVAL_MODEL.approximateDownloadMb} MB, browser-cached).
          Your photo never leaves this device in v1.
        </p>
      </aside>
    </div>
  );
}
