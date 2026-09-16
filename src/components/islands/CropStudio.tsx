import React, { useCallback, useEffect, useRef, useState } from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import {
  BG_OPTIONS,
  BG_SWATCH,
  EXPORT,
  ID_PRESETS,
  REMOVAL_MODEL,
  type BgOption,
  type IdPresetId,
} from "../../lib/crop/presets";
import { validateExportOpts, validateFileMeta } from "../../lib/crop/validation";
import { getCropStampClass, type CropStageState } from "../../lib/crop/stamps";
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

/**
 * Pipeline state. `consent` sits between `ready` and `removing`: the
 * first-run model download never starts until the visitor confirms it
 * (spec 0009 §6), and the run token in `runTokenRef` lets them abort it.
 */
type Stage = "idle" | "ready" | "consent" | "removing" | "removed";

type BenchStageId = "source" | "frame" | "export";

/** Bench spine: exactly one working stage is open; the others rest as stamped rows. */

type ExportFormatId = (typeof EXPORT_FORMATS)[number]["id"];

/** Export formats with honest one-line disclosures (spec 0009 §5). */
const EXPORT_FORMATS = [
  { id: "image/png", label: "PNG", disclosure: "Keeps transparency." },
  { id: "image/jpeg", label: "JPEG", disclosure: "Flattened onto white." },
] as const;

/** Keyboard-free pan step shared by the four nudge buttons (spec 0009 §7). */
const NUDGE_STEP_PX = 4;

/** Shift-held pan step on the framing canvas. */
const NUDGE_LARGE_STEP_PX = 20;

/** Panning fires in bursts: the live message settles before announcing. */
const FRAME_ANNOUNCE_DEBOUNCE_MS = 600;

/** Persisted "model already cached" flag for the consent gate (spec 0009 §6). */
const MODEL_CONSENT_KEY = "crop-model-consent";

/**
 * Reads the persisted consent flag without trusting the store: a throwing
 * `localStorage` (private mode, quota) simply reports "not cached".
 *
 * @returns True when a previous removal succeeded on this device
 */
function readModelConsent(): boolean {
  try {
    return window.localStorage.getItem(MODEL_CONSENT_KEY) !== null;
  } catch {
    return false;
  }
}

/** Writes the consent flag; called only after a successful removal, so a failed download is disclosed again next time. */
function writeModelConsent(): void {
  try {
    window.localStorage.setItem(MODEL_CONSENT_KEY, new Date().toISOString());
  } catch {
    // A throwing store must never break the pipeline (spec 0009 §6).
  }
}

/** Exported square in natural image pixels; the fixed frame samples it. */
interface CropBox {
  x: number;
  y: number;
  size: number;
}

const BG_LABEL: Record<BgOption, string> = {
  white: "White",
  "light-blue": "Light blue",
  transparent: "Transparent",
};

