import React from "react";
import { Menu } from "lucide-react";
import {
  ExamPopover,
  ExamPopoverContent,
  ExamPopoverTrigger,
} from "./ExamPopover";

type ExamSettingsMenuProps = {
  examStatusLabel: string;
  audioPromptsEnabled: boolean;
  onAudioPromptsEnabledChange: (enabled: boolean) => void;
};

export function ExamSettingsMenu({
  examStatusLabel,
  audioPromptsEnabled,
  onAudioPromptsEnabledChange,
}: ExamSettingsMenuProps): React.ReactElement {
  return (
    <ExamPopover>
      <ExamPopoverTrigger
        aria-label="Exam settings"
        className="exam-icon-button flex rounded-md p-2"
      >
        <Menu size={20} aria-hidden="true" />
      </ExamPopoverTrigger>
      <ExamPopoverContent className="w-[min(18rem,calc(100vw-1rem))] border-0 bg-transparent p-0 shadow-none">
        <div className="ui-layer-exam exam-floating-surface">
          <div className="exam-menu-panel rounded border p-2 shadow-lg">
            <div className="exam-subtle-text px-2 pb-2 text-[10px] font-bold uppercase tracking-wider">
              {examStatusLabel}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={audioPromptsEnabled}
              onClick={() => onAudioPromptsEnabledChange(!audioPromptsEnabled)}
              className="exam-menu-item flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
            >
              <span className="flex min-w-0 flex-col">
                <span className="exam-strong-text text-xs font-bold">
                  Audio prompts
                </span>
                <span className="exam-subtle-text text-[11px] font-medium">
                  Jump and silence prompts
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`exam-switch-track relative h-5 w-9 shrink-0 rounded-full border transition-colors ${audioPromptsEnabled ? "is-active" : ""}`}
              >
                <span
                  className={`exam-switch-knob absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full shadow-sm transition-transform ${audioPromptsEnabled ? "translate-x-[18px]" : "translate-x-0.5"}`}
                />
              </span>
            </button>
          </div>
        </div>
      </ExamPopoverContent>
    </ExamPopover>
  );
}
