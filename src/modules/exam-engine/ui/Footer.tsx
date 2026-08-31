import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react';
import {
  getObjectiveBlockQuestionIds,
  type ObjectiveContentDocument,
} from '@/domain/objectiveContent';
import {
  handleExamDialogBackdropClick,
  useExamNativeDialog,
} from '@/shared/ui/exam/useExamNativeDialog';
import { supportsNativeDialog } from '@/shared/ui/exam/cssAnchorPositioning';
import { scrollIntoViewNearest } from '@/shared/ui/exam/scrollIntoViewNearest';

interface ObjectiveFooterPart {
  part: number;
  questionNumbers: number[];
}

interface FooterBaseProps {
  currentPart: number;
  onPartChange: (part: number) => void;
  position?: 'viewport' | 'contained' | undefined;
  onSubmit?: (() => void) | undefined;
  isSubmitting?: boolean | undefined;
  submitSummary?: React.ReactNode | undefined;
  submitTitle?: string | undefined;
  submitPrompt?: string | undefined;
}

interface ObjectiveExamFooterProps extends FooterBaseProps {
  answers: Record<number, string>;
  parts: ObjectiveFooterPart[];
}

interface WritingExamFooterProps extends FooterBaseProps {
  answers: Record<number, string>;
  parts: number[];
}

const EXAM_PRIMARY_BUTTON_CLASS = [
  "exam-primary-button",
  "transition-colors",
].join(" ");

const FOOTER_PART_CHIP_CLASS =
  "exam-footer-part-chip flex min-h-10 shrink-0 flex-col items-start justify-center px-2.5 py-1.5 transition-colors sm:min-w-[5.5rem] sm:px-4 sm:py-2";

const FOOTER_QUESTION_CHIP_CLASS =
  "exam-footer-question-chip relative flex h-8 w-8 shrink-0 items-center justify-center text-[11px] font-bold transition-colors sm:h-9 sm:w-9 sm:text-xs";

const FOOTER_ICON_BUTTON_CLASS =
  "exam-icon-button flex items-center justify-center rounded-md border transition-colors disabled:opacity-50";

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
  return (
    document.getElementById(`question-${questionNumber}`) ??
    document.getElementById(`q-group-${questionNumber}`) ??
    document.getElementById(`question-input-${questionNumber}`)
  );
}

function getQuestionFromEventTarget(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;

  const idMatch = parseQuestionNumber(target.id);
  if (idMatch != null) return idMatch;

  const closestQuestionNode = target.closest<HTMLElement>('[id^="question-"], [id^="q-group-"], [id^="question-input-"]');
  if (closestQuestionNode) {
    const closestIdMatch = parseQuestionNumber(closestQuestionNode.id);
    if (closestIdMatch != null) return closestIdMatch;
  }

  if (target instanceof HTMLInputElement) {
    const nameMatch = parseQuestionNumber(target.name?.replace('_', '-'));
    if (nameMatch != null) return nameMatch;
  }

  return null;
}

function isAnsweredValue(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  return value.trim().length > 0;
}

function countWords(value: string | undefined): number {
  if (typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

const WRITING_WORD_TARGETS: Record<number, number> = {
  1: 150,
  2: 250,
};

function scrollToQuestion(questionNumber: number) {
  const element = findQuestionElement(questionNumber);
  if (!element) return;

  const focusTarget = element instanceof HTMLInputElement
    ? element
    : element.querySelector<HTMLInputElement>('input, textarea');

  element.classList.remove('target-highlight');
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      element.classList.add('target-highlight');
    });
  });
  void scrollIntoViewNearest(element, {
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest',
  });

  if (focusTarget && !focusTarget.disabled) {
    window.requestAnimationFrame(() => {
      focusTarget.focus({ preventScroll: true });
      if (focusTarget instanceof HTMLInputElement && focusTarget.type === 'text') {
        focusTarget.select();
      }
    });
  }

  setTimeout(() => {
    element.classList.remove('target-highlight');
  }, 2000);
}

