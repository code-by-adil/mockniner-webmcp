import React from "react";
import { useIsCompactExamLayout } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { canAssignDragOption } from "./dragSelection";
import { DragOptionRegistry } from "./DragOptionRegistry";
import { useExamProximityDropLayer } from "./examProximityDrop";
import { type MapSlotCatchState } from "./mapSlotDragUi";
import { DraggableItem } from "./DraggableItem";
import { DropZone } from "./DropZone";

/** Shared width for answer slots and option chips (inline style survives exam layer reset). */
export const MATCHING_CHOICE_WIDTH_PX = 320;

export const MATCHING_CHOICE_WIDTH_STYLE: React.CSSProperties = {
  width: `${MATCHING_CHOICE_WIDTH_PX}px`,
  maxWidth: "100%",
};

function MatchingChoiceWidth({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full shrink-0", className)} style={MATCHING_CHOICE_WIDTH_STYLE}>
      {children}
    </div>
  );
}

const MATCHING_CHOICE_SURFACE_BASE =
  "box-border flex w-full min-h-11 items-center rounded-md border px-2.5 py-2 text-left touch-manipulation transition-[border-color,background-color,box-shadow,transform] duration-100 ease-out";

/** Highlight snap while dragging (tight — one row at a time). */
export const MATCHING_DROP_SNAP_PX = 12;
/** Looser snap on release — pointer often lags behind the drag ghost. */
export const MATCHING_DROP_RELEASE_SNAP_PX = 28;
/** Accept drops slightly outside the padded row box. */
export const MATCHING_DROP_MAX_EDGE_PX = 12;

/** Drop target surface — map catch states with exam theme tokens (full-width matching slot). */
export function matchingSlotSurfaceClass({
  isReviewMode,
  isCorrect,
  hasValue,
  catchState,
  tapHighlighted,
}: {
  isReviewMode: boolean;
  isCorrect: boolean;
  hasValue: boolean;
  catchState: MapSlotCatchState;
  tapHighlighted: boolean;
}): string {
  if (isReviewMode) {
    return cn(
      MATCHING_CHOICE_SURFACE_BASE,
      "cursor-default",
      isCorrect
        ? "border-[color:var(--exam-success-border)] bg-[color:var(--exam-success-bg)] text-[color:var(--exam-success-fg)]"
        : "border-[color:var(--exam-danger-border)] bg-[color:var(--exam-danger-bg)] text-[color:var(--exam-danger-fg)]",
    );
  }

  if (catchState === "caught") {
    return cn(
      MATCHING_CHOICE_SURFACE_BASE,
      "cursor-pointer scale-[1.01] border-2 border-solid border-sky-600 bg-sky-100 shadow-[0_0_0_3px_rgba(2,132,199,0.35)]",
    );
  }

  if (catchState === "targeted") {
    return cn(
      MATCHING_CHOICE_SURFACE_BASE,
      "cursor-pointer border-2 border-dashed border-sky-500 bg-sky-50/95 shadow-[0_0_0_2px_rgba(14,165,233,0.28)]",
    );
  }

  if (catchState === "droppable") {
    return cn(
      MATCHING_CHOICE_SURFACE_BASE,
      "cursor-pointer justify-center border border-dashed border-sky-300/90 bg-sky-50/40 text-[color:var(--exam-text-subtle)]",
    );
  }

  if (hasValue) {
    return cn(
      MATCHING_CHOICE_SURFACE_BASE,
      "cursor-pointer border-[color:var(--exam-input-border-filled)] bg-[color:var(--exam-surface)] shadow-[var(--shadow-sm)]",
    );
  }

  if (tapHighlighted) {
    return cn(
      MATCHING_CHOICE_SURFACE_BASE,
      "cursor-pointer justify-center border-[color:var(--exam-text)] bg-[color:var(--exam-control-hover-bg)] ring-2 ring-[color:var(--exam-highlight-ring)]",
    );
  }

  return cn(
    MATCHING_CHOICE_SURFACE_BASE,
    "cursor-pointer justify-center border-dashed border-[color:var(--exam-input-border-idle)] bg-[color:var(--exam-control-bg)] text-[color:var(--exam-text-subtle)]",
  );
}

export function splitMatchingChoiceLabel(text: string): { letter: string; name: string } {
  const match = text.match(/^([A-Z])\.\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return { letter: match[1].toUpperCase(), name: match[2] };
  }
  return { letter: "", name: text };
}

