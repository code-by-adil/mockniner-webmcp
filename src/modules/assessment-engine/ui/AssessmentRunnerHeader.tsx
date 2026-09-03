import { useState, type ReactElement } from "react";
import { formatMinutesAndSeconds } from "@/shared/time";
import { Calculator, ChevronDown, Clock, Eye, EyeOff, FileText, LogOut } from "lucide-react";
import type { AssessmentPart, AssessmentResource } from "@/domain/assessment";
import { BrandMark } from "@/shared/ui/global/BrandMark";
import { AssessmentCalculatorDialog } from "./AssessmentCalculatorDialog";
import { AssessmentReferenceDialog } from "./AssessmentReferenceDialog";
import { StorageButton } from '@/app/WorkspaceStorage';

export function AssessmentRunnerHeader({
  assessmentTitle,
  part,
  resources,
  secondsRemaining,
  timerHidden,
  warning,
  calculatorEnabled,
  onSetTimerHidden,
  onExit,
}: {
  assessmentTitle: string;
  part: AssessmentPart;
  resources: AssessmentResource[];
  secondsRemaining: number | null;
  timerHidden: boolean;
  warning: boolean;
  calculatorEnabled: boolean;
  onSetTimerHidden: (hidden: boolean) => void;
  onExit: () => void;
}): ReactElement {
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const reference = resources.find((resource) => resource.id === referenceId) ?? null;
  const timerText = secondsRemaining === null
    ? "Untimed"
    : formatMinutesAndSeconds(Math.max(0, secondsRemaining));

  return (
    <>
      <header className="relative z-30 shrink-0 border-b border-neutral-200 bg-white shadow-xs">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark compact />
            <div className="hidden min-w-0 border-l border-neutral-200 pl-4 md:block">
              <p className="truncate text-xs font-bold">{part.groupTitle ?? assessmentTitle}</p>
              <p className="truncate text-[11px] text-neutral-500">{part.title}</p>
            </div>
            {part.description ? (
              <button
                type="button"
                aria-label="Directions"
                aria-expanded={directionsOpen}
                onClick={() => setDirectionsOpen((value) => !value)}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-semibold text-neutral-700"
              >
                <span className="hidden sm:inline">Directions</span>
                <ChevronDown size={13} className={directionsOpen ? "rotate-180" : ""} />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums sm:text-sm ${
                warning
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-neutral-200 bg-neutral-50 text-neutral-800"
              }`}
            >
              <Clock size={14} />
              <span>{timerHidden ? "••:••" : timerText}</span>
            </div>
            {secondsRemaining !== null ? (
              <button
                type="button"
                onClick={() => onSetTimerHidden(!timerHidden)}
                aria-label={timerHidden ? "Show timer" : "Hide timer"}
                className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-50"
              >
                {timerHidden ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <StorageButton />
            {resources.map((resource) => (
              <button
                key={resource.id}
                type="button"
                onClick={() => setReferenceId(resource.id)}
                aria-label={`Open ${resource.title}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-xs font-semibold text-neutral-700 sm:px-3"
              >
                <FileText size={15} />
                <span className="hidden lg:inline">{resource.title}</span>
              </button>
            ))}
            {calculatorEnabled ? (
              <button
                type="button"
                onClick={() => setCalculatorOpen(true)}
                aria-label="Open calculator"
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-xs font-semibold text-neutral-700 sm:px-3"
              >
                <Calculator size={15} />
                <span className="hidden lg:inline">Calculator</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onExit}
              aria-label="Exit assessment"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white p-2 text-xs font-semibold text-neutral-700 sm:px-3"
            >
              <LogOut size={15} />
              <span className="hidden lg:inline">Exit</span>
            </button>
          </div>
        </div>

        {directionsOpen && part.description ? (
          <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700">
            <p className="mx-auto max-w-[1440px]">
              <strong>
                {part.groupTitle ? `${part.groupTitle} · ` : ""}{part.title}:
              </strong>{" "}
              {part.description}
            </p>
          </div>
        ) : null}
      </header>

      <AssessmentReferenceDialog
        resource={reference}
        open={reference !== null}
        onOpenChange={(open) => {
          if (!open) setReferenceId(null);
        }}
      />
      <AssessmentCalculatorDialog open={calculatorOpen} onOpenChange={setCalculatorOpen} />
    </>
  );
}
