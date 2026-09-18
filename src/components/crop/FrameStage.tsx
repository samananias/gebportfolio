import React from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import {
  BG_OPTIONS,
  BG_SWATCH,
  ID_PRESETS,
  REMOVAL_MODEL,
  type BgOption,
  type IdPresetId,
} from "../../lib/crop/presets";
import { BG_LABEL, NUDGE_STEP_PX } from "./constants";
import { StageHeader } from "./StageHeader";
import type { BenchStageId, CropBox, CropError, Stage, StageStateResult } from "./types";

interface FrameStageProps {
  expanded: boolean;
  onToggle: (id: BenchStageId) => void;
  stageState: StageStateResult;
  frameSummary: string;
  error: CropError | null;
  // Canvas & framing props
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  endDrag: () => void;
  onFrameKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
  box: CropBox | null;
  zoom: number;
  exportSize: number;
  frameStatus: string;
  onZoomChange: (zoom: number) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  showGuide: boolean;
  setShowGuide: React.Dispatch<React.SetStateAction<boolean>>;
  // Configuration & Removal props
  presetId: IdPresetId;
  setPresetId: (id: IdPresetId) => void;
  bg: BgOption;
  setBg: (bg: BgOption) => void;
  stage: Stage;
  canWork: boolean;
  progress: number | null;
  runRemoval: () => Promise<void>;
  handleRemove: () => void;
  handleSkipRemoval: () => void;
  handleAbortRemoval: () => void;
}

export function FrameStage({
  expanded,
  onToggle,
  stageState,
  frameSummary,
  error,
  canvasRef,
  onPointerDown,
  onPointerMove,
  endDrag,
  onFrameKeyDown,
  box,
  zoom,
  exportSize,
  frameStatus,
  onZoomChange,
  panBy,
  showGuide,
  setShowGuide,
  presetId,
  setPresetId,
  bg,
  setBg,
  stage,
  canWork,
  progress,
  runRemoval,
  handleRemove,
  handleSkipRemoval,
  handleAbortRemoval,
}: FrameStageProps) {
  return (
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
      <StageHeader
        id="frame"
        expanded={expanded}
        onToggle={onToggle}
        state={stageState.state}
        stateLabel={stageState.label}
      />
      {/* The E2E contract asserts this exact empty-state line alongside the
          three headings, so the collapsed row keeps it visible. */}
      {!expanded && (
        <p className="text-small text-text-muted mt-2 leading-relaxed">{frameSummary}</p>
      )}
      <div
        id="crop-panel-frame"
        hidden={!expanded}
        className="animate-reveal motion-reduce:animate-none"
      >
        <p id="crop-frame-instructions" className="text-small text-text-muted mt-2 leading-relaxed">
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
                Zoomed past the photo&rsquo;s resolution — the export is enlarged and may look soft.
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
              Guide only — it never exports. Center the head in the oval with shoulders on the line.
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
  );
}