export function MatchingChoiceLabel({
  text,
  muted = false,
  letterTone = "filled",
  clampName = false,
}: {
  text: string;
  muted?: boolean;
  /** `option` = bank (active); `used` = already matched; `filled` = answer slot. */
  letterTone?: "option" | "used" | "filled";
  /** Single-line ellipsis for narrow tap-to-pick slots on compact exam layout. */
  clampName?: boolean;
}) {
  const { letter, name } = splitMatchingChoiceLabel(text);

  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-2.5", muted && "opacity-70")} title={text}>
      {letter ? (
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            letterTone === "used" &&
              "border border-[color:var(--exam-border-muted)]/80 bg-[color:var(--exam-surface-muted)] text-[color:var(--exam-text-subtle)]",
            letterTone === "option" &&
              "border border-[color:var(--exam-border-muted)] bg-[color:var(--exam-surface)] text-[color:var(--exam-text-muted)]",
            letterTone === "filled" &&
              (muted
                ? "bg-[color:var(--exam-chip-answered-bg)] text-[color:var(--exam-chip-answered-fg)]"
                : "border border-[color:var(--exam-border-muted)] bg-[color:var(--exam-surface)] text-[color:var(--exam-text)]"),
          )}
        >
          {letter}
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 text-sm leading-snug",
          clampName && "truncate",
          letterTone === "used" && "font-normal text-[color:var(--exam-text-subtle)]",
          letterTone === "option" && "font-normal text-[color:var(--exam-text)]",
          letterTone === "filled" && "font-medium",
        )}
      >
        {name}
      </span>
    </span>
  );
}

/** Draggable option chip — theme tokens; sky highlight when selected. */
export function matchingDraggableSurfaceClass({
  isUsed,
  isReviewMode,
  isSelected,
}: {
  isUsed: boolean;
  isReviewMode: boolean;
  isSelected: boolean;
}): string {
  return cn(
    MATCHING_CHOICE_SURFACE_BASE,
    "select-none",
    isReviewMode && "cursor-default text-[color:var(--exam-text-subtle)]",
    !isReviewMode &&
      isUsed &&
      "cursor-default border-[color:var(--exam-border-muted)]/50 bg-[color:var(--exam-surface-muted)] opacity-[0.38] shadow-none saturate-[0.2] contrast-[0.92]",
    !isReviewMode &&
      !isUsed &&
      isSelected &&
      "cursor-grab border-sky-600 bg-sky-50 shadow-[0_0_0_2px_rgba(14,165,233,0.28)] active:cursor-grabbing",
    !isReviewMode &&
      !isUsed &&
      !isSelected &&
      "cursor-grab border-[color:var(--exam-border-muted)] bg-[color:var(--exam-control-bg)] shadow-[var(--shadow-sm)] hover:border-sky-400 hover:bg-sky-50/60 active:cursor-grabbing",
  );
}

/** Opaque drag chip — built in DOM (no clone) so the browser does not apply frosted/ghost styling. */
function readExamThemeToken(
  source: EventTarget & Element,
  token: string,
  fallback: string,
): string {
  const layer = source.closest(".ui-layer-exam") ?? source;
  const value = getComputedStyle(layer).getPropertyValue(token).trim();
  return value || fallback;
}

