import React from "react";
import type { RemovalPhase } from "./types";

interface RemovalProgressProps {
  /** Current pipeline half; `null` renders nothing. */
  phase: RemovalPhase | null;
  /** Percent of the current model file during `download`; absent otherwise. */
  progress: number | null;
}

/**
 * Inline loading feedback for the background-removal run (spec 0009
 * Feature 9). One honest panel, one mechanism: the percent is shown only
 * while model files are actually streaming; inference gets an indeterminate
 * indicator and says so, because the pipeline exposes no compute counts.
 */
export function RemovalProgressPanel({ phase, progress }: RemovalProgressProps) {
  if (!phase) return null;
  const headline =
    phase === "download"
      ? "Downloading the model — one-time, then browser-cached."
      : "Removing the background — this runs entirely on your device.";
  return (
    <div
      data-crop-removal-progress
      className="border-structural border-border-custom bg-surface-subtle mt-3 rounded-md border p-4"
    >
      <div className="flex items-center gap-3">
        {/* Theme-aware indeterminate spinner (same motif as Button.astro).
            Motion-off visitors keep the static arc plus the live copy. */}
        <svg
          aria-hidden="true"
          className="text-text-muted h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="text-small text-text leading-snug font-medium">{headline}</p>
      </div>
      {phase === "download" && progress !== null && (
        <p className="text-caption text-text-muted mt-2 font-mono">
          {progress}% of the current model file
        </p>
      )}
      {phase === "process" && (
        <p className="text-caption text-text-muted mt-2 leading-relaxed">
          This step has no progress count — it usually finishes in a few seconds.
        </p>
      )}
    </div>
  );
}
