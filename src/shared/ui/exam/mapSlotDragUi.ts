export type MapSlotCatchState = "none" | "droppable" | "targeted" | "caught";

export type MapSlotCatchInput = {
  isReviewMode: boolean;
  isOver: boolean;
  proximityActive: boolean;
  canReceiveDrag: boolean;
  isEmpty: boolean;
  dragHighlightEnabled: boolean;
};

/** Map-level proximity is the single drag target; per-slot isOver overlaps on inflated hit rects. */
function shouldUseMapProximityTargeting(
  mapDragEnabled: boolean,
  isExamDragging: boolean,
): boolean {
  return mapDragEnabled && isExamDragging;
}

function getMapSlotCatchState(input: MapSlotCatchInput): MapSlotCatchState {
  const {
    isReviewMode,
    isOver,
    proximityActive,
    canReceiveDrag,
    isEmpty,
    dragHighlightEnabled,
  } = input;

  if (!dragHighlightEnabled || isReviewMode || !canReceiveDrag) return "none";
  if (isOver) return "caught";
  if (proximityActive) return "targeted";
  if (isEmpty) return "droppable";
  return "none";
}

export function resolveMapSlotCatchState(
  input: MapSlotCatchInput & { mapDragEnabled: boolean; isExamDragging: boolean },
): MapSlotCatchState {
  const proximityOnly = shouldUseMapProximityTargeting(input.mapDragEnabled, input.isExamDragging);

  return getMapSlotCatchState({
    ...input,
    isOver: proximityOnly ? false : input.isOver,
  });
}

/**
 * Matching rows use frame-level proximity only (same model as map slots).
 * One row highlights; per-slot dragenter is ignored to avoid stacked overlap false positives.
 */
export function resolveMatchingSlotCatchState({
  isReviewMode,
  canReceiveDrag,
  proximityActive,
  dragActive,
}: {
  isReviewMode: boolean;
  canReceiveDrag: boolean;
  proximityActive: boolean;
  dragActive: boolean;
}): MapSlotCatchState {
  if (isReviewMode || !dragActive || !canReceiveDrag) return "none";
  if (proximityActive) return "caught";
  return "none";
}

/** Only the proximity-selected slot shows a label chip — never isOver on overlapping hit areas. */
export function resolveMapSlotDragPreview({
  proximityActive,
  canReceiveDrag,
  dragPreviewLabel,
  slotValue,
  dragValue,
}: {
  proximityActive: boolean;
  canReceiveDrag: boolean;
  dragPreviewLabel?: string;
  slotValue?: string;
  dragValue?: string;
}): string | null {
  if (!proximityActive || !canReceiveDrag || !dragPreviewLabel) return null;
  if (slotValue && dragValue && slotValue === dragValue) return null;
  return dragPreviewLabel;
}