export default function CropStudio() {
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("Choose a portrait to begin. JPEG or PNG, up to 8 MB.");
  const [error, setError] = useState<{ stage: BenchStageId; message: string } | null>(null);
  const [presetId, setPresetId] = useState<IdPresetId>("2x2");
  const [bg, setBg] = useState<BgOption>("white");
  const [format, setFormat] = useState<ExportFormatId>("image/png");
  const [progress, setProgress] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGuide, setShowGuide] = useState(true);
  const [box, setBox] = useState<CropBox | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<BenchStageId>("source");
  const [isReading, setIsReading] = useState(false);
  const [isModelCached, setIsModelCached] = useState(false);
  const [frameStatus, setFrameStatus] = useState("");
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
  const isReadingRef = useRef(false);
  const runTokenRef = useRef(0);
  const frameAnnounceTimerRef = useRef<number | null>(null);
  const dragDepthRef = useRef(0);
  boxRef.current = box;
  guideRef.current = showGuide;
  presetRef.current = presetId;

  // Hydration signal so E2E/render tests can wait for the island's event
  // handlers to be attached before driving the file input.
  useEffect(() => {
    rootRef.current?.setAttribute("data-crop-hydrated", "true");
    // Read the persisted consent flag after mount so SSR and the first
    // client render agree and hydration never mismatches.
    setIsModelCached(readModelConsent());
  }, []);

  const announce = useCallback((message: string) => setStatus(message), []);

  // Panning and zooming fire in bursts; the framing live region settles
  // before announcing so a screen reader hears one settled message instead
  // of one per pixel (spec 0009 §7). Cleared on unmount.
  const announceFrame = useCallback((message: string) => {
    setFrameStatus(message);
    if (frameAnnounceTimerRef.current !== null) {
      window.clearTimeout(frameAnnounceTimerRef.current);
    }
    frameAnnounceTimerRef.current = window.setTimeout(
      () => setFrameStatus(""),
      FRAME_ANNOUNCE_DEBOUNCE_MS
    );
  }, []);

  useEffect(
    () => () => {
      if (frameAnnounceTimerRef.current !== null) {
        window.clearTimeout(frameAnnounceTimerRef.current);
      }
    },
    []
  );

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

  const handleFile = useCallback(
    async (file: File | undefined) => {
      // One funnel for file input, drag-and-drop, paste, and camera
      // capture (spec 0009 §3). A busy flag keeps re-entrant intakes
      // honest while a photo is being decoded.
      if (!file || isReadingRef.current) return;
      isReadingRef.current = true;
      setIsReading(true);
      announce("Reading photo…");
      try {
        // Validate synchronously first so the feedback is instant and never
        // depends on image decoding (a .txt file never decodes to an image).
        const earlyCheck = validateFileMeta({
          mimeType: file.type,
          sizeBytes: file.size,
          widthPx: 1,
          heightPx: 1,
        });
        if (!earlyCheck.isValid && earlyCheck.error !== "The photo dimensions could not be read.") {
          const message = earlyCheck.error ?? "That photo could not be used.";
          // The alert belongs to the stage that produced it: intake errors
          // surface inside the source stage, expanded so they are seen
          // (spec 0009 §3).
          setError({ stage: "source", message });
          setExpanded("source");
          announce(message);
          setExportUrl(null);
          return;
        }
        setExportUrl(null);
        // A freshly chosen photo orphans any in-flight removal run: its
        // result belongs to the previous source and is discarded.
        runTokenRef.current += 1;
        setProgress(null);
        const url = URL.createObjectURL(file);
        const probe = await loadImage(url).catch(() => null);
        const check = validateFileMeta({
          mimeType: file.type,
          sizeBytes: file.size,
          widthPx: probe?.naturalWidth ?? 0,
          heightPx: probe?.naturalHeight ?? 0,
        });
        if (!check.isValid) {
          const message = check.error ?? "That photo could not be used.";
          setError({ stage: "source", message });
          setExpanded("source");
          announce(message);
          return;
        }
        if (!probe) {
          const message = "The photo could not be read. Try another file.";
          setError({ stage: "source", message });
          setExpanded("source");
          announce(message);
          return;
        }
        setError(null);
        const fitted = await fitWithinCap(probe, EXPORT.maxInputDimensionPx);
        sourceRef.current = fitted;
        cutoutRef.current = null;
        setBox(initialFrame(fitted.naturalWidth, fitted.naturalHeight));
        setZoom(1);
        setStage("ready");
        // Loaded means framed: the bench rests on the frame plate so the
        // sprawl preview regression cannot return unnoticed.
        setExpanded("frame");
        announce("Portrait loaded. Remove the background, then drag the photo to frame the face.");
      } catch {
        const message = "The photo could not be read. Try another file.";
        setError({ stage: "source", message });
        setExpanded("source");
        announce(message);
      } finally {
        isReadingRef.current = false;
        setIsReading(false);
      }
    },
    [announce]
  );

  // Clipboard paste intake: an image copied anywhere lands in the same
  // funnel while the source stage is the expanded one (spec 0009 §3).
  useEffect(() => {
    if (expanded !== "source") return;
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/")
      );
      if (!file) return;
      event.preventDefault();
      void handleFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [expanded, handleFile]);

  const runRemoval = useCallback(async () => {
    const source = sourceRef.current;
    if (!source) return;
    // Run token: bumping it orphans any in-flight run so its late result
    // is discarded instead of clobbering a newer pipeline state (spec
    // 0009 §6). The model library exposes no abort signal, so cancelling
    // means "ignore whatever this run produces".
    const runToken = ++runTokenRef.current;
    setError(null);
    setStage("removing");
    setProgress(0);
    announce("Downloading the on-device model on first run, then cutting out the portrait.");
    const result = await removeBackgroundInBrowser(source.src, (p: RemovalProgress) => {
      if (p.total > 0) setProgress(Math.round((p.current / p.total) * 100));
    });
    if (runTokenRef.current !== runToken) return;
    setProgress(null);
    if (!result.ok) {
      setStage("ready");
      // A removal failure belongs to the frame stage, where removal was
      // requested (spec 0009 §3).
      setError({ stage: "frame", message: result.error });
      announce(result.error);
      return;
    }
    cutoutRef.current = await loadImage(URL.createObjectURL(result.blob));
    if (runTokenRef.current !== runToken) return;
    // Persist the consent flag only after a real success: the model is now
    // browser-cached, so the next session can skip the disclosure. A failed
    // download is disclosed and confirmed again next time (spec 0009 §6).
    writeModelConsent();
    setIsModelCached(true);
    setStage("removed");
    // Removal completes inside the frame plate: the bench rests open on the
    // frame so the spine visibly stamps the cut-out result.
    setExpanded((previous) => (previous === "export" ? previous : "frame"));
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

  const handleRemove = useCallback(() => {
    if (!sourceRef.current) return;
    setError(null);
    if (isModelCached) {
      // The model is already cached on this device: no download, no gate.
      void runRemoval();
      return;
    }
    // First run: the ~40 MB fetch is disclosed and confirmed before it
    // starts (spec 0009 §6).
    setStage("consent");
    announce(
      `First run downloads the on-device model, about ${REMOVAL_MODEL.approximateDownloadMb} MB. Confirm below to continue.`
    );
  }, [announce, isModelCached, runRemoval]);

  const handleSkipRemoval = useCallback(() => {
    setStage("ready");
    announce("Skipped. The original photo still frames and exports.");
  }, [announce]);

  const handleAbortRemoval = useCallback(() => {
    runTokenRef.current += 1;
    setProgress(null);
    setStage("ready");
    announce("Removal cancelled. The original photo still frames and exports.");
  }, [announce]);

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
    [announceFrame]
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
    [announceFrame]
  );

  const handleExport = useCallback(async () => {
    const img = cutoutRef.current ?? sourceRef.current;
    const current = boxRef.current;
    if (!img || !current) return;
    const check = validateExportOpts({ preset: presetId, background: bg, format });
    if (!check.isValid) {
      // An export rejection belongs to the export stage (spec 0009 §3).
      setError({
        stage: "export",
        message: check.error ?? "That export combination is not supported.",
      });
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
    const url = out.toDataURL(format, 0.92);
    setExportUrl(url);
    // One action: the export itself hands the file to the browser (spec
    // 0009 §5). The visible affordance stays for a deliberate re-download.
    const link = document.createElement("a");
    link.href = url;
    link.download = `id-photo-${presetId}.${format === "image/png" ? "png" : "jpg"}`;
    link.click();
    link.remove();
    // Export stamps 03 as printed but leaves the bench where the visitor is:
    // auto-collapsing the frame plate would strand the canvas, zoom, and
    // guide controls mid-task. The collapsed export row mirrors the download
    // affordance so it stays reachable without opening the plate.
    announce(
      `Exported ${ID_PRESETS[presetId].label} at ${target} by ${target} pixels. The file is downloading.`
    );
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

  // A stale export must never masquerade as fresh: any framing or setting
  // change invalidates the prepared file (spec 0009 §5). The preview-only
  // face guide is deliberately excluded — it never touches export bytes.
  // React bails out when the state is already null.
  useEffect(() => {
    setExportUrl(null);
  }, [box, zoom, presetId, bg, format, stage]);

  const resetAll = useCallback(() => {
    runTokenRef.current += 1; // orphan any in-flight removal run
    sourceRef.current = null;
    cutoutRef.current = null;
    setBox(null);
    setExportUrl(null);
    setExpanded("source");
    setError(null);
    setProgress(null);
    setZoom(1);
    setStage("idle");
    announce("Cleared. Choose a portrait to begin. JPEG or PNG, up to 8 MB.");
    if (fileRef.current) fileRef.current.value = "";
  }, [announce]);

  const exportSize = ID_PRESETS[presetId].pixelsAt300Dpi[0];
  const canWork = stage !== "idle";
  const removalDone = stage === "removed";
  const exported = exportUrl !== null;
  const frameSummary = removalDone
    ? "Background removed — adjust the framing, then export."
    : canWork
      ? "Portrait loaded — frame the face, then export."
      : "No portrait yet. Choose a photo first.";
  const exportSummary = !canWork
    ? "Waiting for a photo — export unlocks after a portrait loads."
    : exported
      ? `Exported ${ID_PRESETS[presetId].label} at ${exportSize} by ${exportSize} pixels.`
      : `Exports the framed square at ${exportSize} by ${exportSize} pixels (${ID_PRESETS[presetId].label}).`;
  const STAGE_META: Record<BenchStageId, { ordinal: string; panelId: string }> = {
    source: { ordinal: "01 ·", panelId: "crop-panel-source" },
    frame: { ordinal: "02 ·", panelId: "crop-panel-frame" },
    export: { ordinal: "03 ·", panelId: "crop-panel-export" },
  };
  const STAGE_LABEL: Record<BenchStageId, string> = {
    source: "01 · Source portrait",
    frame: "02 · Frame the face",
    export: "03 · Export print file",
  };
  const toggleStage = (id: BenchStageId) => {
    if (id === expanded) return;
    // The bench is an exclusive accordion: exactly one plate is always
    // open, so the collapsed summary line can never overlap the panel.
    setExpanded(id);
    announce(`${STAGE_LABEL[id]} stage expanded.`);
  };

  /** Stamp for each bench stage, derived from the pipeline state. */
  const stageState = (id: BenchStageId): { state: CropStageState; label: string } => {
    if (id === "source") {
      if (!canWork) return { state: "waiting", label: "choose" };
      return { state: "done", label: "loaded" };
    }
    if (id === "frame") {
      if (!canWork) return { state: "locked", label: "waiting for a photo" };
      if (removalDone) return { state: "done", label: "cut out" };
      return { state: "current", label: "frame" };
    }
    if (!canWork) return { state: "locked", label: "waiting for a photo" };
    if (exported) return { state: "done", label: "printed" };
    return { state: "current", label: "export" };
  };

  const renderStageHead = (id: BenchStageId) => {
    const meta = STAGE_META[id];
    const current = stageState(id);
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            aria-hidden="true"
            className="text-micro text-text-muted font-mono font-bold tracking-[0.2em] uppercase"
          >
            {meta.ordinal}
          </p>
          <span className={getCropStampClass(current.state)}>{current.label}</span>
        </div>
        <h2 id={`crop-step-${id}`} className="font-heading text-h4 text-text mt-1 font-bold">
          <button
            type="button"
            onClick={() => toggleStage(id)}
            aria-expanded={expanded === id}
            aria-controls={meta.panelId}
            className="focus-visible:ring-focus focus-visible:ring-offset-bg w-full cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {STAGE_LABEL[id]}
          </button>
        </h2>
      </>
    );
  };

  return (
    <div id="crop-studio" ref={rootRef} className="space-y-6">
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="text-small text-text-muted leading-relaxed outline-none"
      >
        {status}
      </p>
      <section
        aria-labelledby="crop-step-source"
        className={`border-structural border-border-custom bg-surface relative scroll-mt-16 rounded-sm p-6 ${
          dragging ? "border-text" : ""
        }`}
        onDragEnter={(event) => {
          if (!Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === "file")) {
            return;
          }
          dragDepthRef.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepthRef.current = 0;
          setDragging(false);
          void handleFile(event.dataTransfer?.files?.[0]);
        }}
      >
        <span
          aria-hidden="true"
          className="border-border-custom bg-surface-subtle absolute -top-1.5 -left-1.5 size-3 rounded-[1px] border"
        />
        <span
          aria-hidden="true"
          className="border-border-custom bg-surface-subtle absolute -right-1.5 -bottom-1.5 size-3 rounded-[1px] border"
        />
        {renderStageHead("source")}
        {expanded !== "source" && (
          <p className="text-small text-text-muted mt-2 leading-relaxed">
            {canWork ? "Portrait loaded — stage 2 holds the framing tools." : status}
          </p>
        )}
        <div
          id="crop-panel-source"
          hidden={expanded !== "source"}
          className="animate-reveal motion-reduce:animate-none"
        >
          <p className="text-small text-text-muted mt-2 leading-relaxed">
            JPEG or PNG up to 8 MB. The file stays on this device — nothing is uploaded. You can
            also drag a photo here, paste one from the clipboard, or use the camera.
          </p>
          {dragging && (
            <p className="text-small text-text mt-3 font-mono">Drop the photo to load it.</p>
          )}
          {isReading && (
            <p className="text-small text-text-muted mt-3 font-mono" role="status">
              Reading photo…
            </p>
          )}
          {error && error.stage === "source" && (
            <p
              role="alert"
              className="text-small border-structural border-text bg-surface-subtle text-text mt-3 flex items-center gap-2 rounded-md px-3 py-2"
            >
              <DoodleIcon name="interface/caution" className="size-3.5 shrink-0" />
              {error.message}
            </p>
          )}
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
            <input
              id="crop-camera"
              type="file"
              accept="image/*"
              capture="user"
              className="sr-only"
              onChange={(event) => {
                const input = event.target as HTMLInputElement;
                void handleFile(input.files?.[0]);
                input.value = "";
              }}
            />
            <label
              htmlFor="crop-camera"
              className="bg-surface text-text border-structural border-border-custom inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <DoodleIcon name="interface/photo" className="size-4" />
              Camera
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
        </div>
      </section>

      <div className="bg-border-custom h-[var(--stroke-hatch)] w-full" aria-hidden="true" />

      <section
        aria-labelledby="crop-step-frame"
        className="border-structural border-border-custom bg-surface relative scroll-mt-16 rounded-sm p-6"
      >
        <span
          aria-hidden="true"
          className="border-border-custom bg-surface-subtle absolute -top-1.5 -left-1.5 size-3 rounded-[1px] border"
        />
        <span
          aria-hidden="true"
          className="border-border-custom bg-surface-subtle absolute -right-1.5 -bottom-1.5 size-3 rounded-[1px] border"
        />
        {renderStageHead("frame")}
        {/* The E2E contract asserts this exact empty-state line alongside the
            three headings, so the collapsed row keeps it visible. */}
        {expanded !== "frame" && (
          <p className="text-small text-text-muted mt-2 leading-relaxed">{frameSummary}</p>
        )}
        <div
          id="crop-panel-frame"
          hidden={expanded !== "frame"}
          className="animate-reveal motion-reduce:animate-none"
        >
          <p
            id="crop-frame-instructions"
            className="text-small text-text-muted mt-2 leading-relaxed"
          >
            Drag the photo and zoom it under the fixed square until the face fits the guide. The
            exported file matches the framed view exactly.
          </p>
          {error && error.stage === "frame" && (
            <p
              role="alert"
              className="text-small border-structural border-text bg-surface-subtle text-text mt-3 flex items-center gap-2 rounded-md px-3 py-2"
            >
              <DoodleIcon name="interface/caution" className="size-3.5 shrink-0" />
              {error.message}
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <canvas
                ref={canvasRef}
                className="transparency-checkerboard border-border-custom focus-visible:ring-focus focus-visible:ring-offset-bg w-full cursor-move touch-none rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ aspectRatio: "1 / 1" }}
                role="group"
                aria-label="Crop frame"
                aria-describedby="crop-frame-instructions crop-frame-readout"
                tabIndex={0}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onFrameKeyDown}
              />
              <p
                id="crop-frame-readout"
                className="text-micro text-text-muted mt-2 font-mono tracking-wider"
              >
                {box
                  ? `Sample origin ${box.x} by ${box.y} px — ${box.size} px square — zoom ${zoom.toFixed(2)}x`
                  : "No photo yet."}
              </p>
              {/* Pan/zoom announcements settle here, separate from the
                    static instructions and the page-level status line. */}
              <p role="status" className="sr-only">
                {frameStatus}
              </p>
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
              <div
                className="mt-2 flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Nudge the photo"
              >
                <span className="text-caption text-text-muted font-mono font-semibold tracking-wider uppercase">
                  Nudge
                </span>
                <button
                  type="button"
                  onClick={() => panBy(NUDGE_STEP_PX, 0)}
                  className="bg-surface text-text border-structural border-border-custom text-caption inline-flex h-8 cursor-pointer items-center rounded-md border px-3 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
                >
                  Left
                </button>
                <button
                  type="button"
                  onClick={() => panBy(-NUDGE_STEP_PX, 0)}
                  className="bg-surface text-text border-structural border-border-custom text-caption inline-flex h-8 cursor-pointer items-center rounded-md border px-3 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
                >
                  Right
                </button>
                <button
                  type="button"
                  onClick={() => panBy(0, NUDGE_STEP_PX)}
                  className="bg-surface text-text border-structural border-border-custom text-caption inline-flex h-8 cursor-pointer items-center rounded-md border px-3 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => panBy(0, -NUDGE_STEP_PX)}
                  className="bg-surface text-text border-structural border-border-custom text-caption inline-flex h-8 cursor-pointer items-center rounded-md border px-3 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
                >
                  Down
                </button>
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
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(ID_PRESETS) as IdPresetId[]).map((id) => (
                    <label
                      key={id}
                      className={`border-structural cursor-pointer rounded-md border px-3 py-2 text-left transition-[transform,box-shadow] duration-200 ${
                        presetId === id
                          ? "bg-primary text-bg border-text"
                          : "bg-surface-subtle text-text border-border-custom hover:shadow-[2px_2px_0_var(--color-text)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="crop-preset"
                        value={id}
                        checked={presetId === id}
                        onChange={() => setPresetId(id)}
                        className="sr-only"
                      />
                      <span className="text-small block font-bold">{ID_PRESETS[id].label}</span>
                      <span className="text-caption block font-mono">
                        {ID_PRESETS[id].pixelsAt300Dpi[0]}px
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-caption text-text font-mono font-bold tracking-wider uppercase">
                  Background
                </legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {BG_OPTIONS.map((option) => (
                    <label
                      key={option}
                      className={`border-structural flex cursor-pointer flex-col items-center gap-1.5 rounded-md border px-2 py-2 transition-[transform,box-shadow] duration-200 ${
                        bg === option
                          ? "border-text shadow-[2px_2px_0_var(--color-text)]"
                          : "border-border-custom hover:shadow-[2px_2px_0_var(--color-text)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="crop-bg"
                        value={option}
                        checked={bg === option}
                        onChange={() => setBg(option)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="border-border-custom block h-8 w-full rounded-sm border"
                        style={{ backgroundColor: BG_SWATCH[option] }}
                      />
                      <span className="text-caption text-text font-medium">{BG_LABEL[option]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-2">
                {stage === "consent" && (
                  <div
                    role="group"
                    aria-label="Model download consent"
                    className="border-structural border-text bg-surface-subtle rounded-md border p-4"
                  >
                    <p className="text-small text-text leading-relaxed">
                      Before any cut-out happens, this tool downloads its on-device model once:{" "}
                      {REMOVAL_MODEL.name} ({REMOVAL_MODEL.license}), about{" "}
                      {REMOVAL_MODEL.approximateDownloadMb} MB over the network. It runs entirely in
                      this browser ({REMOVAL_MODEL.runtime}) and is cached for next time. Your photo
                      never leaves the device — the server only ever receives anonymous counts.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void runRemoval()}
                        className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
                      >
                        <DoodleIcon name="interface/download" className="size-4" />
                        Download model and cut out
                      </button>
                      <button
                        type="button"
                        onClick={handleSkipRemoval}
                        className="bg-surface text-text border-structural border-border-custom inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
                      >
                        Skip removal
                      </button>
                    </div>
                  </div>
                )}
                {stage !== "consent" && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={!canWork || stage === "removing"}
                    className="bg-primary text-bg border-structural border-text inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <DoodleIcon name="files/file-image" className="size-4" />
                    {stage === "removing"
                      ? "Removing background…"
                      : stage === "removed"
                        ? "Remove again"
                        : "Remove background"}
                  </button>
                )}
                {!canWork && (
                  <p className="text-caption text-text-muted leading-relaxed">
                    Loads with a portrait in stage 2 — waiting for a photo.
                  </p>
                )}
                {stage === "removing" && (
                  <>
                    {progress !== null && (
                      <p className="text-caption text-text-muted font-mono">Model {progress}%</p>
                    )}
                    <button
                      type="button"
                      onClick={handleAbortRemoval}
                      className="bg-surface text-text border-structural border-border-custom inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
                    >
                      Cancel removal
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="bg-border-custom h-[var(--stroke-hatch)] w-full" aria-hidden="true" />

      <section
        aria-labelledby="crop-step-export"
        className="border-structural border-border-custom bg-surface relative scroll-mt-16 rounded-sm p-6"
      >
        <span
          aria-hidden="true"
          className="border-border-custom bg-surface-subtle absolute -top-1.5 -left-1.5 size-3 rounded-[1px] border"
        />
        <span
          aria-hidden="true"
          className="border-border-custom bg-surface-subtle absolute -right-1.5 -bottom-1.5 size-3 rounded-[1px] border"
        />
        {renderStageHead("export")}
        {expanded !== "export" && (
          <div className="mt-2 space-y-3">
            <p className="text-small text-text-muted leading-relaxed">{exportSummary}</p>
            {!canWork && (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-md px-5 font-sans font-semibold opacity-50"
              >
                <DoodleIcon name="interface/download" className="size-4" />
                Export {presetId} photo
              </button>
            )}
            {canWork && (
              <button
                type="button"
                onClick={() => void handleExport()}
                className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                <DoodleIcon name="interface/download" className="size-4" />
                Export {presetId} photo
              </button>
            )}
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
        )}
        <div
          id="crop-panel-export"
          hidden={expanded !== "export"}
          className="animate-reveal motion-reduce:animate-none"
        >
          <p className="text-small text-text-muted mt-2 leading-relaxed">{exportSummary}</p>
          {error && error.stage === "export" && (
            <p
              role="alert"
              className="text-small border-structural border-text bg-surface-subtle text-text mt-3 flex items-center gap-2 rounded-md px-3 py-2"
            >
              <DoodleIcon name="interface/caution" className="size-3.5 shrink-0" />
              {error.message}
            </p>
          )}
          {/* The former dead format state is a real control now: PNG keeps
              transparency, JPEG flattens it — labelled honestly (spec 0009
              §5). Changing it invalidates any prepared download. */}
          <fieldset className="mt-4">
            <legend className="text-caption text-text font-mono font-bold tracking-wider uppercase">
              File format
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {EXPORT_FORMATS.map((option) => (
                <label
                  key={option.id}
                  className={`border-structural cursor-pointer rounded-md border px-3 py-2 text-left transition-[transform,box-shadow] duration-200 ${
                    format === option.id
                      ? "bg-primary text-bg border-text"
                      : "bg-surface-subtle text-text border-border-custom hover:shadow-[2px_2px_0_var(--color-text)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="crop-format"
                    value={option.id}
                    checked={format === option.id}
                    onChange={() => setFormat(option.id)}
                    className="sr-only"
                  />
                  <span className="text-small block font-bold">{option.label}</span>
                  <span className="text-caption block">{option.disclosure}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-caption text-text-muted mt-3 leading-relaxed">
            Print note: {ID_PRESETS[presetId].label} prints at{" "}
            {ID_PRESETS[presetId].pixelsAt300Dpi[0]} by {ID_PRESETS[presetId].pixelsAt300Dpi[1]}{" "}
            pixels ({ID_PRESETS[presetId].inches[0]} by {ID_PRESETS[presetId].inches[1]} in at{" "}
            {EXPORT.printDpi} DPI).
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
            {/* The download affordance renders in exactly one DOM location at
                a time (here when open, the collapsed row when resting) so the
                E2E `a[download]` locator never resolves to two nodes. */}
            {exportUrl && expanded === "export" && (
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
        </div>
      </section>

      <aside className="border-border-custom bg-surface-subtle rounded-md border p-4">
        <p className="text-caption text-text-muted leading-relaxed">
          On-device processing via {REMOVAL_MODEL.name} ({REMOVAL_MODEL.license}). The first run
          downloads a one-time model (~{REMOVAL_MODEL.approximateDownloadMb} MB, browser-cached) —
          only after you confirm, and you can cancel while it runs. Your photo never leaves this
          device.
        </p>
      </aside>
    </div>
  );
}
