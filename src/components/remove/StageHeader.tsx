import React from "react";
import { getCropStampClass, type CropStageState } from "../../lib/crop/stamps";
import { STAGE_META, STAGE_LABEL } from "./constants";
import type { RemoveStageId } from "./types";

interface StageHeaderProps {
  id: RemoveStageId;
  expanded: boolean;
  onToggle: (id: RemoveStageId) => void;
  state: CropStageState;
  stateLabel: string;
}

/**
 * Plate header for the removal bench: the ordinal row with the live stamp,
 * then the collapsible plate title. Mirrors the crop bench header so the
 * state language stays identical across the two sibling tools (spec 0010
 * Feature 2) — the stamp treatment itself is shared from `lib/crop/stamps`.
 */
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
      <h2 id={meta.headingId} className="font-heading text-h4 text-text mt-1 font-bold">
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
