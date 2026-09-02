import { useState, type ReactElement } from "react";
import { Bookmark, Check, Grid, X } from "lucide-react";
import {
  hasAssessmentResponse,
  type AssessmentResponseMap,
  type CompiledAssessmentPart,
} from "@/domain/assessment";
import { handleExamDialogBackdropClick, useExamNativeDialog } from "@/shared/ui/exam/useExamNativeDialog";

function questionButtonClass(current: boolean, answered: boolean): string {
  if (current) return "border-[var(--exam-accent)] bg-[var(--exam-accent)] text-white";
  if (answered) return "border-emerald-200 bg-emerald-50 text-emerald-950";
  return "border-neutral-200 bg-neutral-50 text-neutral-800";
}

export function AssessmentQuestionNavigator({
  open,
  onOpenChange,
  part,
  currentItemId,
  responses,
  markedItemIds,
  onSelectItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: CompiledAssessmentPart;
  currentItemId: string;
  responses: AssessmentResponseMap;
  markedItemIds: string[];
  onSelectItem: (itemId: string) => void;
}): ReactElement {
  const [filterState, setFilterState] = useState<{
    partId: string;
    value: "all" | "review";
  }>({ partId: part.id, value: "all" });
  const dialogRef = useExamNativeDialog({ open, onOpenChange });
  const answeredCount = part.items.filter(
    (item) => hasAssessmentResponse(responses[item.id]),
  ).length;
  const markedCount = part.items.filter((item) => markedItemIds.includes(item.id)).length;
  const label = [part.groupTitle, part.title].filter(Boolean).join(" · ");
  const filter = filterState.partId === part.id ? filterState.value : "all";
  const setFilter = (value: "all" | "review") => setFilterState({ partId: part.id, value });

  return (
    <dialog
      ref={dialogRef}
      onClick={handleExamDialogBackdropClick}
      aria-labelledby="assessment-navigator-title"
      className="m-auto w-[min(92vw,34rem)] max-h-[85vh] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-950 shadow-2xl backdrop:bg-black/55"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <Grid size={16} />
          </span>
          <div>
            <h2 id="assessment-navigator-title" className="text-sm font-bold">
              Question navigator
            </h2>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close question navigator"
          className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-200"
        >
          <X size={18} />
        </button>
      </header>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3">
        <p className="text-xs text-neutral-600">
          <strong>{answeredCount}</strong> of <strong>{part.items.length}</strong> answered
          {markedCount ? ` · ${markedCount} marked` : ""}
        </p>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
          {(["all", "review"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-md px-2.5 py-1 ${
                filter === value ? "bg-white font-bold shadow-xs" : "text-neutral-500"
              }`}
            >
              {value === "all" ? `All (${part.items.length})` : `Marked (${markedCount})`}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[55vh] overflow-y-auto p-5">
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
          {part.items.map((item) => {
            const current = item.id === currentItemId;
            const answered = hasAssessmentResponse(responses[item.id]);
            const marked = markedItemIds.includes(item.id);
            if (filter === "review" && !marked) return null;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={current ? "true" : undefined}
                aria-label={`Question ${item.numberInPart}, ${answered ? "answered" : "unanswered"}${
                  marked ? ", marked" : ""
                }`}
                onClick={() => {
                  onSelectItem(item.id);
                  onOpenChange(false);
                }}
                className={`relative flex h-16 flex-col items-center justify-center rounded-xl border p-2 ${
                  questionButtonClass(current, answered)
                }`}
              >
                <span className="font-bold">{item.numberInPart}</span>
                <span className="mt-1 flex h-3 items-center gap-1">
                  {answered && !current ? <Check size={11} /> : null}
                  {marked ? (
                    <Bookmark size={11} className="fill-current text-amber-500" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        {filter === "review" && markedCount === 0 ? (
          <p className="py-8 text-center text-xs text-neutral-500">
            No questions are marked in this part.
          </p>
        ) : null}
      </div>
      <footer className="border-t border-neutral-200 bg-neutral-50 px-5 py-3 text-right">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
        >
          Close
        </button>
      </footer>
    </dialog>
  );
}
