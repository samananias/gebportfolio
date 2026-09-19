import React from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import { REMOVAL_MODEL } from "../../lib/crop/presets";
import { RemovalProgressPanel } from "../crop/RemovalProgressPanel";
import type { RemovalPhase } from "../crop/types";
import { StageHeader } from "./StageHeader";
import type { RemoveError, RemovePipelineStage, RemoveStageId, StageStateResult } from "./types";

interface RemoveStageProps {
  expanded: boolean;
  onToggle: (id: RemoveStageId) => void;
  stageState: StageStateResult;
  summary: string;
  canWork: boolean;
  stage: RemovePipelineStage;
  error: RemoveError | null;
  progress: number | null;
  removalPhase: RemovalPhase | null;
  originalSrc: string | null;
  cutoutSrc: string | null;
  handleRemove: () => void;
  runRemoval: () => Promise<void>;
  handleDeclineConsent: () => void;
  handleAbortRemoval: () => void;
  /** Clear the loaded photo and return to intake without a page reload. */
  onStartOver: () => void;
}

/**
 * Removal plate for the bench (spec 0010 Features 2 and 4): the compare
 * grid over the shared checkerboard, the consent group that gates the
 * first model download, the honest phase-aware progress, and cancellation.
 * It also carries **Start over**: the bench rests here after a load, so
 * resetting must never require re-expanding stage 01 (Feature 7).
 */
export function RemoveStage({
  expanded,
  onToggle,
  stageState,
  summary,
  canWork,
  stage,
  error,
  progress,
  removalPhase,
  originalSrc,
  cutoutSrc,
  handleRemove,
  runRemoval,
  handleDeclineConsent,
  handleAbortRemoval,
  onStartOver,
}: RemoveStageProps) {
  return (
    <section
      aria-labelledby="remove-step-remove"
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
      <StageHeader
        id="remove"
        expanded={expanded}
        onToggle={onToggle}
        state={stageState.state}
        stateLabel={stageState.label}
      />
      {/* The E2E contract asserts this exact empty-state line, so the
          collapsed row keeps it visible (mirrors the crop bench). The
          resting row also mirrors the removal control so it stays reachable
          without opening the plate (crop ExportStage pattern). */}
      {!expanded && (
        <div className="mt-2 space-y-3">
          <p className="text-small text-text-muted leading-relaxed">{summary}</p>
          {canWork ? (
            <button
              type="button"
              onClick={handleRemove}
              className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <DoodleIcon name="files/file-image" className="size-4" />
              Remove background
            </button>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-md px-5 font-sans font-semibold opacity-50"
            >
              <DoodleIcon name="files/file-image" className="size-4" />
              Remove background
            </button>
          )}
        </div>
      )}
      <div
        id="remove-panel-remove"
        hidden={!expanded}
        className="animate-reveal motion-reduce:animate-none"
      >
        {error && error.stage === "remove" && (
          <p
            role="alert"
            className="text-small border-structural border-text bg-surface-subtle text-text mt-3 flex items-center gap-2 rounded-md px-3 py-2"
          >
            <DoodleIcon name="interface/caution" className="size-3.5 shrink-0" />
            {error.message}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 items-stretch gap-4">
          <div className="bg-surface-subtle border-border-custom rounded-md border p-3">
            <span className="text-caption text-text-muted block font-mono font-bold tracking-wider uppercase">
              Original
            </span>
            {originalSrc ? (
              <img
                src={originalSrc}
                alt="The uploaded photo before background removal"
                className="border-border-custom mt-2 w-full rounded-md border"
              />
            ) : (
              <p className="text-small text-text-muted mt-2 leading-relaxed">
                The original lands here once a photo loads in stage 1.
              </p>
            )}
          </div>
          <div className="bg-surface-subtle border-border-custom rounded-md border p-3">
            <span className="text-caption text-text-muted block font-mono font-bold tracking-wider uppercase">
              Result
            </span>
            {cutoutSrc ? (
              <div className="transparency-checkerboard border-border-custom mt-2 rounded-md border">
                <img
                  src={cutoutSrc}
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
        <div className="border-structural border-border-custom mt-4 rounded-md border p-4">
          <p className="text-caption text-text-muted font-mono font-bold tracking-wider uppercase">
            Background removal
          </p>
          <div className="mt-3 space-y-2">
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
                    onClick={handleDeclineConsent}
                    className="bg-surface text-text border-structural border-border-custom inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
                  >
                    Not now
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
                Loads with a photo in stage 2 — waiting for a photo.
              </p>
            )}
            {stage === "removing" && (
              <RemovalProgressPanel phase={removalPhase} progress={progress} />
            )}
            {stage === "removing" && (
              <button
                type="button"
                onClick={handleAbortRemoval}
                className="bg-surface text-text border-structural border-border-custom inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
              >
                Cancel removal
              </button>
            )}
          </div>
        </div>
        {/* Start over lives in the plate the bench rests on after a load, so
            a second photo never needs a page reload (spec 0010 Feature 7).
            Mirrors the crop frame-stage control exactly. */}
        {canWork && (
          <button
            type="button"
            onClick={onStartOver}
            className="bg-surface text-text border-structural border-border-custom mt-4 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <DoodleIcon name="interface/sync" className="size-4" />
            Start over
          </button>
        )}
      </div>
    </section>
  );
}
