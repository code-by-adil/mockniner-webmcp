import { canAssignDragOption, type DragOption } from "./dragOptions";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "lucide-react";
import { objectiveAnswerMatches } from "@/domain/objectiveScoring";
import {
  isExamDragSessionActive,
  resolveExamDragPayload,
  subscribeExamDragSession,
  useDropZoneDragDepth,
} from "./examDragDrop";
import {
  clearDragSelection,
  getActiveDragGroupId,
  getSelectedDragValue,
  subscribeDragSelection,
} from "./dragSelection";
import {
  resolveMapSlotCatchState,
  resolveMapSlotDragPreview,
  resolveMatchingSlotCatchState,
  type MapSlotCatchState,
} from "./mapSlotDragUi";
import { cn } from "@/lib/utils";
import { EXAM_SLOT_HIT_INSET_PX } from "./examProximityDrop";
import { MatchingChoiceLabel } from "./MatchingChoiceLabel";
import { matchingSlotSurfaceClass } from "./matchingChoiceStyles";
import { supportsNativeDialog } from "./cssAnchorPositioning";
import { AnswerPickerSheet } from "./AnswerPickerSheet";

function splitChoiceDisplay(display: string): { letter: string; name: string } {
  const match = display.match(/^([A-Z])\.\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return { letter: match[1].toUpperCase(), name: match[2] };
  }
  return { letter: "", name: display };
}

function MapSlotLetterBadge({
  letter,
  muted = false,
}: {
  letter: string;
  muted?: boolean;
}) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-[0_1px_4px_rgba(15,23,42,0.35)] ring-2 ring-white/95 ${
        muted ? "opacity-80" : ""
      }`}
    >
      {letter}
    </span>
  );
}

function MapSlotAnswerChip({
  display,
  muted = false,
  compact = false,
}: {
  display: string;
  muted?: boolean;
  compact?: boolean;
}) {
  const { letter, name } = splitChoiceDisplay(display);

  if (compact && letter) {
    return <MapSlotLetterBadge letter={letter} muted={muted} />;
  }

  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${muted ? "opacity-75" : ""}`}
      title={display}
    >
      {letter ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-sm">
          {letter}
        </span>
      ) : null}
      <span className="min-w-0 text-[10px] font-semibold leading-snug text-slate-800 line-clamp-2">
        {name}
      </span>
    </div>
  );
}

function ClearAnswerIcon() {
  return <X aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />;
}

function AnswerClearButton({
  questionLabel,
  onClear,
  className = "",
}: {
  questionLabel: string | number;
  onClear: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Remove answer for question ${questionLabel}`}
      title="Remove answer"
      onClick={(event) => {
        event.stopPropagation();
        onClear();
        clearDragSelection();
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35 active:scale-95 active:bg-red-100 ${className}`}
    >
      <ClearAnswerIcon />
    </button>
  );
}

function getMapSlotSurfaceStyles({
  isReviewMode,
  isCorrect,
  value,
  catchState,
  compact,
}: {
  isReviewMode: boolean;
  isCorrect: boolean;
  value?: string;
  catchState: MapSlotCatchState;
  compact?: boolean;
}): string {
  if (compact && !isReviewMode) {
    return "border-0 bg-transparent p-0 shadow-none";
  }

  if (isReviewMode) {
    return isCorrect
      ? "border border-emerald-600/80 bg-emerald-50/95 shadow-sm"
      : "border border-red-400/90 bg-red-50/95 shadow-sm";
  }

  if (catchState === "caught") {
    return "border-2 border-solid border-sky-600 bg-sky-100 shadow-[0_0_0_3px_rgba(2,132,199,0.35)]";
  }

  if (catchState === "targeted") {
    return "border-2 border-dashed border-sky-500 bg-sky-50/95 shadow-[0_0_0_2px_rgba(14,165,233,0.28)]";
  }

  if (catchState === "droppable") {
    return "border border-dashed border-sky-300/90 bg-sky-50/40";
  }

  if (value) {
    return "border border-slate-200/90 bg-white/95 shadow-[0_1px_3px_rgba(15,23,42,0.1)]";
  }

  return "border border-dashed border-slate-400/75 bg-white/70";
}

