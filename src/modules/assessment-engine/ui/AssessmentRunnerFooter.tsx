import type { ReactElement } from "react";
import { ArrowLeft, ArrowRight, Bookmark, SlidersHorizontal } from "lucide-react";
import {
  hasAssessmentResponse,
  type AssessmentResponseMap,
  type AssessmentItem,
  type AssessmentPart,
} from "@/domain/assessment";

export function AssessmentRunnerFooter({
  assessmentLabel,
  part,
  item,
  responses,
  markedItemIds,
  finalPart,
  onSetItem,
  onOpenNavigator,
  onAdvance,
}: {
  assessmentLabel: string;
  part: AssessmentPart;
  item: AssessmentItem;
  responses: AssessmentResponseMap;
  markedItemIds: string[];
  finalPart: boolean;
  onSetItem: (itemId: string) => void;
  onOpenNavigator: () => void;
  onAdvance: () => void;
}): ReactElement {
  const itemIndex = part.items.findIndex((candidate) => candidate.id === item.id);
  const itemNumber = itemIndex + 1;
  const finalItem = itemIndex === part.items.length - 1;
  const previousItem = part.items[itemIndex - 1];

  return (
    <footer className="relative z-30 h-[72px] shrink-0 border-t border-neutral-200 bg-white shadow-lg">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-6">
        <div className="min-w-0 shrink sm:w-44">
          <p className="truncate text-xs font-bold">{assessmentLabel}</p>
          <p className="truncate text-[11px] text-neutral-500">{part.title}</p>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          {part.navigation === "free" ? (
            <div className="flex max-w-full items-center gap-1.5 overflow-x-auto px-1 py-1">
              {part.items.map((candidate, candidateIndex) => {
                const current = candidate.id === item.id;
                const answered = hasAssessmentResponse(responses[candidate.id]);
                const marked = markedItemIds.includes(candidate.id);
                const stateClass = current
                  ? "bg-[var(--exam-accent)] text-white"
                  : answered
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border border-neutral-200 bg-neutral-50 text-neutral-700";
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => onSetItem(candidate.id)}
                    aria-current={current ? "true" : undefined}
                    aria-label={`Question ${candidateIndex + 1}, ${answered ? "answered" : "unanswered"}`}
                    className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold ${stateClass}`}
                  >
                    {candidateIndex + 1}
                    {marked ? (
                      <Bookmark
                        size={9}
                        className="absolute -right-1 -top-1 fill-current text-amber-500"
                      />
                    ) : null}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={onOpenNavigator}
                aria-label="Open question navigator"
                className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-bold text-neutral-700"
              >
                <SlidersHorizontal size={13} />
                <span className="hidden md:inline">Review</span>
              </button>
            </div>
          ) : (
            <p className="text-xs font-semibold text-neutral-600">
              Question {itemNumber} of {part.items.length}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:w-44 sm:justify-end">
          {part.navigation === "free" ? (
            <button
              type="button"
              disabled={!previousItem}
              onClick={() => {
                if (previousItem) onSetItem(previousItem.id);
              }}
              aria-label="Previous question"
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Back</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAdvance}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--exam-accent)] px-3.5 py-2 text-xs font-bold text-white hover:bg-[var(--exam-accent-hover)] sm:px-5"
          >
            {finalItem ? (finalPart ? "Submit" : "Finish part") : "Next"}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </footer>
  );
}
