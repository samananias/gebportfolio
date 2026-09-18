import React from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import { EXPORT, ID_PRESETS, type IdPresetId } from "../../lib/crop/presets";
import { EXPORT_FORMATS, type ExportFormatId } from "./constants";
import { StageHeader } from "./StageHeader";
import type { BenchStageId, CropError, StageStateResult } from "./types";

interface ExportStageProps {
  expanded: boolean;
  onToggle: (id: BenchStageId) => void;
  stageState: StageStateResult;
  exportSummary: string;
  canWork: boolean;
  error: CropError | null;
  presetId: IdPresetId;
  format: ExportFormatId;
  setFormat: (format: ExportFormatId) => void;
  exportUrl: string | null;
  handleExport: () => Promise<void>;
}

export function ExportStage({
  expanded,
  onToggle,
  stageState,
  exportSummary,
  canWork,
  error,
  presetId,
  format,
  setFormat,
  exportUrl,
  handleExport,
}: ExportStageProps) {
  return (
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
      <StageHeader
        id="export"
        expanded={expanded}
        onToggle={onToggle}
        state={stageState.state}
        stateLabel={stageState.label}
      />
      {!expanded && (
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
        hidden={!expanded}
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
          {exportUrl && expanded && (
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
  );
}
