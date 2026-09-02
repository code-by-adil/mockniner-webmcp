import React, { useState } from "react";
import { Check, Copy, X } from "lucide-react";

const PROMPT_SUGGESTIONS = [
  "Create and install an original SAT-style diagnostic focused on algebra and inference.",
  "Build a six-question universal assessment with multiple choice, numeric entry, and one rubric-evaluated response.",
  "Create and install an original 40-question IELTS Academic Reading set about renewable energy.",
  "Grade my latest submitted IELTS Writing attempt against official band descriptors.",
];

export function WebMcpHelpDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement | null {
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);

  const handleCopyPrompt = (promptText: string, index: number) => {
    void navigator.clipboard.writeText(promptText);
    setCopiedPromptIndex(index);
    setTimeout(() => setCopiedPromptIndex(null), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 backdrop-blur-xs p-4 sm:p-6">
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Dialog Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-neutral-100">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 leading-tight">
              WebMCP Integration
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Page-native capabilities for installing assessments, reading submissions, and returning structured evaluation.
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
              How your agent works with this site
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Through WebMCP, your agent works with the same local assessment state as this interface. It can install universal or native IELTS content, read immutable submissions, and return validated rubric feedback without an application-owned model or credential.
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-neutral-100/70 border border-neutral-200/60 p-3.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <div className="font-semibold text-neutral-900">
                Capabilities follow the current workspace
              </div>
              <div className="text-neutral-500 text-[11px]">
                Authoring tools appear in the library. Submission and evaluation tools appear only on the relevant result screen.
              </div>
            </div>
          </div>

          {/* Try Asking Section */}
          <div className="space-y-3 pt-3 border-t border-neutral-100">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Sample agent prompts
            </div>

            <div className="space-y-2.5">
              {PROMPT_SUGGESTIONS.map((promptText, idx) => {
                const isCopied = copiedPromptIndex === idx;
                return (
                  <div
                    key={promptText}
                    className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 text-xs text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                  >
                    <p className="flex-1 leading-relaxed text-neutral-800 font-normal select-text">
                      “{promptText}”
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(promptText, idx)}
                      aria-label={`Copy prompt: ${promptText}`}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors shadow-2xs cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check size={12} className="text-emerald-600" />
                          <span className="text-emerald-700 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} className="text-neutral-400" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
