import React, { useCallback, useEffect, useRef, useState } from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import { EXPORT, REMOVAL_MODEL } from "../../lib/crop/presets";
import { validateFileMeta } from "../../lib/crop/validation";
import {
  fitWithinCap,
  loadImage,
  removeBackgroundInBrowser,
  type RemovalProgress,
  type RemovalResult,
} from "../../lib/crop/removal";

type Stage = "idle" | "ready" | "removing" | "removed";

/**
 * Removal-only React island for `/remove-background`.
 *
 * Intentionally free of crop concepts: no frame, face guide, preset
 * radios, zoom, or size controls (Feature 3 of
 * docs/plans/0007-image-editing-improvements.md). Upload, remove on a
 * transparent input, compare original versus result, download the PNG.
 */
export default function RemoveStudio() {
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState(
    "Choose a photo to remove its background. JPEG or PNG, up to 8 MB."
  );
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const originalRef = useRef<HTMLImageElement | null>(null);
  const cutoutRef = useRef<HTMLImageElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    rootRef.current?.setAttribute("data-remove-hydrated", "true");
  }, []);

  const announce = useCallback((message: string) => setStatus(message), []);
  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const earlyCheck = validateFileMeta({
        mimeType: file.type,
        sizeBytes: file.size,
        widthPx: 1,
        heightPx: 1,
      });
      if (!earlyCheck.isValid && earlyCheck.error !== "The photo dimensions could not be read.") {
        setError(earlyCheck.error);
        announce(earlyCheck.error ?? "That photo could not be used.");
        return;
      }
      setError(null);
      setDownloadUrl(null);
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
        originalRef.current = await fitWithinCap(probe, EXPORT.maxInputDimensionPx);
        cutoutRef.current = null;
        setStage("ready");
        announce("Photo loaded. Run background removal to cut out the subject.");
      } catch {
        setError("The photo could not be read. Try another file.");
      }
    },
    [announce]
  );

  const onProgress = useCallback((p: RemovalProgress) => {
    if (p.total > 0) setProgress(Math.round((p.current / p.total) * 100));
  }, []);

  const handleRemove = useCallback(async () => {
    const source = originalRef.current;
    if (!source) return;
    setError(null);
    setStage("removing");
    setProgress(0);
    announce("Downloading the on-device model on first run, then cutting out the subject.");
    const result = await removeBackgroundInBrowser(source.src, onProgress);
    setProgress(null);
    if (!result.ok) {
      setStage("ready");
      setError(result.error);
      announce(result.error);
      return;
    }
    cutoutRef.current = await loadImage(URL.createObjectURL(result.blob));
    setStage("removed");
    announce("Background removed on your device. The result keeps transparency.");
    await telemetryRemoval(result);
  }, [announce, onProgress]);
  const handleDownload = useCallback(() => {
    const cutout = cutoutRef.current;
    if (!cutout) return;
    const canvas = document.createElement("canvas");
    canvas.width = cutout.naturalWidth;
    canvas.height = cutout.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The cutout keeps its alpha channel; the canvas converts it to a
    // PNG blob directly so nothing flattens it.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cutout, 0, 0, canvas.width, canvas.height);
    setDownloadUrl(canvas.toDataURL("image/png"));
    announce(`Result ready at ${canvas.width} by ${canvas.height} pixels.`);
    statusRef.current?.focus();
  }, [announce]);

  const resetAll = useCallback(() => {
    originalRef.current = null;
    cutoutRef.current = null;
    setDownloadUrl(null);
    setError(null);
    setProgress(null);
    setStage("idle");
    announce("Cleared. Choose a photo to remove its background.");
    if (fileRef.current) fileRef.current.value = "";
  }, [announce]);
  return (
    <div id="remove-studio" ref={rootRef} className="space-y-8">
      <section
        aria-labelledby="remove-step-source"
        className="border-structural border-border-custom bg-surface rounded-sm p-6"
      >
        <h2 id="remove-step-source" className="font-display text-h4 text-text font-bold">
          01 · Source photo
        </h2>
        <p className="text-small text-text-muted mt-2 leading-relaxed">
          JPEG or PNG up to 8 MB. The file stays on this device — nothing is uploaded.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            id="remove-file"
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(event) => {
              const input = event.target as HTMLInputElement;
              void handleFile(input.files?.[0]);
              input.value = "";
            }}
          />
          <label
            htmlFor="remove-file"
            className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <DoodleIcon name="interface/upload" className="size-4" />
            Choose photo
          </label>
          {stage !== "idle" && (
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
        aria-labelledby="remove-step-compare"
        className="border-structural border-border-custom bg-surface rounded-sm p-6"
      >
        <h2 id="remove-step-compare" className="font-display text-h4 text-text font-bold">
          02 · Compare
        </h2>
        <p className="text-small text-text-muted mt-2 leading-relaxed">
          Original on the left, background removed on the right. Any JPEG replaces transparency with
          white — PNG exports keep it.
        </p>
        {stage === "idle" ? (
          <div className="border-border-custom bg-surface-subtle mt-4 flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-12 text-center">
            <DoodleIcon name="interface/photo" className="text-text-muted size-8" />
            <p className="text-small text-text-muted">No photo yet. Choose a photo first.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 items-stretch gap-4">
            <div className="bg-surface-subtle border-border-custom rounded-md border p-3">
              <span className="text-caption text-text-muted block font-mono font-bold tracking-wider uppercase">
                Original
              </span>
              {originalRef.current && (
                <img
                  src={originalRef.current.src}
                  alt="The uploaded photo before background removal"
                  className="border-border-custom mt-2 w-full rounded-md border"
                />
              )}
            </div>
            <div className="bg-surface-subtle border-border-custom rounded-md border p-3">
              <span className="text-caption text-text-muted block font-mono font-bold tracking-wider uppercase">
                Result
              </span>
              {cutoutRef.current ? (
                <div
                  className="border-border-custom mt-2 rounded-md border"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, #e3e6ec 0 12px, #f4f6fa 12px 24px)",
                  }}
                >
                  <img
                    src={cutoutRef.current.src}
                    alt="The photo with its background removed, shown over a checkerboard so transparency is visible"
                    className="block w-full bg-transparent"
                  />
                </div>
              ) : (
                <p className="text-small text-text-muted mt-2 leading-relaxed">
                  Run removal to see the cutout here.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
      <section
        aria-labelledby="remove-step-export"
        className="border-structural border-border-custom bg-surface rounded-sm p-6"
      >
        <h2 id="remove-step-export" className="font-display text-h4 text-text font-bold">
          03 · Remove &amp; export
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={stage === "idle" || stage === "removing"}
            className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] disabled:pointer-events-none disabled:opacity-50"
          >
            <DoodleIcon name="files/file-image" className="size-4" />
            {stage === "removing" ? "Removing background…" : "Remove background"}
          </button>
          {stage === "removing" && progress !== null && (
            <p className="text-caption text-text-muted font-mono">Model {progress}%</p>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={stage !== "removed"}
            className="bg-surface text-text border-structural border-border-custom inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] disabled:pointer-events-none disabled:opacity-50"
          >
            <DoodleIcon name="interface/download" className="size-4" />
            Prepare download
          </button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download="cutout.png"
              className="bg-primary text-bg border-structural border-text inline-flex h-11 items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
            >
              <DoodleIcon name="interface/download" className="size-4" />
              Download PNG
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
        <p className="text-caption text-text-muted mt-2 leading-relaxed">
          Need a framed ID photo instead? Use the{" "}
          <a href="/crop" className="text-primary underline underline-offset-2">
            {" "}
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
