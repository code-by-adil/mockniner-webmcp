import type { ReactElement } from "react";
import { X } from "lucide-react";
import type { AssessmentResource } from "@/domain/assessment";
import { handleExamDialogBackdropClick, useExamNativeDialog } from "@/shared/ui/exam/useExamNativeDialog";
import { AssessmentContentBlockView } from "./AssessmentContentBlockView";

export function AssessmentReferenceDialog({
  resource,
  open,
  onOpenChange,
}: {
  resource: AssessmentResource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const dialogRef = useExamNativeDialog({ open, onOpenChange });
  return (
    <dialog
      ref={dialogRef}
      onClick={handleExamDialogBackdropClick}
      aria-labelledby="assessment-reference-title"
      className="m-auto w-[min(92vw,44rem)] max-h-[85vh] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-950 shadow-2xl backdrop:bg-black/55"
    >
      {resource ? (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
            <div>
              <h2 id="assessment-reference-title" className="font-bold">{resource.title}</h2>
              {resource.description ? <p className="mt-1 text-xs text-neutral-500">{resource.description}</p> : null}
            </div>
            <button type="button" onClick={() => onOpenChange(false)} aria-label="Close reference document" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100">
              <X size={18} />
            </button>
          </header>
          <div className="space-y-4 overflow-y-auto p-5 sm:p-7">
            {resource.content.map((block, index) => <AssessmentContentBlockView key={index} block={block} />)}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
