import type { ReactElement } from "react";
import { X } from "lucide-react";
import { CopyButton } from '@/shared/ui/CopyButton';
import { handleExamDialogBackdropClick, useExamNativeDialog } from '@/shared/ui/exam/useExamNativeDialog';

const PROMPT_SUGGESTIONS = [
  "Create a short SAT-style practice test focused on algebra and inference.",
  "Make a six-question biology quiz with multiple choice and one short written answer.",
  "Create a 40-question IELTS Academic Reading test about renewable energy.",
  "Review my latest IELTS Writing submission and suggest what to practise next.",
];

export function WebMcpHelpDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const dialog = useExamNativeDialog({ open, onOpenChange: next => { if (!next) onClose(); } });

  return (
    <dialog
      ref={dialog}
      aria-labelledby="agent-help-title"
      onClick={handleExamDialogBackdropClick}
      className="exam-native-dialog m-auto w-[min(42rem,calc(100vw-2rem))] max-h-[88vh] open:flex flex-col rounded-2xl border border-neutral-200 bg-white p-0 shadow-2xl overflow-hidden"
      style={{ maxWidth: '42rem' }}
    >
        {/* Dialog Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-neutral-100">
          <div>
            <h2 id="agent-help-title" className="text-lg font-bold text-neutral-900 leading-tight">
              Practice with your agent
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Create a test, review your work, and plan your next practice session.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Dialog Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* How it works */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold text-neutral-900">
              How to get started
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Open this site in an agent browser that supports WebMCP, then ask your agent to create practice or review a completed test. New tests and feedback appear here, alongside your saved work.
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-neutral-100/70 border border-neutral-200/60 p-3.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <div className="font-semibold text-neutral-900">
                You complete the test. Your agent helps you improve.
              </div>
              <div className="text-neutral-500 text-[11px]">
                Your agent can find a test, resume saved practice, and review submitted answers. To receive feedback, open your results and ask your agent to evaluate them. Only you answer questions and submit your work.
              </div>
            </div>
          </div>

          {/* Try Asking Section */}
          <div className="space-y-3 pt-3 border-t border-neutral-100">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Try asking
            </div>

            <div className="space-y-2.5">
              {PROMPT_SUGGESTIONS.map((promptText) => (
                  <div
                    key={promptText}
                    className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 text-xs text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                  >
                    <p className="flex-1 leading-relaxed text-neutral-800 font-normal select-text">
                      {promptText}
                    </p>
                    <CopyButton
                      text={promptText}
                      ariaLabel={`Copy prompt: ${promptText}`}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors shadow-2xs cursor-pointer"
                    />
                  </div>
              ))}
            </div>
          </div>
        </div>
    </dialog>
  );
}
