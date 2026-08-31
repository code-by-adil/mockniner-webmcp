import React from "react";
import { cn } from "@/lib/utils";
import {
  clearDragSelection,
  getActiveDragGroupId,
  getSelectedDragValue,
  registerDragOption,
  selectDragOption,
  subscribeDragSelection,
  toggleDragOption,
} from "./dragSelection";
import { configureExamDragDataTransfer, setExamDragSessionActive, subscribeExamDragSession } from "./examDragDrop";
import {
  MATCHING_CHOICE_WIDTH_PX,
  matchingDraggableSurfaceClass,
  mountMatchingDragGhost,
  splitMatchingChoiceLabel,
} from "./matchingChoiceStyles";
import { MatchingChoiceLabel } from "./MatchingChoiceLabel";

function OptionLabelContent({ text, muted = false }: { text: string; muted?: boolean }) {
  const { letter, name } = splitMatchingChoiceLabel(text);

  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${muted ? "opacity-70" : ""}`}>
      {letter ? (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            muted ? "bg-slate-200 text-slate-500" : "bg-slate-900 text-white shadow-sm"
          }`}
        >
          {letter}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-inherit">{name}</span>
    </span>
  );
}

interface Props {
  text: string;
  value?: string;
  groupId?: string;
  isUsed?: boolean;
  isReviewMode?: boolean;
  className?: string;
  variant?: "default" | "matching";
}

export const DraggableItem: React.FC<Props> = ({
  text,
  value,
  groupId = "default",
  isUsed = false,
  isReviewMode = false,
  className = "",
  variant = "default",
}) => {
  const isDisabled = isUsed || isReviewMode;
  const dragValue = value ?? text;
  const [isDraggingSelf, setIsDraggingSelf] = React.useState(false);

  React.useEffect(() => registerDragOption({ groupId, value: dragValue, label: text, isUsed, isReviewMode }), [
    dragValue,
    groupId,
    isReviewMode,
    isUsed,
    text,
  ]);

  React.useEffect(
    () =>
      subscribeExamDragSession((active) => {
        if (!active) setIsDraggingSelf(false);
      }),
    [],
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
  const isSelected =
    !isDisabled &&
    selectedValue === dragValue &&
    selectedGroupId === groupId;

  const handleDragStart = (event: React.DragEvent) => {
    if (isDisabled) {
      event.preventDefault();
      return;
    }

    selectDragOption(groupId, dragValue);
    setExamDragSessionActive(true);
    setIsDraggingSelf(true);
    configureExamDragDataTransfer(event, { groupId, value: dragValue });

    if (variant === "matching") {
      mountMatchingDragGhost(event, text, MATCHING_CHOICE_WIDTH_PX);
    } else {
      const target = event.currentTarget;
      if (target instanceof HTMLElement) {
        event.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
      }
    }
  };

  const handleDragEnd = () => {
    setIsDraggingSelf(false);
    // Drop fires before dragend; defer clear so payload + sticky target stay valid through release.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => clearDragSelection());
    });
  };

  const handleClick = () => {
    if (isDisabled) return;
    toggleDragOption(groupId, dragValue);
  };

  const isMatching = variant === "matching";
  /** Native `disabled` adds extra UA dimming; matching uses explicit opacity instead. */
  const useNativeDisabled = !isMatching || isReviewMode;

  return (
    <button
      type="button"
      draggable={!isDisabled}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      disabled={useNativeDisabled && isDisabled}
      aria-disabled={isMatching && isUsed ? true : undefined}
      aria-pressed={isSelected}
      className={
        isMatching
          ? cn(
              matchingDraggableSurfaceClass({ isUsed, isReviewMode, isSelected }),
              isDraggingSelf && !isDisabled && "opacity-0",
              className,
            )
          : `
        w-full touch-manipulation rounded-md border px-2.5 py-2 text-left transition-[background-color,border-color,box-shadow,color] select-none
        ${
          isUsed
            ? "cursor-default border-slate-200/80 bg-slate-50 text-slate-400"
            : isReviewMode
              ? "cursor-default border-slate-200 bg-white text-slate-400"
              : isSelected
                ? "cursor-grab border-slate-900 bg-slate-50 text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.12)] ring-2 ring-slate-900/15 active:cursor-grabbing"
                : "cursor-grab border-slate-200 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 active:cursor-grabbing"
        }
        ${className}
      `
      }
    >
      {isMatching ? (
        <MatchingChoiceLabel
          text={text}
          muted={isReviewMode}
          letterTone={isUsed && !isReviewMode ? "used" : "option"}
        />
      ) : (
        <OptionLabelContent text={text} muted={isUsed || isReviewMode} />
      )}
    </button>
  );
};
