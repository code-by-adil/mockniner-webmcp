import React, { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import {
  handleExamDialogBackdropClick,
  useExamNativeDialog,
} from "@/shared/ui/exam/useExamNativeDialog";
import { supportsNativeDialog } from "@/shared/ui/exam/cssAnchorPositioning";
export interface FooterBaseProps {
  currentPart: number;
  onPartChange: (part: number) => void;
  position?: "viewport" | "contained" | undefined;
  onSubmit?: (() => void) | undefined;
  isSubmitting?: boolean | undefined;
  submitSummary?: React.ReactNode | undefined;
  submitTitle?: string | undefined;
  submitPrompt?: string | undefined;
}

const EXAM_PRIMARY_BUTTON_CLASS = "exam-primary-button transition-colors";
export const FOOTER_PART_CHIP_CLASS =
  "exam-footer-part-chip flex min-h-10 shrink-0 flex-col items-start justify-center px-2.5 py-1.5 transition-colors sm:min-w-[5.5rem] sm:px-4 sm:py-2";

export const FOOTER_ICON_BUTTON_CLASS =
  "exam-icon-button flex items-center justify-center rounded-md border transition-colors disabled:opacity-50";

export function FooterActions({
  currentPart,
  totalParts,
  onPartChange,
  onSubmit,
  isSubmitting = false,
  submitSummary,
  submitTitle = "Submit your test?",
  submitPrompt = "Review your answers before submitting. You cannot change them after submission.",
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
      if (event.key === "Escape") setIsSubmitConfirmOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
      <h2
        id="submit-confirm-title"
        className="exam-strong-text text-2xl font-bold"
      >
        {submitTitle}
      </h2>
      <p
        id="submit-confirm-description"
        className="exam-muted-text mt-3 text-base leading-6"
      >
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
          Keep working
        </button>
        <button
          type="button"
          onClick={handleConfirmSubmit}
          disabled={isSubmitting}
          className={`${EXAM_PRIMARY_BUTTON_CLASS} h-10 px-4 text-sm font-semibold`}
        >
          {isSubmitting ? "Submitting…" : "Submit test"}
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
        <div
          className={`flex items-center gap-1.5 sm:gap-2 ${hideNavigationOnMobile ? "hidden sm:flex" : ""}`}
        >
          <button
            type="button"
            aria-label="Previous part"
            onClick={() => onPartChange(Math.max(1, currentPart - 1))}
            disabled={currentPart === 1}
            className={`${FOOTER_ICON_BUTTON_CLASS} h-9 w-9 sm:h-10 sm:w-10`}
            title="Previous part"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next part"
            onClick={() => onPartChange(Math.min(totalParts, currentPart + 1))}
            disabled={currentPart === totalParts}
            className={`${FOOTER_ICON_BUTTON_CLASS} h-9 w-9 sm:h-10 sm:w-10`}
            title="Next part"
          >
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        {onSubmit ? (
          <button
            type="button"
            aria-label="Submit test"
            onClick={handleOpenSubmitConfirm}
            disabled={isSubmitting}
            className={`${EXAM_PRIMARY_BUTTON_CLASS} ml-0.5 flex items-center gap-1.5 py-2 text-xs font-bold uppercase sm:ml-1 sm:gap-2 sm:text-sm`}
          >
            <span className="hidden sm:inline">
              {isSubmitting ? "Submitting…" : "Submit test"}
            </span>
            <span className="sm:hidden">{isSubmitting ? "…" : "Submit"}</span>
            <Check size={16} strokeWidth={3} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {onSubmit ? submitConfirmModal : null}
    </>
  );
}
