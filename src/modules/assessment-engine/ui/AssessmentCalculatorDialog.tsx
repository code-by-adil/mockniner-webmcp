import { useState, type ReactElement } from "react";
import { Delete, X } from "lucide-react";
import { handleExamDialogBackdropClick, useExamNativeDialog } from "@/shared/ui/exam/useExamNativeDialog";

type Operator = "+" | "−" | "×" | "÷";
const buttons = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "=", "+"];

function isOperator(value: string): value is Operator {
  return value === "+" || value === "−" || value === "×" || value === "÷";
}

function calculate(left: number, right: number, operator: Operator): number {
  if (operator === "+") return left + right;
  if (operator === "−") return left - right;
  if (operator === "×") return left * right;
  return right === 0 ? Number.NaN : left / right;
}

export function AssessmentCalculatorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const dialogRef = useExamNativeDialog({ open, onOpenChange });
  const [display, setDisplay] = useState("0");
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [replaceDisplay, setReplaceDisplay] = useState(true);

  const enterDigit = (digit: string) => {
    setDisplay((current) => replaceDisplay ? digit : current === "0" ? digit : `${current}${digit}`);
    setReplaceDisplay(false);
  };
  const enterDecimal = () => {
    setDisplay((current) => replaceDisplay ? "0." : current.includes(".") ? current : `${current}.`);
    setReplaceDisplay(false);
  };
  const chooseOperator = (next: Operator) => {
    const value = Number(display);
    setAccumulator(Number.isFinite(value) ? value : 0);
    setOperator(next);
    setReplaceDisplay(true);
  };
  const resolve = () => {
    if (accumulator === null || operator === null) return;
    const result = calculate(accumulator, Number(display), operator);
    setDisplay(Number.isFinite(result) ? String(Number(result.toPrecision(12))) : "Error");
    setAccumulator(null);
    setOperator(null);
    setReplaceDisplay(true);
  };
  const clear = () => {
    setDisplay("0");
    setAccumulator(null);
    setOperator(null);
    setReplaceDisplay(true);
  };
  const pressButton = (button: string) => {
    if (button === ".") enterDecimal();
    else if (button === "=") resolve();
    else if (isOperator(button)) chooseOperator(button);
    else enterDigit(button);
  };

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
            {accumulator ?? ""} {operator ?? ""}
          </span>
          {display}
        </output>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={clear}
            className="rounded-lg bg-neutral-200 py-2 text-sm font-bold hover:bg-neutral-300"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setDisplay((value) => value.length > 1 ? value.slice(0, -1) : "0")}
            aria-label="Delete last digit"
            className="flex items-center justify-center rounded-lg bg-neutral-200 py-2 hover:bg-neutral-300"
          >
            <Delete size={17} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {buttons.map((button) => {
            const operatorButton = isOperator(button);
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
