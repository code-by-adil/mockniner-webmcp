import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import type { ObjectiveFooterPart } from "@/modules/exam-engine/footerParts";
import { scrollIntoViewNearest } from "@/shared/ui/exam/scrollIntoViewNearest";
import { findObjectiveQuestion } from '@/shared/ui/exam/findObjectiveQuestion';
import {
  FooterActions,
  FOOTER_ICON_BUTTON_CLASS,
  FOOTER_PART_CHIP_CLASS,
  type FooterBaseProps,
} from "./FooterActions";
interface ObjectiveExamFooterProps extends FooterBaseProps {
  selectedQuestionId?: number | null;
  onQuestionSelect?: (questionId: number) => void;
  answers: Record<number, string>;
  parts: ObjectiveFooterPart[];
}

const FOOTER_QUESTION_CHIP_CLASS =
  "exam-footer-question-chip relative flex h-8 w-8 shrink-0 items-center justify-center text-[11px] font-bold transition-colors sm:h-9 sm:w-9 sm:text-xs";

const QUESTION_ID_PATTERNS = [
  /^question-(\d+)$/,
  /^q-group-(\d+)$/,
  /^question-input-(\d+)$/,
];

function parseQuestionNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  for (const pattern of QUESTION_ID_PATTERNS) {
    const match = value.match(pattern);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function findQuestionElement(questionNumber: number): HTMLElement | null {
  return findObjectiveQuestion(document, questionNumber);
}

function getQuestionFromEventTarget(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;

  const idMatch = parseQuestionNumber(target.id);
  if (idMatch != null) return idMatch;

  const closestQuestionNode = target.closest<HTMLElement>(
    '[id^="question-"], [id^="q-group-"], [id^="question-input-"]',
  );
  if (closestQuestionNode) {
    const closestIdMatch = parseQuestionNumber(closestQuestionNode.id);
    if (closestIdMatch != null) return closestIdMatch;
  }

  if (target instanceof HTMLInputElement) {
    const nameMatch = parseQuestionNumber(target.name?.replace("_", "-"));
    if (nameMatch != null) return nameMatch;
  }

  return null;
}

function isAnsweredValue(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  return value.trim().length > 0;
}

function scrollToQuestion(questionNumber: number) {
  const element = findQuestionElement(questionNumber);
  if (!element) return;

  const focusTarget =
    element instanceof HTMLInputElement
      ? element
      : element.querySelector<HTMLInputElement>("input, textarea");

  element.classList.remove("target-highlight");
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      element.classList.add("target-highlight");
    });
  });
  void scrollIntoViewNearest(element, {
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });

  if (focusTarget && !focusTarget.disabled) {
    window.requestAnimationFrame(() => {
      focusTarget.focus({ preventScroll: true });
      if (
        focusTarget instanceof HTMLInputElement &&
        focusTarget.type === "text"
      ) {
        focusTarget.select();
      }
    });
  } else {
    element.tabIndex = -1;
    element.focus({ preventScroll: true });
  }

  setTimeout(() => {
    element.classList.remove("target-highlight");
  }, 2000);
}

function getObjectiveSubmitSummary(
  parts: ObjectiveFooterPart[],
  answers: Record<number, string>,
) {
  const totalQuestions = parts.reduce(
    (sum, part) => sum + part.questionNumbers.length,
    0,
  );
  const answeredQuestions = parts.reduce(
    (sum, part) =>
      sum +
      part.questionNumbers.filter((questionNumber) =>
        isAnsweredValue(answers[questionNumber]),
      ).length,
    0,
  );
  return `You have answered ${answeredQuestions} of ${totalQuestions} questions.`;
}

