import React from "react";
import { getCropStampClass, type CropStageState } from "../../lib/crop/stamps";
import { STAGE_META, STAGE_LABEL } from "./constants";
import type { BenchStageId } from "./types";

interface StageHeaderProps {
  id: BenchStageId;
  expanded: boolean;
  onToggle: (id: BenchStageId) => void;
  state: CropStageState;
  stateLabel: string;
}

export function StageHeader({ id, expanded, onToggle, state, stateLabel }: StageHeaderProps) {
  const meta = STAGE_META[id];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          aria-hidden="true"
          className="text-micro text-text-muted font-mono font-bold tracking-[0.2em] uppercase"
        >
          {meta.ordinal}
        </p>
        <span className={getCropStampClass(state)}>{stateLabel}</span>
      </div>
      <h2 id={`crop-step-${id}`} className="font-heading text-h4 text-text mt-1 font-bold">
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={expanded}
          aria-controls={meta.panelId}
          className="focus-visible:ring-focus focus-visible:ring-offset-bg w-full cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {STAGE_LABEL[id]}
        </button>
      </h2>
    </>
  );
}
