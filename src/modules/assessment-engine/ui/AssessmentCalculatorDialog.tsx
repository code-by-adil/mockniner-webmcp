import { useReducer, type ReactElement } from "react";
import { Delete, X } from "lucide-react";
import { handleExamDialogBackdropClick, useExamNativeDialog } from "@/shared/ui/exam/useExamNativeDialog";

import { calculatorReducer, initialCalculatorState } from "./assessmentCalculator";
const buttons = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "=", "+"];

export function AssessmentCalculatorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const dialogRef = useExamNativeDialog({ open, onOpenChange });
  const [{ display, pending }, pressButton] = useReducer(calculatorReducer, initialCalculatorState);

  return (
    <dialog
      ref={dialogRef}
      onClick={handleExamDialogBackdropClick}
      aria-labelledby="assessment-calculator-title"
      className="m-auto w-[min(92vw,22rem)] rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-950 shadow-2xl backdrop:bg-black/55"
    >
      <div className="p-4">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="assessment-calculator-title" className="font-bold">Calculator</h2>
            <p className="text-xs text-neutral-500">Basic arithmetic</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close calculator"
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </header>
        <output
          aria-live="polite"
          className="mb-3 block min-h-16 overflow-x-auto rounded-xl bg-neutral-950 px-4 py-3 text-right font-mono text-2xl text-white"
        >
          <span className="block text-xs text-neutral-400">
            {pending?.left ?? ""} {pending?.operator ?? ""}
          </span>
          {display}
        </output>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => pressButton("Clear")}
            className="rounded-lg bg-neutral-200 py-2 text-sm font-bold hover:bg-neutral-300"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => pressButton("Delete")}
            aria-label="Delete last digit"
            className="flex items-center justify-center rounded-lg bg-neutral-200 py-2 hover:bg-neutral-300"
          >
            <Delete size={17} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {buttons.map((button) => {
            const operatorButton = button === "+" || button === "−" || button === "×" || button === "÷";
            return (
              <button
                key={button}
                type="button"
                onClick={() => pressButton(button)}
                className={`h-12 rounded-lg text-base font-bold ${
                  button === "="
                    ? "bg-[var(--exam-accent)] text-white"
                    : operatorButton
                      ? "bg-neutral-800 text-white hover:bg-neutral-700"
                      : "bg-neutral-100 hover:bg-neutral-200"
                }`}
              >
                {button}
              </button>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
