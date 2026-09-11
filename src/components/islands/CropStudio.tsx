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

type Stage = "idle" | "ready" | "removing" | "removed";

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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo could not be read."));
    img.src = url;
  });
}

async function fitWithinCap(img: HTMLImageElement, cap: number): Promise<HTMLImageElement> {
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= cap) return img;
  const scale = cap / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return img;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return loadImage(canvas.toDataURL("image/png"));
}

export default function CropStudio() {
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("Choose a portrait to begin. JPEG or PNG, up to 8 MB.");
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<IdPresetId>("2x2");
  const [bg, setBg] = useState<BgOption>("white");
  const [format] = useState<string>("image/png");
  const [progress, setProgress] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState<CropBox | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const cutoutRef = useRef<HTMLImageElement | null>(null);
  const viewRef = useRef({ fitScale: 1 });
  const boxRef = useRef<CropBox | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  boxRef.current = box;

  // Hydration signal so E2E/render tests can wait for the island's event
  // handlers to be attached before driving the file input.
  useEffect(() => {
    rootRef.current?.setAttribute("data-crop-hydrated", "true");
  }, []);

  const announce = useCallback((message: string) => setStatus(message), []);

  // The canvas is a square stage (matching its CSS aspect-ratio) with the
  // portrait letterboxed inside it. Every screen coordinate flows through
  // fitScale so the overlay square is really square on screen — the same
  // geometry handleExport samples, so the preview never misleads.
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
    const fitScale = (stage / Math.max(img.naturalWidth, img.naturalHeight)) * zoom;
    const dw = img.naturalWidth * fitScale;
    const dh = img.naturalHeight * fitScale;
    const ox = (stage - dw) / 2;
    const oy = (stage - dh) / 2;
    viewRef.current.fitScale = fitScale;
    ctx.drawImage(img, ox, oy, dw, dh);
    const bx = ox + current.x * fitScale;
    const by = oy + current.y * fitScale;
    const bs = current.size * fitScale;
    ctx.fillStyle = "rgba(15, 12, 10, 0.55)";
    ctx.fillRect(0, 0, stage, by);
    ctx.fillRect(0, by + bs, stage, stage - by - bs);
    ctx.fillRect(0, by, bx, bs);
    ctx.fillRect(bx + bs, by, stage - bx - bs, bs);
    ctx.strokeStyle = "#f8f7f5";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bs, bs);
  }, [bg, zoom]);

  useEffect(() => {
    draw();
  }, [draw, box, presetId]);

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
        const side = Math.min(fitted.naturalWidth, fitted.naturalHeight);
        setBox({
          x: (fitted.naturalWidth - side) / 2,
          y: (fitted.naturalHeight - side) / 2,
          size: side,
        });
        setZoom(1);
        setStage("ready");
        announce("Portrait loaded. Remove the background, then drag the square to frame the face.");
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
    const startedAt = performance.now();
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(source.src, {
        progress: (key: string, current: number, total: number) => {
          if (key.startsWith("fetch:") && total > 0) {
            setProgress(Math.round((current / total) * 100));
          }
        },
      });
      cutoutRef.current = await loadImage(URL.createObjectURL(blob));
      setProgress(null);
      setStage("removed");
      draw();
      announce("Background removed on your device. Adjust the frame, then export.");
      try {
        await fetch("/api/crop/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "removal_succeeded",
            preset: presetId,
            ms: Math.round(performance.now() - startedAt),
          }),
        });
      } catch {
        // Telemetry is best-effort.
      }
    } catch {
      setProgress(null);
      setStage("ready");
      const message = "Background removal failed. You can still frame and export the original.";
      setError(message);
      announce(message);
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
      const nextX = Math.min(
        Math.max(0, origin.boxX + (event.clientX - origin.startX) * origin.scale),
        img.naturalWidth - current.size
      );
      const nextY = Math.min(
        Math.max(0, origin.boxY + (event.clientY - origin.startY) * origin.scale),
        img.naturalHeight - current.size
      );
      setBox({ ...current, x: nextX, y: nextY });
    },
    [dragging]
  );

  const endDrag = useCallback(() => setDragging(false), []);

  const onFrameKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const current = boxRef.current;
    const img = cutoutRef.current ?? sourceRef.current;
    if (!current || !img) return;
    const step = event.shiftKey ? 20 : 4;
    const next = { ...current };
    if (event.key === "ArrowLeft") next.x = Math.max(0, current.x - step);
    else if (event.key === "ArrowRight")
      next.x = Math.min(img.naturalWidth - current.size, current.x + step);
    else if (event.key === "ArrowUp") next.y = Math.max(0, current.y - step);
    else if (event.key === "ArrowDown")
      next.y = Math.min(img.naturalHeight - current.size, current.y + step);
    else return;
    event.preventDefault();
    setBox(next);
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
                aria-label="Crop frame. Drag to move the square, or focus and use arrow keys."
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
                  Preview zoom
                </label>
                <input
                  id="crop-zoom"
                  type="range"
                  min={1}
                  max={2.5}
                  step={0.05}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-full"
                />
                <span className="text-caption text-text-muted font-mono">{zoom.toFixed(2)}x</span>
              </div>
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
