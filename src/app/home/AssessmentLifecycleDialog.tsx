import { useState, type ReactElement } from "react";
import { X } from "lucide-react";
import type { AssessmentPackage } from "@/domain/assessment";
import {
  handleExamDialogBackdropClick,
  useExamNativeDialog,
} from "@/shared/ui/exam/useExamNativeDialog";

export type AssessmentLifecycleAction =
  | { type: "restart"; assessment: AssessmentPackage }
  | { type: "discard"; assessment: AssessmentPackage }
  | { type: "delete"; assessment: AssessmentPackage };

function getDialogCopy(action: AssessmentLifecycleAction) {
  switch (action.type) {
    case "restart":
      return {
        title: "Restart assessment?",
        message: `Your answers and progress in ${action.assessment.title} will be cleared, and a new attempt will begin.`,
        confirmLabel: "Restart",
      };
    case "discard":
      return {
        title: "Discard unfinished attempt?",
        message: `Your answers and progress in ${action.assessment.title} will be cleared. Submitted attempts are not affected.`,
        confirmLabel: "Discard",
      };
    case "delete":
      return {
        title: "Delete assessment?",
        message: `${action.assessment.title} will be removed from this device. Any unfinished attempt for it will be discarded, while submitted attempts and results remain in history.`,
        confirmLabel: "Delete",
      };
  }
}

export function AssessmentLifecycleDialog({
  action,
  onClose,
  onConfirm,
}: {
  action: AssessmentLifecycleAction | null;
  onClose: () => void;
  onConfirm: (action: AssessmentLifecycleAction) => Promise<void>;
}): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useExamNativeDialog({
    open: action !== null,
    onOpenChange: (open) => {
      if (!open && !submitting) onClose();
    },
    closedBy: submitting ? "none" : "any",
  });

  const handleConfirm = async () => {
    if (!action || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(action);
      setSubmitting(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assessment could not be updated.");
      setSubmitting(false);
    }
  };

  const copy = action ? getDialogCopy(action) : null;
  return (
    <dialog
      ref={dialogRef}
      onClick={handleExamDialogBackdropClick}
      aria-labelledby="assessment-lifecycle-title"
      className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-950 shadow-2xl backdrop:bg-black/55"
    >
      {action && copy ? (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="assessment-lifecycle-title" className="text-lg font-bold">
                {copy.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{copy.message}</p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleConfirm()}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {submitting ? "Working…" : copy.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
