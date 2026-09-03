import type { ReactElement } from "react";
import { handleExamDialogBackdropClick, useExamNativeDialog } from "@/shared/ui/exam/useExamNativeDialog";

export function AssessmentBoundaryDialog({
  open,
  onOpenChange,
  partTitle,
  finalPart,
  unansweredCount,
  constrainedResponseCount,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partTitle: string;
  finalPart: boolean;
  unansweredCount: number;
  constrainedResponseCount: number;
  submitting: boolean;
  onConfirm: () => Promise<void>;
}): ReactElement {
  const dialogRef = useExamNativeDialog({ open, onOpenChange });
  const unansweredLabel = unansweredCount === 1 ? "question is" : "questions are";
  const constrainedLabel = constrainedResponseCount === 1 ? "response does" : "responses do";

  return (
    <dialog
      ref={dialogRef}
      onClick={handleExamDialogBackdropClick}
      aria-labelledby="assessment-boundary-title"
      className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-950 shadow-2xl backdrop:bg-black/55"
    >
      <div className="p-6">
        <h2 id="assessment-boundary-title" className="text-lg font-bold">
          {finalPart ? "Submit assessment?" : `Finish ${partTitle}?`}
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {finalPart
            ? "Your answers will be saved and scored. You cannot change them after submission."
            : "You cannot return to this part after continuing."}
          {unansweredCount ? ` ${unansweredCount} ${unansweredLabel} unanswered.` : ""}
          {constrainedResponseCount
            ? ` ${constrainedResponseCount} ${constrainedLabel} not meet the question requirements and will be submitted as written.`
            : ""}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
          >
            Keep working
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-[var(--exam-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Saving…" : finalPart ? "Submit" : "Continue"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
