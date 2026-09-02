import React from "react";
import { useIsCompactExamLayout } from "@/hooks/useExamLayout";
import { cn } from "@/lib/utils";
import { canAssignDragOption, type DragOption } from "./dragOptions";
import { useExamProximityDropLayer } from "./examProximityDrop";
import { DraggableItem } from "./DraggableItem";
import { DropZone } from "./DropZone";
import {
  MATCHING_CHOICE_WIDTH_STYLE,
  MATCHING_DROP_MAX_EDGE_PX,
  MATCHING_DROP_RELEASE_SNAP_PX,
  MATCHING_DROP_SNAP_PX,
} from "./matchingChoiceStyles";

function MatchingChoiceWidth({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("w-full shrink-0", className)}
      style={MATCHING_CHOICE_WIDTH_STYLE}
    >
      {children}
    </div>
  );
}

type MatchingDraggableOptionProps = {
  text: string;
  value?: string;
  groupId?: string;
  isUsed?: boolean;
  isReviewMode?: boolean;
};

export function MatchingDraggableOption({
  text,
  value,
  groupId = "default",
  isUsed = false,
  isReviewMode = false,
}: MatchingDraggableOptionProps) {
  return (
    <DraggableItem
      text={text}
      {...(value !== undefined ? { value } : {})}
      groupId={groupId}
      isUsed={isUsed}
      isReviewMode={isReviewMode}
      variant="matching"
    />
  );
}

type MatchingAnswerSlotProps = {
  options: readonly DragOption[];
  id: number | string;
  groupId: string;
  value?: string | undefined;
  displayValue?: string | undefined;
  onDrop: (val: string) => void;
  onClear: () => void;
  placeholder?: string | undefined;
  isReviewMode?: boolean | undefined;
  correctAnswer?: string | string[] | undefined;
  proximityActive?: boolean;
  catchFlash?: boolean;
  mapInteraction?: "drag" | "tap";
};

export function MatchingAnswerSlot({
  options,
  id,
  groupId,
  value,
  displayValue,
  onDrop,
  onClear,
  placeholder,
  isReviewMode,
  correctAnswer,
  proximityActive = false,
  catchFlash = false,
  mapInteraction,
}: MatchingAnswerSlotProps) {
  const isCompactLayout = useIsCompactExamLayout();
  const resolvedInteraction =
    mapInteraction ?? (isCompactLayout ? "tap" : "drag");

  return (
    <DropZone
      options={options}
      id={id}
      groupId={groupId}
      value={value}
      {...(displayValue !== undefined ? { displayValue } : {})}
      onDrop={onDrop}
      onClear={onClear}
      placeholder={placeholder}
      isReviewMode={isReviewMode}
      correctAnswer={correctAnswer}
      variant="matching"
      proximityActive={proximityActive}
      catchFlash={catchFlash}
      mapInteraction={resolvedInteraction}
    />
  );
}

export type MatchingQuestionSetProps = {
  title?: string | undefined;
  groupId: string;
  questions: Array<{ questionId: number; label: string }>;
  options: string[];
  answers: Record<number, string | undefined>;
  onAnswerChange: (questionId: number, value: string) => void;
  isReviewMode?: boolean | undefined;
  getCorrectAnswer: (questionId: number) => string | string[] | undefined;
  placeholder?: string | undefined;
  usedAnswers: Set<string>;
  optionLabel: (index: number) => string;
};

function formatOptionDisplay(
  optionLabel: (index: number) => string,
  option: string,
  index: number,
) {
  return `${optionLabel(index)}. ${option}`;
}

