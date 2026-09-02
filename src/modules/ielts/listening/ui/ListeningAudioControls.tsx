import type { ReactNode } from "react";
import { Play, SkipForward, X } from "lucide-react";

export function ListeningPlayButton({
  onPlay,
  className = "",
}: {
  onPlay: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`exam-control-button inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold sm:w-auto ${className}`}
    >
      <Play size={14} aria-hidden="true" />
      Play audio
    </button>
  );
}

export function ListeningSkipPrompt({
  children,
  onSkip,
  onDismiss,
  dismissLabel,
  actionClassName = "",
  dismissClassName = "",
}: {
  children: ReactNode;
  onSkip: () => void;
  onDismiss: () => void;
  dismissLabel: string;
  actionClassName?: string;
  dismissClassName?: string;
}) {
  return (
    <div className="flex w-full items-stretch gap-1.5 sm:w-auto">
      <button
        type="button"
        onClick={onSkip}
        className={`exam-control-button inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold sm:flex-none ${actionClassName}`}
      >
        <SkipForward size={14} aria-hidden="true" />
        {children}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className={`exam-icon-button inline-flex min-h-9 w-9 items-center justify-center rounded border ${dismissClassName}`}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ListeningAudioActions({
  placement,
  children,
  popoutClassName = "",
}: {
  placement: "inline" | "header-popout";
  children: ReactNode;
  popoutClassName?: string;
}) {
  if (placement === "inline") {
    return <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>;
  }

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-[60px] z-40">
      <div className="mx-auto flex max-w-[1400px] justify-center px-2 sm:justify-end sm:px-4">
        <div className={`exam-audio-popout pointer-events-auto flex w-full max-w-[calc(100vw-1rem)] flex-wrap items-center gap-2 rounded-b-lg border border-t-0 px-2 py-2 shadow-lg backdrop-blur-sm sm:w-auto sm:px-3 ${popoutClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
