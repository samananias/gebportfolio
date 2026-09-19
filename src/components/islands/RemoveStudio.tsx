import React, { useCallback, useEffect, useRef, useState } from "react";
import { EXPORT, REMOVAL_MODEL } from "../../lib/crop/presets";
import { validateFileMeta } from "../../lib/crop/validation";
import {
  fitWithinCap,
  loadImage,
  removeBackgroundInBrowser,
  type RemovalProgress,
  type RemovalResult,
} from "../../lib/crop/removal";
import type { RemovalPhase } from "../crop/types";
// The consent flag is shared on purpose: both tools download the same
// on-device model, so one cached flag is the truthful state (spec 0010 §6).
import { readModelConsent, writeModelConsent } from "../crop/constants";
import { STAGE_LABEL } from "../remove/constants";
import { SourceStage } from "../remove/SourceStage";
import { RemoveStage } from "../remove/RemoveStage";
import { DownloadStage, type DownloadInfo } from "../remove/DownloadStage";
import type {
  RemoveError,
  RemovePipelineStage,
  RemoveStageId,
  StageStateResult,
} from "../remove/types";

/**
 * Removal-only React island for `/remove-background`, composed as the same
 * progressive bench as `/crop` (spec 0010): one plate open at a time, state
 * stamps, one intake funnel, consent-first removal with abort, and an
 * honest one-action download. Intentionally free of crop concepts — no
 * frame, face guide, preset radios, zoom, or canvas (Feature 3 of
 * docs/plans/0007-image-editing-improvements.md, preserved by spec 0010).
 */
