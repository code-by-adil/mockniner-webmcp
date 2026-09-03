import React from "react";
import {
  ArrowLeftRight,
  BookOpen,
  LogOut,
  Menu,
  PenTool,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AssessmentLabBrand } from "@/shared/ui/global/AssessmentLabBrand";
import { ExamSettingsMenu } from "./ExamSettingsMenu";
import { StorageButton } from '@/app/WorkspaceStorage';

interface Props {
  testType?:
    | "listening"
    | "reading"
    | "writing"
    | "speaking"
    | "home"
    | undefined;
  position?: "viewport" | "contained" | undefined;
  onExit?: (() => void) | undefined;
  isReviewMode?: boolean | undefined;
  timeLeft?: string | undefined;
  isTimerWarning?: boolean | undefined;
  writingTaskNumber?: 1 | 2 | undefined;
  listeningAudioStatus?:
    | "loading"
    | "playing"
    | "paused"
    | "error"
    | "unavailable"
    | undefined;
  listeningAudioPart?: number | null | undefined;
  audioPromptsEnabled?: boolean | undefined;
  onAudioPromptsEnabledChange?: ((enabled: boolean) => void) | undefined;
  isAudioMuted?: boolean | undefined;
  onToggleAudioMute?: (() => void) | undefined;
  secondaryActionLabel?: string | undefined;
  secondaryActionIcon?: React.ReactNode | undefined;
  onSecondaryAction?: (() => void) | undefined;
  secureConnectionActive?: boolean | undefined;
}

function getListeningAudioText(status: Props["listeningAudioStatus"]) {
  // Normalize raw player states into stable top-bar copy for predictable UX.
  switch (status) {
    case "loading":
      return "Loading audio…";
    case "paused":
      return "Audio paused";
    case "error":
    case "unavailable":
      return "Audio unavailable";
    case "playing":
    default:
      return "Audio is playing";
  }
}

export const IeltsExamHeader: React.FC<Props> = ({
  testType = "listening",
  position = "viewport",
  onExit,
  isReviewMode = false,
  timeLeft,
  isTimerWarning = false,
  writingTaskNumber,
  listeningAudioStatus,
  listeningAudioPart,
  audioPromptsEnabled,
  onAudioPromptsEnabledChange,
  isAudioMuted = false,
  onToggleAudioMute,
  secondaryActionLabel,
  secondaryActionIcon,
  onSecondaryAction,
  secureConnectionActive = false,
}) => {
  const canConfigureAudioPrompts =
    testType === "listening" &&
    typeof audioPromptsEnabled === "boolean" &&
    Boolean(onAudioPromptsEnabledChange);
  const canToggleAudioMute =
    testType === "listening" && Boolean(onToggleAudioMute);
  const examStatusLabel =
    testType === "listening"
      ? getListeningAudioText(listeningAudioStatus)
      : testType === "reading"
        ? "Reading Passage 1"
        : testType === "writing"
          ? `Writing Task ${writingTaskNumber ?? 1}`
          : "Exam menu";

  return (
    <header
      className={[
        "exam-topbar shadow-sm h-[60px] border-b",
        position === "contained"
          ? "relative z-10 w-full shrink-0"
          : "fixed top-0 left-0 right-0 z-50",
      ].join(" ")}
    >
      <div className="max-w-[1400px] mx-auto px-2 sm:px-4 h-full flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-6 min-w-0">
          <AssessmentLabBrand />

          {/* Review Mode Badge */}
          {isReviewMode && (
            <div className="exam-review-badge px-2 sm:px-3 py-1 sm:py-1.5 rounded border text-[10px] sm:text-xs font-bold uppercase tracking-wider shadow-sm shrink-0">
              Review
            </div>
          )}

          <div className="exam-topbar-meta hidden sm:flex flex-col text-xs border-l pl-6 h-8 justify-center min-w-0">
            <span className="exam-strong-text font-bold">Test taker ID</span>
            <span className="exam-muted-text flex items-center gap-1 font-medium truncate">
              {testType === "listening" && (
                <>
                  {isAudioMuted ? (
                    <VolumeX size={14} className="shrink-0" />
                  ) : (
                    <Volume2 size={14} className="fill-current shrink-0" />
                  )}
                  {isAudioMuted
                    ? "Audio muted"
                    : getListeningAudioText(listeningAudioStatus)}
                  {typeof listeningAudioPart === "number" &&
                  listeningAudioPart > 0
                    ? ` • Part ${listeningAudioPart}`
                    : null}
                </>
              )}
              {testType === "reading" && (
                <>
                  <BookOpen size={14} />
                  Reading Passage 1
                </>
              )}
              {testType === "writing" && (
                <>
                  <PenTool size={14} />
                  Writing Task {writingTaskNumber ?? 1}
                </>
              )}
            </span>
          </div>
        </div>

        <div className="exam-muted-text flex items-center gap-2 sm:gap-5 shrink-0">
          {canToggleAudioMute ? (
            <button
              type="button"
              aria-label={isAudioMuted ? "Unmute audio" : "Mute audio"}
              aria-pressed={isAudioMuted}
              onClick={onToggleAudioMute}
              className="exam-icon-button flex rounded p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
            >
              {isAudioMuted ? (
                <VolumeX size={20} aria-hidden="true" />
              ) : (
                <Volume2 size={20} aria-hidden="true" />
              )}
            </button>
          ) : null}

          {onSecondaryAction && secondaryActionLabel ? (
            <button
              type="button"
              aria-label={secondaryActionLabel}
              onClick={onSecondaryAction}
              className="exam-control-button flex items-center gap-1 sm:gap-2 text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
            >
              {secondaryActionIcon ?? (
                <ArrowLeftRight size={14} aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{secondaryActionLabel}</span>
            </button>
          ) : null}

          {secureConnectionActive ? (
            <span
              aria-label="Secure Connection"
              role="status"
              className="exam-status-pill hidden items-center gap-1.5 rounded border px-2 py-1 text-xs font-bold sm:flex"
            >
              <ShieldCheck size={14} aria-hidden="true" />
              Secure Connection
            </span>
          ) : (
            <StorageButton />
          )}
          {canConfigureAudioPrompts ? (
            <ExamSettingsMenu
              examStatusLabel={examStatusLabel}
              audioPromptsEnabled={audioPromptsEnabled ?? false}
              onAudioPromptsEnabledChange={(enabled) =>
                onAudioPromptsEnabledChange?.(enabled)
              }
            />
          ) : (
            <span
              aria-label={examStatusLabel}
              role="status"
              className="hidden sm:flex p-2"
            >
              <Menu size={20} aria-hidden="true" />
            </span>
          )}

          {timeLeft && (
            <div
              aria-live="polite"
              className={`exam-status-pill tabular-nums px-2 sm:px-3 py-1 sm:py-1.5 rounded border text-[11px] sm:text-xs font-bold tracking-wider ${isTimerWarning ? "is-danger" : ""}`}
            >
              <span className="hidden sm:inline">Time Left: </span>
              {timeLeft}
            </div>
          )}

          {onExit && (
            <button
              type="button"
              aria-label="Exit Test"
              onClick={onExit}
              className="exam-exit-button flex items-center gap-1 sm:gap-2 text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
            >
              <LogOut size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Exit Test</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