export function mountMatchingDragGhost(
  event: React.DragEvent,
  text: string,
  widthPx: number,
): void {
  if (typeof document === "undefined") return;

  const source = event.currentTarget;
  if (!(source instanceof Element)) return;

  const surface = readExamThemeToken(source, "--exam-surface", "#ffffff");
  const textColor = readExamThemeToken(source, "--exam-text", "#0f172a");
  const mutedText = readExamThemeToken(source, "--exam-text-muted", "#475569");
  const border = readExamThemeToken(source, "--exam-info-fg", "#0284c7");
  const badgeBorder = readExamThemeToken(source, "--exam-border-muted", "#cbd5e1");
  const shadow = readExamThemeToken(source, "--shadow-lg", "0 6px 16px rgba(15,23,42,0.18)");

  const { letter, name } = splitMatchingChoiceLabel(text);
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = [
    "position:fixed",
    "top:-9999px",
    "left:-9999px",
    "z-index:99999",
    "pointer-events:none",
    "box-sizing:border-box",
    "display:flex",
    "align-items:center",
    "gap:10px",
    `width:${widthPx}px`,
    "min-height:44px",
    "padding:8px 10px",
    "border-radius:6px",
    `border:2px solid ${border}`,
    `background:${surface}`,
    `color:${textColor}`,
    `box-shadow:${shadow}`,
    "opacity:1",
    "filter:none",
    "backdrop-filter:none",
    "-webkit-backdrop-filter:none",
  ].join(";");

  if (letter) {
    const badge = document.createElement("span");
    badge.textContent = letter;
    badge.style.cssText = [
      "flex-shrink:0",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "width:28px",
      "height:28px",
      "border-radius:9999px",
      `border:1px solid ${badgeBorder}`,
      `background:${surface}`,
      `color:${mutedText}`,
      "font-size:12px",
      "font-weight:600",
      "font-family:system-ui,sans-serif",
    ].join(";");
    root.appendChild(badge);
  }

  const label = document.createElement("span");
  label.textContent = name;
  label.style.cssText = [
    "flex:1",
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "font-size:14px",
    "font-weight:500",
    "line-height:1.25",
    "font-family:system-ui,sans-serif",
    `color:${textColor}`,
  ].join(";");
  root.appendChild(label);

  document.body.appendChild(root);
  event.dataTransfer.setDragImage(root, widthPx / 2, 22);
  requestAnimationFrame(() => root.remove());
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
  const resolvedInteraction = mapInteraction ?? (isCompactLayout ? "tap" : "drag");

  return (
    <DropZone
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

function formatOptionDisplay(optionLabel: (index: number) => string, option: string, index: number) {
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

  const registryOptions = React.useMemo(
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
      return canAssignDragOption(groupId, value, currentValue);
    },
    [answers, groupId],
  );

  const { proximitySlotId, caughtSlotId, registerSlotHost, dropFrameHandlers, flashCaughtSlot } =
    useExamProximityDropLayer({
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
                <li key={question.questionId} className="flex items-stretch gap-2.5 sm:gap-3">
                  <span className="w-[4.25rem] shrink-0 self-center text-sm font-semibold leading-snug text-[color:var(--exam-text)] sm:w-[4.5rem]">
                    {question.label}
                  </span>
                  {isCompactLayout ? (
                    <div
                      ref={registerSlotHost(question.questionId)}
                      className="relative min-w-0 flex-1"
                    >
                      <MatchingAnswerSlot
                        id={question.questionId}
                        groupId={groupId}
                        value={answerValue}
                        {...(displayValue !== undefined ? { displayValue } : {})}
                        onDrop={(value) => handleSlotAssign(question.questionId, value)}
                        onClear={() => onAnswerChange(question.questionId, "")}
                        placeholder={placeholder ?? String(question.questionId)}
                        isReviewMode={isReviewMode}
                        correctAnswer={getCorrectAnswer(question.questionId)}
                        proximityActive={proximitySlotId === question.questionId}
                        catchFlash={caughtSlotId === question.questionId}
                        mapInteraction={mapInteraction}
                      />
                    </div>
                  ) : (
                    <MatchingChoiceWidth>
                      <div ref={registerSlotHost(question.questionId)} className="relative w-full">
                        <MatchingAnswerSlot
                          id={question.questionId}
                          groupId={groupId}
                          value={answerValue}
                          {...(displayValue !== undefined ? { displayValue } : {})}
                          onDrop={(value) => handleSlotAssign(question.questionId, value)}
                          onClear={() => onAnswerChange(question.questionId, "")}
                          placeholder={placeholder ?? String(question.questionId)}
                          isReviewMode={isReviewMode}
                          correctAnswer={getCorrectAnswer(question.questionId)}
                          proximityActive={proximitySlotId === question.questionId}
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

        {isCompactLayout && !isReviewMode ? (
          <DragOptionRegistry groupId={groupId} options={registryOptions} />
        ) : (
          <section className="min-w-0 shrink-0">
            <p className="mb-2 min-h-[1.125rem] text-[0.6875rem] font-bold uppercase leading-snug tracking-wider text-[color:var(--exam-text-muted)]">
              Options
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {options.map((option, optionIndex) => (
                <li key={option}>
                  <MatchingChoiceWidth>
                    <MatchingDraggableOption
                      text={formatOptionDisplay(optionLabel, option, optionIndex)}
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