export function MatchingQuestionSet({
  title,
  groupId,
  questions,
  options,
  answers,
  onAnswerChange,
  isReviewMode,
  getCorrectAnswer,
  placeholder,
  usedAnswers,
  optionLabel,
}: MatchingQuestionSetProps) {
  const isCompactLayout = useIsCompactExamLayout();
  const mapInteraction = isCompactLayout ? "tap" : "drag";
  const slotsFrameRef = React.useRef<HTMLElement>(null);
  const slotHostRefs = React.useRef(new Map<number, HTMLDivElement>());
  const dragEnabled = mapInteraction === "drag" && isReviewMode !== true;

  const dragOptions = React.useMemo(
    () =>
      options.map((option, index) => ({
        value: option,
        label: formatOptionDisplay(optionLabel, option, index),
        isUsed: usedAnswers.has(option),
        isReviewMode: isReviewMode === true,
      })),
    [isReviewMode, optionLabel, options, usedAnswers],
  );

  const optionDisplayByValue = React.useMemo(() => {
    const map = new Map<string, string>();
    options.forEach((option, index) => {
      map.set(option, formatOptionDisplay(optionLabel, option, index));
    });
    return map;
  }, [optionLabel, options]);

  const canAssignToSlot = React.useCallback(
    (questionId: number, value: string) => {
      const currentValue = answers[questionId] ?? "";
      return canAssignDragOption(dragOptions, value, currentValue);
    },
    [answers, dragOptions],
  );

  const {
    proximitySlotId,
    caughtSlotId,
    registerSlotHost,
    dropFrameHandlers,
    flashCaughtSlot,
  } = useExamProximityDropLayer({
    groupId,
    dragEnabled,
    dropFrameRef: slotsFrameRef,
    slotHostRefs,
    canAssignToSlot,
    onAssign: onAnswerChange,
    dropSnapPx: MATCHING_DROP_SNAP_PX,
    dropReleaseSnapPx: MATCHING_DROP_RELEASE_SNAP_PX,
    dropMaxEdgePx: MATCHING_DROP_MAX_EDGE_PX,
  });

  const handleSlotAssign = React.useCallback(
    (questionId: number, value: string) => {
      onAnswerChange(questionId, value);
      if (value) flashCaughtSlot(questionId);
    },
    [flashCaughtSlot, onAnswerChange],
  );

  return (
    <div className={cn("max-w-full", isCompactLayout ? "w-full" : "w-max")}>
      <div
        className={cn(
          "flex flex-col gap-4",
          !isCompactLayout && "items-start sm:flex-row sm:items-start sm:gap-5",
        )}
      >
        <section
          ref={slotsFrameRef}
          className={cn("min-w-0 shrink-0", isCompactLayout && "w-full")}
          {...dropFrameHandlers}
        >
          {title ? (
            <p className="mb-2 min-h-[1.125rem] text-sm font-bold leading-snug text-[color:var(--exam-text)]">
              {title}
            </p>
          ) : (
            <p className="mb-2 min-h-[1.125rem]" aria-hidden />
          )}
          {isCompactLayout && !isReviewMode ? (
            <p className="mb-3 rounded-lg border border-[color:var(--exam-border-muted)] bg-[color:var(--exam-surface-muted)] px-3 py-2 text-xs font-medium leading-5 text-[color:var(--exam-text-muted)]">
              Tap a row, then choose an option from the list.
            </p>
          ) : null}
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {questions.map((question) => {
              const answerValue = answers[question.questionId];
              const displayValue = answerValue
                ? optionDisplayByValue.get(answerValue)
                : undefined;

              return (
                <li
                  key={question.questionId}
                  className="flex items-stretch gap-2.5 sm:gap-3"
                >
                  <span className="w-[4.25rem] shrink-0 self-center text-sm font-semibold leading-snug text-[color:var(--exam-text)] sm:w-[4.5rem]">
                    {question.label}
                  </span>
                  {isCompactLayout ? (
                    <div
                      ref={registerSlotHost(question.questionId)}
                      className="relative min-w-0 flex-1"
                    >
                      <MatchingAnswerSlot
                        options={dragOptions}
                        id={question.questionId}
                        groupId={groupId}
                        value={answerValue}
                        {...(displayValue !== undefined
                          ? { displayValue }
                          : {})}
                        onDrop={(value) =>
                          handleSlotAssign(question.questionId, value)
                        }
                        onClear={() => onAnswerChange(question.questionId, "")}
                        placeholder={placeholder ?? String(question.questionId)}
                        isReviewMode={isReviewMode}
                        correctAnswer={getCorrectAnswer(question.questionId)}
                        proximityActive={
                          proximitySlotId === question.questionId
                        }
                        catchFlash={caughtSlotId === question.questionId}
                        mapInteraction={mapInteraction}
                      />
                    </div>
                  ) : (
                    <MatchingChoiceWidth>
                      <div
                        ref={registerSlotHost(question.questionId)}
                        className="relative w-full"
                      >
                        <MatchingAnswerSlot
                          options={dragOptions}
                          id={question.questionId}
                          groupId={groupId}
                          value={answerValue}
                          {...(displayValue !== undefined
                            ? { displayValue }
                            : {})}
                          onDrop={(value) =>
                            handleSlotAssign(question.questionId, value)
                          }
                          onClear={() =>
                            onAnswerChange(question.questionId, "")
                          }
                          placeholder={
                            placeholder ?? String(question.questionId)
                          }
                          isReviewMode={isReviewMode}
                          correctAnswer={getCorrectAnswer(question.questionId)}
                          proximityActive={
                            proximitySlotId === question.questionId
                          }
                          catchFlash={caughtSlotId === question.questionId}
                          mapInteraction={mapInteraction}
                        />
                      </div>
                    </MatchingChoiceWidth>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {isCompactLayout && !isReviewMode ? null : (
          <section className="min-w-0 shrink-0">
            <p className="mb-2 min-h-[1.125rem] text-[0.6875rem] font-bold uppercase leading-snug tracking-wider text-[color:var(--exam-text-muted)]">
              Options
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {options.map((option, optionIndex) => (
                <li key={option}>
                  <MatchingChoiceWidth>
                    <MatchingDraggableOption
                      text={formatOptionDisplay(
                        optionLabel,
                        option,
                        optionIndex,
                      )}
                      value={option}
                      groupId={groupId}
                      isUsed={usedAnswers.has(option)}
                      isReviewMode={isReviewMode === true}
                    />
                  </MatchingChoiceWidth>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
