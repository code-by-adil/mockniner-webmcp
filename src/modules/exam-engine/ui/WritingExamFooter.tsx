import { useMemo } from "react";
import { countWords } from "@/shared/text";
import {
  FooterActions,
  FOOTER_PART_CHIP_CLASS,
  type FooterBaseProps,
} from "./FooterActions";
interface WritingExamFooterProps extends FooterBaseProps {
  answers: Record<number, string>;
  parts: number[];
}

const WRITING_WORD_TARGETS: Record<number, number> = {
  1: 150,
  2: 250,
};

type WritingTaskSubmitDetail = {
  task: number;
  words: number;
  minimum: number;
  statusLabel: string;
  statusToneClass: string;
};

function getWritingSubmitDetails(
  parts: number[],
  answers: Record<number, string>,
) {
  const details: WritingTaskSubmitDetail[] = parts.map((part) => {
    const words = countWords(answers[part]);
    const minimum = WRITING_WORD_TARGETS[part] ?? 0;
    const remaining = Math.max(0, minimum - words);

    if (words === 0) {
      return {
        task: part,
        words,
        minimum,
        statusLabel: `Not started. Write at least ${minimum} words.`,
        statusToneClass: "text-zinc-500",
      };
    }

    if (remaining > 0) {
      return {
        task: part,
        words,
        minimum,
        statusLabel: `${remaining} more words to reach minimum`,
        statusToneClass: "text-amber-700",
      };
    }

    return {
      task: part,
      words,
      minimum,
      statusLabel: "Minimum reached",
      statusToneClass: "text-emerald-700",
    };
  });

  const startedTasks = details.filter((detail) => detail.words > 0).length;
  const minimumReachedTasks = details.filter(
    (detail) => detail.words >= detail.minimum,
  ).length;

  return {
    startedTasks,
    minimumReachedTasks,
    totalTasks: parts.length,
    details,
  };
}

export function WritingExamFooter({
  currentPart,
  answers,
  onPartChange,
  parts,
  position = "viewport",
  onSubmit,
  isSubmitting = false,
}: WritingExamFooterProps) {
  const totalParts = parts.length;
  const writingSubmitDetails = useMemo(
    () => getWritingSubmitDetails(parts, answers),
    [answers, parts],
  );
  const writingSubmitSummary = useMemo(
    () => (
      <div>
        <p className="text-sm font-semibold text-zinc-700">
          You started {writingSubmitDetails.startedTasks} of{" "}
          {writingSubmitDetails.totalTasks} tasks. Tasks meeting the minimum word count:{" "}
          {writingSubmitDetails.minimumReachedTasks} of {writingSubmitDetails.totalTasks}.
        </p>
        <div className="mt-3 space-y-1.5">
          {writingSubmitDetails.details.map((detail) => (
            <div
              key={detail.task}
              className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2"
            >
              <span className="text-sm font-semibold text-zinc-800">
                Task {detail.task}: {detail.words} words
              </span>
              <span
                className={`text-xs font-semibold ${detail.statusToneClass}`}
              >
                {detail.statusLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    [
      writingSubmitDetails.details,
      writingSubmitDetails.minimumReachedTasks,
      writingSubmitDetails.startedTasks,
      writingSubmitDetails.totalTasks,
    ],
  );
  const startedTasks = useMemo(
    () => parts.filter((part) => countWords(answers[part]) > 0).length,
    [answers, parts],
  );
  const currentPartWords = countWords(answers[currentPart]);
  const currentPartMinimum = WRITING_WORD_TARGETS[currentPart] ?? 0;
  const remainingCurrentPartWords = Math.max(
    0,
    currentPartMinimum - currentPartWords,
  );

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
            const minimumReached =
              minimum > 0 ? wordCount >= minimum : hasContent;
            const statusText = !hasContent
              ? "Not started"
              : minimumReached
                ? `${wordCount} words ✓`
                : `${wordCount}/${minimum}`;
            const statusTextDesktop = !hasContent
              ? "Not started"
              : minimumReached
                ? `Minimum reached (${wordCount} words)`
                : `In progress (${wordCount}/${minimum} words)`;

            return (
              <button
                type="button"
                key={part}
                onClick={() => onPartChange(part)}
                aria-current={isActive ? "true" : undefined}
                aria-label={`Task ${part}, ${statusTextDesktop}`}
                data-active={isActive ? "true" : "false"}
                className={`${FOOTER_PART_CHIP_CLASS} min-w-0 sm:min-w-[10.5rem]`}
              >
                <span className="text-xs font-bold tracking-wide sm:text-sm">
                  Task {part}
                </span>
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
                  : " Minimum reached. Review and submit when ready."}
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
          submitPrompt="Review both tasks before submitting. You cannot change your writing after submission."
        />
      </div>
    </footer>
  );
}