export function ObjectiveExamFooter({
  currentPart,
  answers,
  onPartChange,
  parts,
  position = "contained",
  onSubmit,
  isSubmitting = false,
  selectedQuestionId,
  onQuestionSelect,
}: ObjectiveExamFooterProps) {
  const totalParts = parts.length;
  const currentPartQuestions = useMemo(
    () =>
      parts.find((partDef) => partDef.part === currentPart)?.questionNumbers ??
      [],
    [currentPart, parts],
  );
  const currentPartQuestionSet = useMemo(
    () => new Set(currentPartQuestions),
    [currentPartQuestions],
  );
  const submitSummary = useMemo(
    () => getObjectiveSubmitSummary(parts, answers),
    [answers, parts],
  );

  const [localActiveQuestion, setActiveQuestion] = useState<number | null>(null);
  const activeQuestion = onQuestionSelect ? selectedQuestionId ?? null : localActiveQuestion;
  const [isMobileMinimized, setIsMobileMinimized] = useState(false);
  const visibleActiveQuestion =
    activeQuestion != null && currentPartQuestionSet.has(activeQuestion)
      ? activeQuestion
      : null;

  useEffect(() => {
    if (onQuestionSelect) return;
    const syncActiveQuestion = (event: Event) => {
      const questionNumber = getQuestionFromEventTarget(event.target);
      if (questionNumber == null || !currentPartQuestionSet.has(questionNumber))
        return;
      setActiveQuestion(questionNumber);
    };

    // Active question should only change from explicit user interaction, not scroll position.
    window.addEventListener("focusin", syncActiveQuestion);
    window.addEventListener("pointerdown", syncActiveQuestion);

    return () => {
      window.removeEventListener("focusin", syncActiveQuestion);
      window.removeEventListener("pointerdown", syncActiveQuestion);
    };
  }, [currentPartQuestionSet, onQuestionSelect]);

  useEffect(() => {
    if (onQuestionSelect && selectedQuestionId != null && currentPartQuestionSet.has(selectedQuestionId)) scrollToQuestion(selectedQuestionId);
  }, [selectedQuestionId, currentPartQuestionSet, onQuestionSelect]);

  return (
    <footer
      data-mobile-minimized={isMobileMinimized ? "true" : "false"}
      className={[
        "exam-footer relative shrink-0 border-t pb-[env(safe-area-inset-bottom)] sm:h-[80px] sm:pb-0",
        position === "contained"
          ? "relative z-10 w-full"
          : "fixed bottom-0 left-0 right-0 z-50",
      ].join(" ")}
    >
      <button
        type="button"
        aria-expanded={!isMobileMinimized}
        aria-controls="exam-footer-panel"
        aria-label={
          isMobileMinimized
            ? "Expand footer navigation"
            : "Minimize footer navigation"
        }
        onClick={() => setIsMobileMinimized((prev) => !prev)}
        className="exam-footer-collapse-toggle absolute -top-6 left-3 z-10 flex h-6 w-10 items-center justify-center rounded-t-md border border-b-0"
      >
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="exam-footer-collapse-icon"
        />
      </button>

      <div
        id="exam-footer-panel"
        className="exam-footer-panel mx-auto max-w-[1400px] px-2 sm:px-4"
      >
        <div className="exam-footer-compact flex min-h-[3.25rem] items-center gap-2">
          <div
            className="exam-footer-compact-parts grid min-w-0 flex-1 gap-1"
            style={{
              gridTemplateColumns: `repeat(${totalParts}, minmax(0, 1fr))`,
            }}
          >
            {parts.map((partDef) => {
              const isActive = currentPart === partDef.part;
              const answeredCount = partDef.questionNumbers.filter((q) =>
                isAnsweredValue(answers[q]),
              ).length;
              const totalCount = partDef.questionNumbers.length;

              return (
                <button
                  type="button"
                  key={partDef.part}
                  onClick={() => onPartChange(partDef.part)}
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`Part ${partDef.part}, ${answeredCount} of ${totalCount} answered`}
                  data-active={isActive ? "true" : "false"}
                  data-has-answers={answeredCount > 0 ? "true" : "false"}
                  className="exam-footer-compact-part flex min-h-9 flex-col items-center justify-center rounded-md px-1 py-1"
                >
                  <span className="text-xs font-bold leading-none tabular-nums">
                    {partDef.part}
                  </span>
                  <span className="exam-footer-compact-part-meta mt-0.5 text-[9px] font-medium leading-none tabular-nums">
                    {answeredCount}/{totalCount}
                  </span>
                </button>
              );
            })}
          </div>

          <FooterActions
            currentPart={currentPart}
            totalParts={totalParts}
            onPartChange={onPartChange}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
            submitSummary={submitSummary}
            hideNavigationOnMobile
          />
        </div>

        <div className="exam-footer-expanded flex h-full flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          {/* Mobile Upper Level: Question Chips & Mobile Nav (Center on Desktop) */}
          <div className="exam-footer-strip relative order-1 flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden border-b py-2 sm:order-2 sm:max-w-2xl sm:justify-center sm:border-b-0 sm:py-0">
            <button
              type="button"
              aria-label="Previous Part"
              onClick={() => onPartChange(Math.max(1, currentPart - 1))}
              disabled={currentPart === 1}
              className={`${FOOTER_ICON_BUTTON_CLASS} h-8 w-8 shrink-0 sm:hidden`}
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>

            <div className="relative flex min-w-0 flex-1 justify-center">
              <div className="exam-hide-scrollbar flex items-center gap-1.5 overflow-x-auto px-0.5 sm:gap-2 sm:px-2 sm:py-2">
                {currentPartQuestions.map((questionNumber) => {
                  const isAnswered = isAnsweredValue(answers[questionNumber]);
                  const isActive = visibleActiveQuestion === questionNumber;
                  const chipState = isActive
                    ? "active"
                    : isAnswered
                      ? "answered"
                      : "default";
                  return (
                    <button
                      type="button"
                      key={questionNumber}
                      data-state={chipState}
                      aria-current={isActive ? "true" : undefined}
                      aria-label={`Question ${questionNumber}${isAnswered ? ", answered" : ", not answered"}`}
                      onClick={() => {
                        if (onQuestionSelect) onQuestionSelect(questionNumber);
                        else { setActiveQuestion(questionNumber); scrollToQuestion(questionNumber); }
                      }}
                      className={FOOTER_QUESTION_CHIP_CLASS}
                    >
                      {questionNumber}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              aria-label="Next Part"
              onClick={() =>
                onPartChange(Math.min(totalParts, currentPart + 1))
              }
              disabled={currentPart === totalParts}
              className={`${FOOTER_ICON_BUTTON_CLASS} h-8 w-8 shrink-0 sm:hidden`}
            >
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Mobile Bottom Level: Parts & Actions */}
          <div className="order-2 flex min-h-14 items-center justify-between gap-2 sm:order-1 sm:min-h-0 sm:h-full sm:contents">
            {/* Left: Parts */}
            <div className="exam-hide-scrollbar flex h-full shrink-0 items-center gap-1.5 overflow-x-auto py-1 sm:gap-2 sm:py-2">
              {parts.map((partDef) => {
                const isActive = currentPart === partDef.part;
                const answeredCount = partDef.questionNumbers.filter((q) =>
                  isAnsweredValue(answers[q]),
                ).length;
                const totalCount = partDef.questionNumbers.length;

                return (
                  <button
                    type="button"
                    key={partDef.part}
                    onClick={() => onPartChange(partDef.part)}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`Part ${partDef.part}, ${answeredCount} of ${totalCount} answered`}
                    data-active={isActive ? "true" : "false"}
                    className={FOOTER_PART_CHIP_CLASS}
                  >
                    <span className="text-xs font-bold tracking-wide sm:text-sm">
                      Part {partDef.part}
                    </span>
                    <span className="exam-footer-part-chip-meta text-[10px] font-medium tabular-nums sm:text-[11px]">
                      {answeredCount}/{totalCount}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Mobile Submit Actions */}
            <div className="flex shrink-0 sm:order-3 sm:h-full py-1 sm:py-0">
              <FooterActions
                currentPart={currentPart}
                totalParts={totalParts}
                onPartChange={onPartChange}
                onSubmit={onSubmit}
                isSubmitting={isSubmitting}
                submitSummary={submitSummary}
                hideNavigationOnMobile
              />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
