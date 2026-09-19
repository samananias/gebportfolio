import React, { useRef, useState } from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import { StageHeader } from "./StageHeader";
import type { RemoveError, RemoveStageId, StageStateResult } from "./types";

interface SourceStageProps {
  expanded: boolean;
  onToggle: (id: RemoveStageId) => void;
  stageState: StageStateResult;
  canWork: boolean;
  status: string;
  isReading: boolean;
  error: RemoveError | null;
  fileRef: React.RefObject<HTMLInputElement | null>;
  handleFile: (file: File | undefined) => Promise<void>;
  resetAll: () => void;
}

/**
 * Intake plate for the removal bench (spec 0010 Feature 3): one `handleFile`
 * funnel behind the file input, drag-and-drop, camera capture — clipboard
 * paste is wired at the island level. Mirrors the crop source plate so the
 * two sibling tools share one intake behavior.
 */
export function SourceStage({
  expanded,
  onToggle,
  stageState,
  canWork,
  status,
  isReading,
  error,
  fileRef,
  handleFile,
  resetAll,
}: SourceStageProps) {
  const [dragging, setDragging] = useState(false);
  const dragDepthRef = useRef(0);

  return (
    <section
      aria-labelledby="remove-step-source"
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
      <StageHeader
        id="source"
        expanded={expanded}
        onToggle={onToggle}
        state={stageState.state}
        stateLabel={stageState.label}
      />
      {!expanded && (
        <p className="text-small text-text-muted mt-2 leading-relaxed">
          {canWork ? "Photo loaded — stage 2 holds the removal controls." : status}
        </p>
      )}
      <div
        id="remove-panel-source"
        hidden={!expanded}
        className="animate-reveal motion-reduce:animate-none"
      >
        <p className="text-small text-text-muted mt-2 leading-relaxed">
          JPEG or PNG up to 8 MB. The file stays on this device — nothing is uploaded. You can also
          drag a photo here, paste one from the clipboard, or use the camera.
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
            id="remove-file"
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
            htmlFor="remove-file"
            className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <DoodleIcon name="interface/upload" className="size-4" />
            Choose photo
          </label>
          <input
            id="remove-camera"
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
            htmlFor="remove-camera"
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
  );
}