export default function RemoveStudio() {
  const [stage, setStage] = useState<RemovePipelineStage>("idle");
  const [status, setStatus] = useState(
    "Choose a photo to remove its background. JPEG or PNG, up to 8 MB."
  );
  const [error, setError] = useState<RemoveError | null>(null);
  const [expanded, setExpanded] = useState<RemoveStageId>("source");
  const [progress, setProgress] = useState<number | null>(null);
  const [removalPhase, setRemovalPhase] = useState<RemovalPhase | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isModelCached, setIsModelCached] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const originalRef = useRef<HTMLImageElement | null>(null);
  const cutoutRef = useRef<HTMLImageElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const isReadingRef = useRef(false);
  const runTokenRef = useRef(0);
  const removalPhaseRef = useRef<RemovalPhase | null>(null);

  // Hydration signal so E2E/render tests can wait for the island's event
  // handlers to be attached before driving the file input.
  useEffect(() => {
    rootRef.current?.setAttribute("data-remove-hydrated", "true");
    // Read the persisted consent flag after mount so SSR and the first
    // client render agree and hydration never mismatches.
    setIsModelCached(readModelConsent());
  }, []);

  const announce = useCallback((message: string) => setStatus(message), []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      // One funnel for file input, drag-and-drop, paste, and camera capture
      // (spec 0010 Feature 3). A busy flag keeps re-entrant intakes honest.
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
          // surface inside the source stage, expanded so they are seen.
          setError({ stage: "source", message });
          setExpanded("source");
          announce(message);
          return;
        }
        // A freshly chosen photo orphans any in-flight removal run: its
        // result belongs to the previous source and is discarded.
        runTokenRef.current += 1;
        setDownloadUrl(null);
        setDownloadInfo(null);
        setProgress(null);
        setRemovalPhase(null);
        removalPhaseRef.current = null;
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
        originalRef.current = fitted;
        cutoutRef.current = null;
        setStage("ready");
        // Loaded means removal: the bench rests on the remove plate so the
        // compare and controls are the next thing the visitor sees.
        setExpanded("remove");
        announce("Photo loaded. Run background removal to cut out the subject.");
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
  // funnel while the source stage is the expanded one.
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
    const source = originalRef.current;
    if (!source) return;
    // Run token: bumping it orphans any in-flight run so its late result is
    // discarded instead of clobbering a newer pipeline state. The model
    // library exposes no abort signal, so cancelling means "ignore whatever
    // this run produces".
    const runToken = ++runTokenRef.current;
    setError(null);
    setStage("removing");
    setProgress(0);
    setRemovalPhase("download");
    removalPhaseRef.current = "download";
    announce("Downloading the on-device model on first run, then cutting out the subject.");
    const result = await removeBackgroundInBrowser(source.src, (p: RemovalProgress) => {
      if (p.phase === "fetch") {
        // Percent of the current model file: real chunk counts, no invention.
        if (p.total > 0) setProgress(Math.round((p.current / p.total) * 100));
      } else if (removalPhaseRef.current !== "process") {
        // The download finished and on-device inference is running. The
        // pipeline reports no compute counts, so the honest signal is the
        // phase flip itself — never a fabricated percentage.
        removalPhaseRef.current = "process";
        setRemovalPhase("process");
        announce("Cutting out the subject on your device.");
      }
    });
    if (runTokenRef.current !== runToken) return;
    setProgress(null);
    setRemovalPhase(null);
    removalPhaseRef.current = null;
    if (!result.ok) {
      setStage("ready");
      // A removal failure belongs to the remove stage, where removal was
      // requested.
      setError({ stage: "remove", message: result.error });
      announce(result.error);
      return;
    }
    cutoutRef.current = await loadImage(URL.createObjectURL(result.blob));
    if (runTokenRef.current !== runToken) return;
    // Persist the consent flag only after a real success: the model is now
    // browser-cached, so the next session can skip the disclosure. A failed
    // download is disclosed and confirmed again next time.
    writeModelConsent();
    setIsModelCached(true);
    setStage("removed");
    announce("Background removed on your device. The result keeps transparency.");
    await telemetryRemoval(result);
  }, [announce]);

  const handleRemove = useCallback(() => {
    if (!originalRef.current) return;
    setError(null);
    if (isModelCached) {
      // The model is already cached on this device: no download, no gate.
      void runRemoval();
      return;
    }
    // First run: the ~40 MB fetch is disclosed and confirmed before it starts.
    setStage("consent");
    announce(
      `First run downloads the on-device model, about ${REMOVAL_MODEL.approximateDownloadMb} MB. Confirm below to continue.`
    );
  }, [announce, isModelCached, runRemoval]);

  const handleDeclineConsent = useCallback(() => {
    setStage("ready");
    announce("Not now. The photo stays loaded — removal can start any time.");
  }, [announce]);

  const handleAbortRemoval = useCallback(() => {
    runTokenRef.current += 1;
    setProgress(null);
    setRemovalPhase(null);
    removalPhaseRef.current = null;
    setStage("ready");
    announce("Removal cancelled. The original photo stays loaded.");
  }, [announce]);

  const handleDownload = useCallback(() => {
    const cutout = cutoutRef.current;
    if (!cutout) return;
    const canvas = document.createElement("canvas");
    canvas.width = cutout.naturalWidth;
    canvas.height = cutout.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The cutout keeps its alpha channel; the canvas converts it to a PNG
    // blob directly so nothing flattens it.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cutout, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/png");
    setDownloadUrl(url);
    setDownloadInfo({ width: canvas.width, height: canvas.height });
    // One action: the download itself hands the file to the browser (spec
    // 0010 Feature 5). The visible affordance stays for a re-download.
    const link = document.createElement("a");
    link.href = url;
    link.download = `cutout-${canvas.width}x${canvas.height}.png`;
    link.click();
    link.remove();
    announce(
      `Result ready at ${canvas.width} by ${canvas.height} pixels. The file is downloading.`
    );
    statusRef.current?.focus();
  }, [announce]);

  // A stale download must never masquerade as fresh: any pipeline move away
  // from "removed" (new photo, new run, reset) invalidates the prepared file.
  useEffect(() => {
    if (stage === "removed") return;
    setDownloadUrl(null);
    setDownloadInfo(null);
  }, [stage]);

  const resetAll = useCallback(() => {
    runTokenRef.current += 1; // orphan any in-flight removal run
    originalRef.current = null;
    cutoutRef.current = null;
    setDownloadUrl(null);
    setDownloadInfo(null);
    setError(null);
    setProgress(null);
    setRemovalPhase(null);
    removalPhaseRef.current = null;
    setExpanded("source");
    setStage("idle");
    announce("Cleared. Choose a photo to remove its background.");
    if (fileRef.current) fileRef.current.value = "";
  }, [announce]);

  const canWork =
    stage === "ready" || stage === "consent" || stage === "removing" || stage === "removed";
  const removalDone = stage === "removed";
  const downloaded = downloadUrl !== null;

  const toggleStage = (id: RemoveStageId) => {
    if (id === expanded) return;
    // The bench is an exclusive accordion: exactly one plate is always open,
    // so the collapsed summary line can never overlap the panel.
    setExpanded(id);
    announce(`${STAGE_LABEL[id]} stage expanded.`);
  };

  /** Stamp for each bench plate, derived from the pipeline state. */
  const stageState = (id: RemoveStageId): StageStateResult => {
    if (id === "source") {
      if (!canWork) return { state: "waiting", label: "choose" };
      return { state: "done", label: "loaded" };
    }
    if (id === "remove") {
      if (!canWork) return { state: "locked", label: "waiting for a photo" };
      if (stage === "removing") return { state: "current", label: "removing" };
      if (removalDone) return { state: "done", label: "cut out" };
      return { state: "current", label: "remove" };
    }
    if (!canWork) return { state: "locked", label: "waiting for a photo" };
    if (downloaded) return { state: "done", label: "saved" };
    if (removalDone) return { state: "current", label: "download" };
    return { state: "locked", label: "waiting for a cutout" };
  };

  const removeSummary = !canWork
    ? "No photo yet. Choose a photo first."
    : removalDone
      ? "Background removed — stage 3 hands you the cutout."
      : "Original beside result — run removal to cut out the subject.";
  const downloadSummary = !canWork
    ? "Waiting for a photo — download unlocks after a cutout exists."
    : downloaded && downloadInfo
      ? `Cutout ready at ${downloadInfo.width} by ${downloadInfo.height} pixels.`
      : removalDone
        ? "Prepares the transparent PNG and hands it to your browser."
        : "Waiting for a cutout — download unlocks after stage 2 succeeds.";

  return (
    <div id="remove-studio" ref={rootRef} className="space-y-6">
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

      <RemoveStage
        expanded={expanded === "remove"}
        onToggle={toggleStage}
        stageState={stageState("remove")}
        summary={removeSummary}
        canWork={canWork}
        stage={stage}
        error={error}
        progress={progress}
        removalPhase={removalPhase}
        originalSrc={originalRef.current?.src ?? null}
        cutoutSrc={cutoutRef.current?.src ?? null}
        handleRemove={handleRemove}
        runRemoval={runRemoval}
        handleDeclineConsent={handleDeclineConsent}
        handleAbortRemoval={handleAbortRemoval}
        onStartOver={resetAll}
      />

      <div className="bg-border-custom h-[var(--stroke-hatch)] w-full" aria-hidden="true" />

      <DownloadStage
        expanded={expanded === "download"}
        onToggle={toggleStage}
        stageState={stageState("download")}
        summary={downloadSummary}
        canDownload={removalDone}
        downloadUrl={downloadUrl}
        downloadInfo={downloadInfo}
        handleDownload={handleDownload}
        canWork={canWork}
        onStartOver={resetAll}
      />

      <aside className="border-border-custom bg-surface-subtle rounded-md border p-4">
        <p className="text-caption text-text-muted leading-relaxed">
          On-device processing via {REMOVAL_MODEL.name} ({REMOVAL_MODEL.license}). The first run
          downloads a one-time model (~{REMOVAL_MODEL.approximateDownloadMb} MB, browser-cached) —
          only after you confirm, and you can cancel while it runs. Your photo never leaves this
          device.
        </p>
        <p className="text-caption text-text-muted mt-2 leading-relaxed">
          Need a framed ID photo instead? Use the{" "}
          <a href="/crop" className="text-primary underline underline-offset-2">
            ID Photo Studio
          </a>
          .
        </p>
      </aside>
    </div>
  );
}

let telemetrySent = false;

async function telemetryRemoval(result: RemovalResult): Promise<void> {
  if (telemetrySent || !result.ok) return;
  telemetrySent = true;
  try {
    await fetch("/api/crop/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "removal_succeeded", preset: "2x2", ms: result.ms }),
    });
  } catch {
    // Telemetry is best-effort.
  }
  telemetrySent = false;
}
