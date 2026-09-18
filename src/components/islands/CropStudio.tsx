import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BG_SWATCH,
  EXPORT,
  ID_PRESETS,
  REMOVAL_MODEL,
  type BgOption,
  type IdPresetId,
} from "../../lib/crop/presets";
import { validateExportOpts, validateFileMeta } from "../../lib/crop/validation";
import { initialFrame } from "../../lib/crop/geometry";
import {
  fitWithinCap,
  loadImage,
  removeBackgroundInBrowser,
  type RemovalProgress,
} from "../../lib/crop/removal";
import type { BenchStageId, CropBox, CropError, Stage, StageStateResult } from "../crop/types";
import {
  FRAME_ANNOUNCE_DEBOUNCE_MS,
  STAGE_LABEL,
  readModelConsent,
  writeModelConsent,
  type ExportFormatId,
} from "../crop/constants";
import { useCropCanvas } from "../crop/useCropCanvas";
import { SourceStage } from "../crop/SourceStage";
import { FrameStage } from "../crop/FrameStage";
import { ExportStage } from "../crop/ExportStage";

export default function CropStudio() {
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("Choose a portrait to begin. JPEG or PNG, up to 8 MB.");
  const [error, setError] = useState<CropError | null>(null);
  const [presetId, setPresetId] = useState<IdPresetId>("2x2");
  const [bg, setBg] = useState<BgOption>("white");
  const [format, setFormat] = useState<ExportFormatId>("image/png");
  const [progress, setProgress] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGuide, setShowGuide] = useState(true);
  const [box, setBox] = useState<CropBox | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<BenchStageId>("source");
  const [isReading, setIsReading] = useState(false);
  const [isModelCached, setIsModelCached] = useState(false);
  const [frameStatus, setFrameStatus] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const cutoutRef = useRef<HTMLImageElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const isReadingRef = useRef(false);
  const runTokenRef = useRef(0);
  const frameAnnounceTimerRef = useRef<number | null>(null);

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

  const {
    canvasRef,
    draw,
    onPointerDown,
    onPointerMove,
    endDrag,
    onFrameKeyDown,
    panBy,
    onZoomChange,
  } = useCropCanvas({
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
  });

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

  const handleExport = useCallback(async () => {
    const img = cutoutRef.current ?? sourceRef.current;
    const current = box;
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
  }, [announce, bg, box, format, presetId]);

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

  const toggleStage = (id: BenchStageId) => {
    if (id === expanded) return;
    // The bench is an exclusive accordion: exactly one plate is always
    // open, so the collapsed summary line can never overlap the panel.
    setExpanded(id);
    announce(`${STAGE_LABEL[id]} stage expanded.`);
  };

  /** Stamp for each bench stage, derived from the pipeline state. */
  const stageState = (id: BenchStageId): StageStateResult => {
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

      <SourceStage
        expanded={expanded === "source"}
        onToggle={toggleStage}
        stageState={stageState("source")}
        canWork={canWork}
        status={status}
        isReading={isReading}
        error={error}
        fileRef={fileRef}
        handleFile={handleFile}
        resetAll={resetAll}
      />

      <div className="bg-border-custom h-[var(--stroke-hatch)] w-full" aria-hidden="true" />

      <FrameStage
        expanded={expanded === "frame"}
        onToggle={toggleStage}
        stageState={stageState("frame")}
        frameSummary={frameSummary}
        error={error}
        canvasRef={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        endDrag={endDrag}
        onFrameKeyDown={onFrameKeyDown}
        box={box}
        zoom={zoom}
        exportSize={exportSize}
        frameStatus={frameStatus}
        onZoomChange={onZoomChange}
        panBy={panBy}
        showGuide={showGuide}
        setShowGuide={setShowGuide}
        presetId={presetId}
        setPresetId={setPresetId}
        bg={bg}
        setBg={setBg}
        stage={stage}
        canWork={canWork}
        progress={progress}
        runRemoval={runRemoval}
        handleRemove={handleRemove}
        handleSkipRemoval={handleSkipRemoval}
        handleAbortRemoval={handleAbortRemoval}
      />

      <div className="bg-border-custom h-[var(--stroke-hatch)] w-full" aria-hidden="true" />

      <ExportStage
        expanded={expanded === "export"}
        onToggle={toggleStage}
        stageState={stageState("export")}
        exportSummary={exportSummary}
        canWork={canWork}
        error={error}
        presetId={presetId}
        format={format}
        setFormat={setFormat}
        exportUrl={exportUrl}
        handleExport={handleExport}
      />

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