interface Props {
  options: readonly DragOption[];
  id: number | string;
  groupId?: string | undefined;
  value?: string | undefined;
  onDrop: (val: string) => void;
  onClear: () => void;
  placeholder?: string | undefined;
  displayValue?: string | undefined;
  className?: string | undefined;
  variant: "mapSlot" | "matching";
  isReviewMode?: boolean | undefined;
  correctAnswer?: string | string[] | undefined;
  proximityActive?: boolean | undefined;
  catchFlash?: boolean | undefined;
  mapInteraction?: "drag" | "tap" | undefined;
}

function renderPickerPortal(node: React.ReactNode) {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

function DropHitLayer({
  enabled,
  dragHandlers,
}: {
  enabled: boolean;
  dragHandlers: React.HTMLAttributes<HTMLDivElement>;
}) {
  if (!enabled) return null;

  return (
    <div
      className="absolute z-0 touch-manipulation"
      style={{
        top: -EXAM_SLOT_HIT_INSET_PX,
        right: -EXAM_SLOT_HIT_INSET_PX,
        bottom: -EXAM_SLOT_HIT_INSET_PX,
        left: -EXAM_SLOT_HIT_INSET_PX,
      }}
      aria-hidden
      {...dragHandlers}
    />
  );
}

export const DropZone: React.FC<Props> = ({
  id,
  options,
  groupId = "default",
  value,
  onDrop,
  onClear,
  placeholder,
  displayValue,
  className = "",
  variant,
  isReviewMode = false,
  correctAnswer,
  proximityActive = false,
  catchFlash = false,
  mapInteraction = "drag",
}) => {
  const mapDragEnabled = mapInteraction === "drag";
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const useNativePicker = supportsNativeDialog();
  const showPicker = (useNativePicker || isPickerOpen) && !isReviewMode;
  const { isOver, onDragEnter, onDragLeave, onDragOver, reset } =
    useDropZoneDragDepth();
  const isExamDragging = React.useSyncExternalStore(
    (onChange) => subscribeExamDragSession(onChange),
    isExamDragSessionActive,
    () => false,
  );
  const selectedValue = React.useSyncExternalStore(
    subscribeDragSelection,
    getSelectedDragValue,
    () => null,
  );
  const selectedGroupId = React.useSyncExternalStore(
    subscribeDragSelection,
    getActiveDragGroupId,
    () => null,
  );

  const isCorrect =
    isReviewMode &&
    correctAnswer !== undefined &&
    objectiveAnswerMatches(value ?? "", correctAnswer);
  const displayCorrect = isReviewMode
    ? Array.isArray(correctAnswer)
      ? correctAnswer[0]
      : correctAnswer
    : null;

  const availableOptions = options.filter(
    (option) =>
      !option.isReviewMode && (!option.isUsed || option.value === value),
  );

  const canAcceptSelection =
    !isReviewMode &&
    Boolean(selectedValue) &&
    selectedGroupId === groupId &&
    canAssignDragOption(options, selectedValue!, value);

  const optionLabel = value
    ? availableOptions.find((option) => option.value === value)?.label
    : undefined;

  const resolvedDisplayValue = optionLabel ?? displayValue ?? value;

  const pendingLabel = canAcceptSelection
    ? availableOptions.find((option) => option.value === selectedValue)?.label
    : null;

  const assignValue = (nextValue: string) => {
    if (!canAssignDragOption(options, nextValue, value)) return;
    onDrop(nextValue);
    clearDragSelection();
    reset();
  };

  const handleDrop = (event: React.DragEvent) => {
    if (isReviewMode) return;
    event.preventDefault();
    event.stopPropagation();
    reset();

    const payload = resolveExamDragPayload(event, {
      groupId,
      value: selectedValue ?? "",
    });
    if (!payload || payload.groupId !== groupId) return;
    assignValue(payload.value);
  };

  const openPicker = () => {
    if (isReviewMode) return;
    setIsPickerOpen(true);
  };

  const handleActivate = () => {
    if (isReviewMode) return;

    if (canAcceptSelection && selectedValue) {
      assignValue(selectedValue);
      return;
    }

    openPicker();
  };

  const chooseOption = (nextValue: string) => {
    assignValue(nextValue);
    setIsPickerOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleActivate();
  };

  const activeDragValue =
    isExamDragging && selectedGroupId === groupId ? selectedValue : undefined;
  const hasMapDragPayload = !isReviewMode && Boolean(activeDragValue);
  const canReceiveDrag =
    hasMapDragPayload && canAssignDragOption(options, activeDragValue!, value);
  const dragPreviewLabel = canReceiveDrag
    ? availableOptions.find((option) => option.value === activeDragValue)?.label
    : undefined;

  const tooltip =
    isReviewMode && !isCorrect && displayCorrect ? (
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="flex items-center gap-2 whitespace-nowrap rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
          <span className="font-bold text-red-300">✓</span> {displayCorrect}
        </div>
        <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900" />
      </div>
    ) : null;

  const successCheck =
    isReviewMode && isCorrect ? (
      <div className="pointer-events-none absolute -right-2 -top-2 z-10 rounded-full border border-green-200 bg-white p-0.5 shadow-sm">
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#16a34a"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    ) : null;

  const pickerSheetLayout = !mapDragEnabled ? "tap" : "drag";

  const picker = showPicker ? (
    <AnswerPickerSheet
      open={isPickerOpen}
      questionLabel={placeholder || id}
      pickerSheetLayout={pickerSheetLayout}
      availableOptions={availableOptions}
      value={value}
      selectedValue={selectedValue}
      selectedGroupId={selectedGroupId}
      groupId={groupId}
      mapDragEnabled={mapDragEnabled}
      canAcceptSelection={canAcceptSelection}
      variant={variant}
      onChoose={chooseOption}
      onClear={() => {
        onClear();
        clearDragSelection();
      }}
      onClose={() => setIsPickerOpen(false)}
    />
  ) : null;

  const matchingProximityDrop = variant === "matching" && isExamDragging;
  const dragHandlers =
    !isReviewMode && mapDragEnabled && !matchingProximityDrop
      ? {
          onDragEnter,
          onDragLeave,
          onDragOver,
          onDrop: handleDrop,
        }
      : {};

  const questionLabel = placeholder || id;
  const handleClear = () => {
    onClear();
    clearDragSelection();
  };
  const slotInteractionProps: React.HTMLAttributes<HTMLDivElement> =
    isReviewMode
      ? {}
      : {
          role: "button",
          tabIndex: 0,
          "aria-label": `Select answer for question ${questionLabel}`,
          onClick: handleActivate,
          onKeyDown: handleKeyDown,
        };

  if (variant === "mapSlot") {
    const mapSlotCompact = !mapDragEnabled;
    const filledLabel = value ? resolvedDisplayValue : null;
    const mapSlotCatchState = resolveMapSlotCatchState({
      isReviewMode,
      isOver,
      proximityActive,
      canReceiveDrag,
      isEmpty: !value,
      dragHighlightEnabled: mapDragEnabled,
      mapDragEnabled,
      isExamDragging,
    });
    const mapSlotStyles = getMapSlotSurfaceStyles({
      isReviewMode,
      isCorrect,
      catchState: mapSlotCatchState,
      compact: mapSlotCompact,
      ...(value ? { value } : {}),
    });
    const activeSlotPreview =
      mapDragEnabled && isExamDragging
        ? resolveMapSlotDragPreview({
            proximityActive,
            canReceiveDrag,
            ...(dragPreviewLabel ? { dragPreviewLabel } : {}),
            ...(value ? { slotValue: value } : {}),
            ...(activeDragValue ? { dragValue: activeDragValue } : {}),
          })
        : mapSlotCatchState === "targeted" || mapSlotCatchState === "caught"
          ? (dragPreviewLabel ?? pendingLabel ?? null)
          : null;

    return (
      <>
        <div className="relative h-full min-h-0 w-full overflow-visible">
          <DropHitLayer
            enabled={!isReviewMode && mapDragEnabled}
            dragHandlers={dragHandlers}
          />
          <div
            id={`question-${id}`}
            {...slotInteractionProps}
            className={`
              group relative z-10 flex h-full min-h-0 w-full touch-manipulation items-center justify-center transition-[background-color,border-color,box-shadow,color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25
              ${mapSlotCompact ? "rounded-full p-0" : "rounded-md px-2 py-1.5"}
              ${mapSlotStyles}
              ${className}
            `}
          >
            {activeSlotPreview ? (
              <MapSlotAnswerChip
                display={activeSlotPreview}
                muted
                compact={mapSlotCompact}
              />
            ) : filledLabel ? (
              mapSlotCompact && !isReviewMode ? (
                <MapSlotAnswerChip display={filledLabel} compact />
              ) : (
                <div className="relative flex min-h-0 w-full min-w-0 items-center">
                  <div className="min-w-0 flex-1">
                    <MapSlotAnswerChip display={filledLabel} compact={false} />
                  </div>
                  {!isReviewMode ? (
                    <AnswerClearButton
                      questionLabel={questionLabel}
                      onClear={handleClear}
                      className="absolute right-1 top-1/2 z-10 -translate-y-1/2 transition-opacity duration-150 max-md:pointer-events-auto max-md:opacity-100 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
                    />
                  ) : null}
                </div>
              )
            ) : (
              <span
                className={`flex items-center justify-center rounded-full border font-bold ${
                  mapSlotCompact
                    ? "h-7 w-7 text-[11px] shadow-[0_1px_3px_rgba(15,23,42,0.2)]"
                    : "h-8 w-8 text-xs shadow-sm"
                } ${
                  mapSlotCatchState === "caught"
                    ? "border-sky-600 bg-sky-100 text-sky-800"
                    : mapSlotCatchState === "targeted"
                      ? "border-sky-500 bg-sky-50 text-sky-700"
                      : mapSlotCatchState === "droppable"
                        ? "border-sky-300 bg-sky-50/80 text-sky-700"
                        : mapSlotCompact
                          ? "border border-slate-500/80 bg-white/95 text-slate-700"
                          : "border-dashed border-slate-500/90 bg-white/90 text-slate-700"
                }`}
              >
                {placeholder || id}
              </span>
            )}
            {tooltip}
            {successCheck}
          </div>
        </div>
        {picker ? renderPickerPortal(picker) : null}
      </>
    );
  }

  if (variant === "matching") {
    const matchingTapMode = !mapDragEnabled;
    const slotLabel = value ? resolvedDisplayValue : null;
    const matchingCatchState = catchFlash
      ? "caught"
      : resolveMatchingSlotCatchState({
          isReviewMode,
          canReceiveDrag,
          proximityActive,
          dragActive: isExamDragging,
        });
    const activeSlotPreview =
      isExamDragging && !isReviewMode
        ? resolveMapSlotDragPreview({
            proximityActive,
            canReceiveDrag,
            ...(dragPreviewLabel ? { dragPreviewLabel } : {}),
            ...(value ? { slotValue: value } : {}),
            ...(activeDragValue ? { dragValue: activeDragValue } : {}),
          })
        : null;
    // While dragging: preview only on the proximity-targeted slot. Tap-to-place: selected option on click target.
    const previewLabel =
      !isReviewMode && !value
        ? isExamDragging
          ? activeSlotPreview
          : pendingLabel
        : null;

    return (
      <>
        <div className="relative w-full min-w-0 overflow-visible">
          <DropHitLayer
            enabled={!isReviewMode && !matchingProximityDrop && mapDragEnabled}
            dragHandlers={dragHandlers}
          />
          <div
            id={`question-${id}`}
            {...slotInteractionProps}
            className={cn(
              "group relative z-10 w-full min-w-0",
              matchingSlotSurfaceClass({
                isReviewMode,
                isCorrect,
                hasValue: Boolean(value),
                catchState: matchingCatchState,
                tapHighlighted: canAcceptSelection && !isExamDragging,
              }),
              matchingTapMode && !isReviewMode && "gap-2 pr-1",
              className,
            )}
          >
            {slotLabel ? (
              matchingTapMode && !isReviewMode ? (
                <>
                  <MatchingChoiceLabel
                    text={slotLabel}
                    letterTone="filled"
                    muted={isReviewMode && !isCorrect}
                    clampName
                  />
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[color:var(--exam-text-subtle)]"
                    aria-hidden
                  />
                </>
              ) : (
                <>
                  <MatchingChoiceLabel
                    text={slotLabel}
                    letterTone="filled"
                    muted={isReviewMode && !isCorrect}
                  />
                  {!isReviewMode && value ? (
                    <AnswerClearButton
                      questionLabel={questionLabel}
                      onClear={handleClear}
                      className="shrink-0"
                    />
                  ) : null}
                </>
              )
            ) : previewLabel ? (
              <MatchingChoiceLabel
                text={previewLabel}
                letterTone="filled"
                muted
                clampName={matchingTapMode}
              />
            ) : (
              <>
                <span className="text-sm font-semibold text-[color:var(--exam-text-subtle)]">
                  {placeholder || id}
                </span>
                {matchingTapMode && !isReviewMode ? (
                  <ChevronRight
                    className="ml-auto h-4 w-4 shrink-0 text-[color:var(--exam-text-subtle)]"
                    aria-hidden
                  />
                ) : null}
              </>
            )}
            {tooltip}
            {successCheck}
          </div>
        </div>
        {picker ? renderPickerPortal(picker) : null}
      </>
    );
  }

  return null;
};