function FooterActions({
  currentPart,
  totalParts,
  onPartChange,
  onSubmit,
  isSubmitting = false,
  submitSummary,
  submitTitle = 'Submit your test?',
  submitPrompt = 'Please make sure you have answered everything you want to answer. After you submit, you cannot change your answers.',
  hideNavigationOnMobile = false,
}: FooterBaseProps & { totalParts: number; hideNavigationOnMobile?: boolean }) {
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const useNative = supportsNativeDialog();
  const submitDialogRef = useExamNativeDialog({
    open: isSubmitConfirmOpen && useNative,
    onOpenChange: setIsSubmitConfirmOpen,
  });

  useEffect(() => {
    if (!isSubmitConfirmOpen || useNative) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSubmitConfirmOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitConfirmOpen, useNative]);

  const handleOpenSubmitConfirm = () => {
    if (isSubmitting || !onSubmit) return;
    setIsSubmitConfirmOpen(true);
  };

  const handleConfirmSubmit = () => {
    setIsSubmitConfirmOpen(false);
    onSubmit?.();
  };

  const submitConfirmBody = (
    <>
      <h2 id="submit-confirm-title" className="exam-strong-text text-2xl font-bold">
        {submitTitle}
      </h2>
      <p id="submit-confirm-description" className="exam-muted-text mt-3 text-base leading-6">
        {submitPrompt}
      </p>
      {submitSummary ? (
        <div className="exam-submit-dialog-summary mt-5 rounded-md border px-4 py-3 text-sm">
          {submitSummary}
        </div>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => setIsSubmitConfirmOpen(false)}
          className="exam-control-button h-10 rounded-md border px-4 text-sm font-semibold transition-colors"
        >
          Review Answers
        </button>
        <button
          type="button"
          onClick={handleConfirmSubmit}
          disabled={isSubmitting}
          className={`${EXAM_PRIMARY_BUTTON_CLASS} h-10 px-4 text-sm font-semibold`}
        >
          {isSubmitting ? 'Submitting…' : 'Yes, Submit Test'}
        </button>
      </div>
    </>
  );

  const submitConfirmModal = useNative ? (
    <dialog
      ref={submitDialogRef}
      className="exam-submit-dialog exam-native-dialog w-full max-w-[560px] rounded-lg border p-6 shadow-2xl"
      aria-labelledby="submit-confirm-title"
      aria-describedby="submit-confirm-description"
      onClick={handleExamDialogBackdropClick}
    >
      {submitConfirmBody}
    </dialog>
  ) : isSubmitConfirmOpen ? (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={() => setIsSubmitConfirmOpen(false)}
    >
      <div
        className="exam-submit-dialog w-full max-w-[560px] rounded-lg border p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-confirm-title"
        aria-describedby="submit-confirm-description"
        onClick={(event) => event.stopPropagation()}
      >
        {submitConfirmBody}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="exam-footer-actions flex h-full shrink-0 items-center gap-2 border-l pl-2 sm:gap-3 sm:pl-4">
        <div className={`flex items-center gap-1.5 sm:gap-2 ${hideNavigationOnMobile ? 'hidden sm:flex' : ''}`}>
          <button
            type="button"
            aria-label="Previous Part"
            onClick={() => onPartChange(Math.max(1, currentPart - 1))}
            disabled={currentPart === 1}
            className={`${FOOTER_ICON_BUTTON_CLASS} h-9 w-9 sm:h-10 sm:w-10`}
            title="Previous Part"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next Part"
            onClick={() => onPartChange(Math.min(totalParts, currentPart + 1))}
            disabled={currentPart === totalParts}
            className={`${FOOTER_ICON_BUTTON_CLASS} h-9 w-9 sm:h-10 sm:w-10`}
            title="Next Part"
          >
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        {onSubmit ? (
          <button
            type="button"
            aria-label="Submit Test"
            onClick={handleOpenSubmitConfirm}
            disabled={isSubmitting}
            className={`${EXAM_PRIMARY_BUTTON_CLASS} ml-0.5 flex items-center gap-1.5 py-2 text-xs font-bold uppercase sm:ml-1 sm:gap-2 sm:text-sm`}
          >
            <span className="hidden sm:inline">{isSubmitting ? 'Submitting…' : 'Submit Test'}</span>
            <span className="sm:hidden">{isSubmitting ? '…' : 'Submit'}</span>
            <Check size={16} strokeWidth={3} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {onSubmit ? (
        submitConfirmModal
      ) : null}
    </>
  );
}

function getObjectiveSubmitSummary(parts: ObjectiveFooterPart[], answers: Record<number, string>) {
  const totalQuestions = parts.reduce((sum, part) => sum + part.questionNumbers.length, 0);
  const answeredQuestions = parts.reduce(
    (sum, part) => sum + part.questionNumbers.filter((questionNumber) => isAnsweredValue(answers[questionNumber])).length,
    0,
  );
  return `You have answered ${answeredQuestions} of ${totalQuestions} questions.`;
}

type WritingTaskSubmitDetail = {
  task: number;
  words: number;
  minimum: number;
  statusLabel: string;
  statusToneClass: string;
};

function getWritingSubmitDetails(parts: number[], answers: Record<number, string>) {
  const details: WritingTaskSubmitDetail[] = parts.map((part) => {
    const words = countWords(answers[part]);
    const minimum = WRITING_WORD_TARGETS[part] ?? 0;
    const remaining = Math.max(0, minimum - words);

    if (words === 0) {
      return {
        task: part,
        words,
        minimum,
        statusLabel: `Not started (minimum ${minimum} words)`,
        statusToneClass: 'text-zinc-500',
      };
    }

    if (remaining > 0) {
      return {
        task: part,
        words,
        minimum,
        statusLabel: `${remaining} more words to reach minimum`,
        statusToneClass: 'text-amber-700',
      };
    }

    return {
      task: part,
      words,
      minimum,
      statusLabel: 'Minimum reached',
      statusToneClass: 'text-emerald-700',
    };
  });

  const startedTasks = details.filter((detail) => detail.words > 0).length;
  const minimumReachedTasks = details.filter((detail) => detail.words >= detail.minimum).length;

  return {
    startedTasks,
    minimumReachedTasks,
    totalTasks: parts.length,
    details,
  };
}

export function ObjectiveExamFooter({
  currentPart,
  answers,
  onPartChange,
  parts,
  position = 'contained',
  onSubmit,
  isSubmitting = false,
}: ObjectiveExamFooterProps) {
  const totalParts = parts.length;
  const currentPartQuestions = useMemo(
    () => parts.find((partDef) => partDef.part === currentPart)?.questionNumbers ?? [],
    [currentPart, parts],
  );
  const currentPartQuestionSet = useMemo(() => new Set(currentPartQuestions), [currentPartQuestions]);
  const submitSummary = useMemo(() => getObjectiveSubmitSummary(parts, answers), [answers, parts]);

  const [activeQuestion, setActiveQuestion] = useState<number | null>(null);
  const [isMobileMinimized, setIsMobileMinimized] = useState(false);

  useEffect(() => {
    const syncActiveQuestion = (event: Event) => {
      const questionNumber = getQuestionFromEventTarget(event.target);
      if (questionNumber == null || !currentPartQuestionSet.has(questionNumber)) return;
      setActiveQuestion(questionNumber);
    };

    // Active question should only change from explicit user interaction, not scroll position.
    window.addEventListener('focusin', syncActiveQuestion);
    window.addEventListener('pointerdown', syncActiveQuestion);

    return () => {
      window.removeEventListener('focusin', syncActiveQuestion);
      window.removeEventListener('pointerdown', syncActiveQuestion);
    };
  }, [currentPartQuestionSet]);

  useEffect(() => {
    if (activeQuestion == null || currentPartQuestionSet.has(activeQuestion)) return;
    setActiveQuestion(null);
  }, [activeQuestion, currentPartQuestionSet]);

  return (
    <footer
      data-mobile-minimized={isMobileMinimized ? 'true' : 'false'}
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
        aria-label={isMobileMinimized ? 'Expand footer navigation' : 'Minimize footer navigation'}
        onClick={() => setIsMobileMinimized((prev) => !prev)}
        className="exam-footer-collapse-toggle absolute -top-6 left-3 z-10 flex h-6 w-10 items-center justify-center rounded-t-md border border-b-0"
      >
        <ChevronDown size={16} aria-hidden="true" className="exam-footer-collapse-icon" />
      </button>

      <div id="exam-footer-panel" className="exam-footer-panel mx-auto max-w-[1400px] px-2 sm:px-4">
        <div className="exam-footer-compact flex min-h-[3.25rem] items-center gap-2">
          <div
            className="exam-footer-compact-parts grid min-w-0 flex-1 gap-1"
            style={{ gridTemplateColumns: `repeat(${totalParts}, minmax(0, 1fr))` }}
          >
            {parts.map((partDef) => {
              const isActive = currentPart === partDef.part;
              const answeredCount = partDef.questionNumbers.filter((q) => isAnsweredValue(answers[q])).length;
              const totalCount = partDef.questionNumbers.length;

              return (
                <button
                  type="button"
                  key={partDef.part}
                  onClick={() => onPartChange(partDef.part)}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`Part ${partDef.part}, ${answeredCount} of ${totalCount} answered`}
                  data-active={isActive ? 'true' : 'false'}
                  data-has-answers={answeredCount > 0 ? 'true' : 'false'}
                  className="exam-footer-compact-part flex min-h-9 flex-col items-center justify-center rounded-md px-1 py-1"
                >
                  <span className="text-xs font-bold leading-none tabular-nums">{partDef.part}</span>
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
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={currentPart}
                initial={{ opacity: 0, y: 15, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -15, filter: 'blur(2px)', transition: { duration: 0.15 } }}
                transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                className="exam-hide-scrollbar flex items-center gap-1.5 overflow-x-auto px-0.5 sm:gap-2 sm:px-2 sm:py-2"
              >
                {currentPartQuestions.map((questionNumber) => {
                  const isAnswered = isAnsweredValue(answers[questionNumber]);
                  const isActive = activeQuestion === questionNumber;
                  const chipState = isActive ? 'active' : isAnswered ? 'answered' : 'default';
                  return (
                    <button
                      type="button"
                      key={questionNumber}
                      data-state={chipState}
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={`Question ${questionNumber}${isAnswered ? ', answered' : ', not answered'}`}
                      onClick={() => {
                        setActiveQuestion(questionNumber);
                        scrollToQuestion(questionNumber);
                      }}
                      className={FOOTER_QUESTION_CHIP_CLASS}
                    >
                      {questionNumber}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            type="button"
            aria-label="Next Part"
            onClick={() => onPartChange(Math.min(totalParts, currentPart + 1))}
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
            const answeredCount = partDef.questionNumbers.filter((q) => isAnsweredValue(answers[q])).length;
            const totalCount = partDef.questionNumbers.length;

            return (
              <button
                type="button"
                key={partDef.part}
                onClick={() => onPartChange(partDef.part)}
                aria-current={isActive ? 'true' : undefined}
                aria-label={`Part ${partDef.part}, ${answeredCount} of ${totalCount} answered`}
                data-active={isActive ? 'true' : 'false'}
                className={FOOTER_PART_CHIP_CLASS}
              >
                <span className="text-xs font-bold tracking-wide sm:text-sm">Part {partDef.part}</span>
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

export function WritingExamFooter({
  currentPart,
  answers,
  onPartChange,
  parts,
  position = 'viewport',
  onSubmit,
  isSubmitting = false,
}: WritingExamFooterProps) {
  const totalParts = parts.length;
  const writingSubmitDetails = useMemo(() => getWritingSubmitDetails(parts, answers), [answers, parts]);
  const writingSubmitSummary = useMemo(() => (
    <div>
      <p className="text-sm font-semibold text-zinc-700">
        You started {writingSubmitDetails.startedTasks} of {writingSubmitDetails.totalTasks} tasks. Minimum reached in {writingSubmitDetails.minimumReachedTasks}.
      </p>
      <div className="mt-3 space-y-1.5">
        {writingSubmitDetails.details.map((detail) => (
          <div key={detail.task} className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2">
            <span className="text-sm font-semibold text-zinc-800">Task {detail.task}: {detail.words} words</span>
            <span className={`text-xs font-semibold ${detail.statusToneClass}`}>{detail.statusLabel}</span>
          </div>
        ))}
      </div>
    </div>
  ), [writingSubmitDetails.details, writingSubmitDetails.minimumReachedTasks, writingSubmitDetails.startedTasks, writingSubmitDetails.totalTasks]);
  const startedTasks = useMemo(
    () => parts.filter((part) => countWords(answers[part]) > 0).length,
    [answers, parts],
  );
  const currentPartWords = countWords(answers[currentPart]);
  const currentPartMinimum = WRITING_WORD_TARGETS[currentPart] ?? 0;
  const remainingCurrentPartWords = Math.max(0, currentPartMinimum - currentPartWords);

  return (
    <footer
      className={[
        "exam-footer h-[64px] border-t sm:h-[80px]",
        position === "contained"
          ? "relative z-10 w-full shrink-0"
          : "fixed bottom-0 left-0 right-0 z-50",
      ].join(" ")}
    >
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-2 px-2 sm:gap-6 sm:px-4">
        <div className="flex h-full shrink-0 items-center gap-1 py-1 sm:gap-2 sm:py-2">
          {parts.map((part) => {
            const isActive = currentPart === part;
            const wordCount = countWords(answers[part]);
            const minimum = WRITING_WORD_TARGETS[part] ?? 0;
            const hasContent = wordCount > 0;
            const minimumReached = minimum > 0 ? wordCount >= minimum : hasContent;
            const statusText = !hasContent
              ? 'Not started'
              : minimumReached
                ? `${wordCount} words ✓`
                : `${wordCount}/${minimum}`;
            const statusTextDesktop = !hasContent
              ? 'Not started'
              : minimumReached
                ? `Minimum reached (${wordCount} words)`
                : `In progress (${wordCount}/${minimum} words)`;

            return (
              <button
                type="button"
                key={part}
                onClick={() => onPartChange(part)}
                aria-current={isActive ? 'true' : undefined}
                aria-label={`Task ${part}, ${statusTextDesktop}`}
                data-active={isActive ? 'true' : 'false'}
                className={`${FOOTER_PART_CHIP_CLASS} min-w-0 sm:min-w-[10.5rem]`}
              >
                <span className="text-xs font-bold tracking-wide sm:text-sm">Task {part}</span>
                <span className="exam-footer-part-chip-meta text-[10px] font-medium sm:hidden">
                  {statusText}
                </span>
                <span className="exam-footer-part-chip-meta hidden text-[11px] font-medium sm:inline">
                  {statusTextDesktop}
                </span>
              </button>
            );
          })}
        </div>

        <div className="hidden flex-1 items-center justify-center lg:flex">
          <div className="exam-panel rounded-sm border px-4 py-2 text-center">
            <p className="exam-muted-text text-xs font-semibold">
              Started {startedTasks} of {totalParts} tasks
            </p>
            <p className="exam-subtle-text text-[11px]">
              Task {currentPart}: {currentPartWords} words written.
              {currentPartWords === 0
                ? ` Minimum is ${currentPartMinimum} words.`
                : remainingCurrentPartWords > 0
                  ? ` Write ${remainingCurrentPartWords} more words to reach the minimum.`
                  : ' Minimum reached. Review and submit when ready.'}
            </p>
          </div>
        </div>

        <FooterActions
          currentPart={currentPart}
          totalParts={totalParts}
          onPartChange={onPartChange}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          submitSummary={writingSubmitSummary}
          submitTitle="Submit your writing test?"
          submitPrompt="Please check both tasks before submitting. After you submit, you cannot edit your writing."
        />
      </div>
    </footer>
  );
}

export function buildObjectiveFooterParts(
  document: ObjectiveContentDocument,
): ObjectiveFooterPart[] {
  return document.parts.map((part) => ({
    part: part.id,
    questionNumbers: part.blocks.flatMap(getObjectiveBlockQuestionIds),
  }));
}
