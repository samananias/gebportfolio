import React from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import { StageHeader } from "./StageHeader";
import type { RemoveStageId, StageStateResult } from "./types";

export interface DownloadInfo {
  width: number;
  height: number;
}

interface DownloadStageProps {
  expanded: boolean;
  onToggle: (id: RemoveStageId) => void;
  stageState: StageStateResult;
  summary: string;
  /** A cutout exists — the only state in which a download is possible. */
  canDownload: boolean;
  downloadUrl: string | null;
  downloadInfo: DownloadInfo | null;
  handleDownload: () => void;
  /** A photo is loaded — "Another photo" clears it and returns to intake. */
  canWork: boolean;
  onStartOver: () => void;
}

/**
 * Download plate for the bench (spec 0010 Features 5 and 7): one action
 * prepares the transparent PNG and hands it to the browser, matching the
 * crop export behavior. The collapsed row mirrors the download affordance so
 * it stays reachable without reopening the plate — exactly one `a[download]`
 * exists in the DOM at a time. The panel also carries **Another photo**, so
 * the save moment doubles as the "do one more" moment without a page reload.
 */
export function DownloadStage({
  expanded,
  onToggle,
  stageState,
  summary,
  canDownload,
  downloadUrl,
  downloadInfo,
  handleDownload,
  canWork,
  onStartOver,
}: DownloadStageProps) {
  const downloadName = `cutout-${downloadInfo ? `${downloadInfo.width}x${downloadInfo.height}` : "result"}.png`;
  return (
    <section
      aria-labelledby="remove-step-download"
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
        id="download"
        expanded={expanded}
        onToggle={onToggle}
        state={stageState.state}
        stateLabel={stageState.label}
      />
      {!expanded && (
        <div className="mt-2 space-y-3">
          <p className="text-small text-text-muted leading-relaxed">{summary}</p>
          {canDownload ? (
            <button
              type="button"
              onClick={handleDownload}
              className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <DoodleIcon name="interface/download" className="size-4" />
              Download PNG
            </button>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-md px-5 font-sans font-semibold opacity-50"
            >
              <DoodleIcon name="interface/download" className="size-4" />
              Download PNG
            </button>
          )}
          {downloadUrl && <DownloadLink url={downloadUrl} name={downloadName} />}
        </div>
      )}
      <div
        id="remove-panel-download"
        hidden={!expanded}
        className="animate-reveal motion-reduce:animate-none"
      >
        <p className="text-small text-text-muted mt-2 leading-relaxed">
          The cutout keeps its alpha channel: the exported PNG stays transparent — nothing is
          flattened. The download starts the moment you press the button, and the affordance stays
          for a deliberate re-download.
        </p>
        {resultLine(downloadInfo)}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!canDownload}
            className="bg-primary text-bg border-structural border-text inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-5 font-sans font-semibold transition-[transform,box-shadow,background-color] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] disabled:pointer-events-none disabled:opacity-50"
          >
            <DoodleIcon name="interface/download" className="size-4" />
            Download PNG
          </button>
          {/* One `a[download]` at a time: the panel renders its link only
              while expanded, the collapsed row takes over when resting. */}
          {downloadUrl && expanded && <DownloadLink url={downloadUrl} name={downloadName} />}
        </div>
        {/* The save moment is also the "one more" moment: clearing the result
            and returning to intake here means a second removal never needs a
            page reload (spec 0010 Feature 7). Same `resetAll` path as the
            crop bench. */}
        {canWork && (
          <button
            type="button"
            onClick={onStartOver}
            className="bg-surface text-text border-structural border-border-custom mt-4 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <DoodleIcon name="interface/sync" className="size-4" />
            Another photo
          </button>
        )}
      </div>
    </section>
  );
}

function DownloadLink({ url, name }: { url: string; name: string }) {
  return (
    <a
      href={url}
      download={name}
      className="bg-surface text-text border-structural border-border-custom inline-flex h-11 items-center gap-2 rounded-md px-5 font-sans font-medium transition-[transform,box-shadow] duration-200 hover:shadow-[2px_2px_0_var(--color-text)]"
    >
      <DoodleIcon name="interface/download" className="size-4" />
      Download again
    </a>
  );
}

/** Plain-language line naming the prepared result, or the honest empty state. */
function resultLine(info: DownloadInfo | null): React.ReactNode {
  if (!info) {
    return (
      <p className="text-caption text-text-muted mt-2 leading-relaxed">
        Unlock after a successful removal in stage 2.
      </p>
    );
  }
  return (
    <p className="text-caption text-text-muted mt-2 font-mono">
      {info.width} by {info.height} px, transparency preserved.
    </p>
  );
}
