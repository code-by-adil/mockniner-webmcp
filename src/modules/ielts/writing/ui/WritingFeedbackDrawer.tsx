import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { supportsNativeDialog } from '@/shared/ui/exam/cssAnchorPositioning';
import { handleExamDialogBackdropClick, useExamNativeDialog } from '@/shared/ui/exam/useExamNativeDialog';

export function WritingFeedbackDrawer({ open, onOpenChange, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const native = supportsNativeDialog();
  const dialogRef = useExamNativeDialog({ open: open && native, onOpenChange });
  const content = <>
    <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2">
      <div>
        <h2 id="writing-review-corrections-title" className="text-sm font-bold text-gray-900">Writing Review Corrections</h2>
        <p id="writing-review-corrections-description" className="text-xs font-medium text-gray-600">Detailed corrections and agent feedback.</p>
      </div>
      <button type="button" aria-label="Close writing review corrections" onClick={() => onOpenChange(false)} className="shrink-0 rounded px-2 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
  </>;

  if (native) return <dialog
    ref={dialogRef}
    className="exam-writing-corrections-dialog exam-native-dialog exam-answer-picker-dialog--sheet open:flex h-[85vh] w-full flex-col overflow-hidden rounded-t-[10px] border border-gray-200 bg-gray-50 p-0 shadow-2xl"
    aria-labelledby="writing-review-corrections-title"
    aria-describedby="writing-review-corrections-description"
    onClick={handleExamDialogBackdropClick}
  >{content}</dialog>;

  if (!open) return null;
  return <div className="fixed inset-0 z-[70] flex items-end bg-black/35 px-3 pb-3" role="presentation" onClick={() => onOpenChange(false)}>
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="writing-review-corrections-title"
      aria-describedby="writing-review-corrections-description"
      className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-[10px] border border-gray-200 bg-gray-50 shadow-2xl"
      onClick={event => event.stopPropagation()}
    >{content}</section>
  </div>;
}
