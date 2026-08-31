import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, SkipForward, X } from "lucide-react";
import { formatTime } from "@/domain/exam";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import type { StoredListeningAudioChunk } from "@/infrastructure/database/listeningAudioRepository";
import type {
  ListeningAudioPersistedState,
  ListeningAudioUiStatus,
} from "./ListeningAudioBar";

type Props = {
  audioSession: ListeningAudioSession;
  currentPart: number;
  isReviewMode: boolean;
  placement?: "inline" | "header-popout";
  audioPromptsEnabled?: boolean;
  hydrateState?: ListeningAudioPersistedState | null;
  onPersistState: (next: ListeningAudioPersistedState) => void;
  onUiStatus?: (status: ListeningAudioUiStatus) => void;
  isMuted?: boolean;
};

function playbackErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Unable to play the generated listening audio.";
}

function chunkOffsetsMs(
  chunks: StoredListeningAudioChunk[],
): number[] {
  const offsets: number[] = [];
  let nextOffset = 0;
  for (const chunk of chunks) {
    offsets.push(nextOffset);
    nextOffset += chunk.durationMs;
  }
  return offsets;
}

export const KokoroListeningAudioBar: React.FC<Props> = ({
  audioSession,
  currentPart,
  isReviewMode,
  placement = "inline",
  audioPromptsEnabled = true,
  hydrateState,
  onPersistState,
  onUiStatus,
  isMuted = false,
}) => {
  const chunks = audioSession.chunks;
  const offsetsMs = useMemo(() => chunkOffsetsMs(chunks), [chunks]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldContinueRef = useRef(!isReviewMode);
  const hydratedRef = useRef(false);
  const pendingSpeechSeekRef = useRef(0);
  const silenceElapsedRef = useRef(0);
  const silenceStartedAtRef = useRef<number | null>(null);
  const onPersistStateRef = useRef(onPersistState);

  const [chunkIndex, setChunkIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const volume = hydrateState?.volume ?? 0.85;
  const [isPlaying, setIsPlaying] = useState(false);
  const [silenceRemainingMs, setSilenceRemainingMs] = useState(0);
  const [needsUserStart, setNeedsUserStart] = useState(false);
  const [isWaitingForChunk, setIsWaitingForChunk] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [dismissedJumpPart, setDismissedJumpPart] = useState<number | null>(null);
  const [dismissedSilenceSequence, setDismissedSilenceSequence] = useState<number | null>(null);

  const currentChunk = chunks[chunkIndex] ?? null;
  const currentOffsetMs = offsetsMs[chunkIndex] ?? 0;
  const nextChunk = chunks[chunkIndex + 1] ?? null;

  useEffect(() => {
    onPersistStateRef.current = onPersistState;
  }, [onPersistState]);

  useEffect(() => {
    if (hydratedRef.current || chunks.length === 0) return;
    const targetMs = Math.max(0, (hydrateState?.currentTimeSec ?? 0) * 1000);
    const generatedDurationMs = chunks.reduce(
      (total, chunk) => total + chunk.durationMs,
      0,
    );
    if (targetMs > generatedDurationMs && audioSession.phase !== "ready") {
      shouldContinueRef.current = false;
      return;
    }

    let targetIndex = chunks.findIndex((chunk, index) => {
      const start = offsetsMs[index] ?? 0;
      return targetMs >= start && targetMs < start + chunk.durationMs;
    });
    if (targetIndex === -1) targetIndex = Math.max(0, chunks.length - 1);
    const localMs = Math.max(0, targetMs - (offsetsMs[targetIndex] ?? 0));
    pendingSpeechSeekRef.current = localMs / 1000;
    silenceElapsedRef.current = localMs;
    setChunkIndex(targetIndex);
    shouldContinueRef.current = !isReviewMode;
    hydratedRef.current = true;
  }, [audioSession.phase, chunks, hydrateState?.currentTimeSec, isReviewMode, offsetsMs]);

  useEffect(() => {
    if (!currentChunk || currentChunk.kind !== "speech" || !currentChunk.audio) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([currentChunk.audio], { type: currentChunk.mimeType ?? "audio/wav" }),
    );
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [currentChunk]);

  const advance = useCallback((): void => {
    setIsPlaying(false);
    silenceStartedAtRef.current = null;
    silenceElapsedRef.current = 0;
    pendingSpeechSeekRef.current = 0;

    if (nextChunk) {
      setChunkIndex((current) => current + 1);
      setIsWaitingForChunk(false);
      return;
    }

    if (audioSession.phase === "ready") {
      shouldContinueRef.current = false;
      setIsWaitingForChunk(false);
      return;
    }

    setIsWaitingForChunk(true);
  }, [audioSession.phase, nextChunk]);

  useEffect(() => {
    if (!isWaitingForChunk || !chunks[chunkIndex + 1]) return;
    setChunkIndex((current) => current + 1);
    setIsWaitingForChunk(false);
  }, [chunkIndex, chunks, isWaitingForChunk]);

  const playCurrent = useCallback(async (): Promise<void> => {
    if (isReviewMode || !currentChunk) return;
    shouldContinueRef.current = true;
    setAudioError(null);

    if (currentChunk.kind === "silence") {
      silenceStartedAtRef.current = performance.now();
      setIsPlaying(true);
      setNeedsUserStart(false);
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setNeedsUserStart(false);
    } catch (error) {
      shouldContinueRef.current = false;
      setNeedsUserStart(true);
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
        setAudioError(playbackErrorMessage(error));
      }
    }
  }, [currentChunk, isReviewMode]);

  useEffect(() => {
    if (!currentChunk || currentChunk.kind !== "silence" || !shouldContinueRef.current) {
      return;
    }
    silenceStartedAtRef.current = performance.now();
    setSilenceRemainingMs(
      Math.max(0, currentChunk.durationMs - silenceElapsedRef.current),
    );
    setIsPlaying(true);
  }, [currentChunk]);

  useEffect(() => {
    if (!isPlaying || !currentChunk || currentChunk.kind !== "silence") return;
    const interval = window.setInterval(() => {
      const startedAt = silenceStartedAtRef.current ?? performance.now();
      const elapsed = Math.min(
        currentChunk.durationMs,
        silenceElapsedRef.current + performance.now() - startedAt,
      );
      const remaining = Math.max(0, currentChunk.durationMs - elapsed);
      setSilenceRemainingMs(remaining);
      const globalSec = (currentOffsetMs + elapsed) / 1000;
      onPersistStateRef.current({ currentTimeSec: globalSec, volume });
      if (remaining <= 0) {
        window.clearInterval(interval);
        advance();
      }
    }, 100);
    return () => {
      window.clearInterval(interval);
      const startedAt = silenceStartedAtRef.current;
      if (startedAt != null) {
        silenceElapsedRef.current = Math.min(
          currentChunk.durationMs,
          silenceElapsedRef.current + performance.now() - startedAt,
        );
      }
      silenceStartedAtRef.current = null;
    };
  }, [advance, currentChunk, currentOffsetMs, isPlaying, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [audioUrl, isMuted, volume]);

  useEffect(() => {
    if (!isReviewMode) return;
    shouldContinueRef.current = false;
    setIsPlaying(false);
    audioRef.current?.pause();
  }, [isReviewMode]);

  const handleCanPlay = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (pendingSpeechSeekRef.current > 0) {
      audio.currentTime = Math.min(
        pendingSpeechSeekRef.current,
        Number.isFinite(audio.duration) ? audio.duration : pendingSpeechSeekRef.current,
      );
      pendingSpeechSeekRef.current = 0;
    }
    if (shouldContinueRef.current) void playCurrent();
  }, [playCurrent]);

  const handleTimeUpdate = useCallback((): void => {
    const localSec = audioRef.current?.currentTime ?? 0;
    const globalSec = currentOffsetMs / 1000 + localSec;
    onPersistStateRef.current({ currentTimeSec: globalSec, volume });
  }, [currentOffsetMs, volume]);

  const seekToPart = useCallback((partId: number): void => {
    const targetIndex = chunks.findIndex((chunk) => chunk.partId === partId);
    if (targetIndex < 0) return;
    audioRef.current?.pause();
    setIsPlaying(false);
    silenceElapsedRef.current = 0;
    pendingSpeechSeekRef.current = 0;
    setChunkIndex(targetIndex);
    setDismissedJumpPart(partId);
    shouldContinueRef.current = true;
  }, [chunks]);

  const skipSilence = useCallback((): void => {
    if (!currentChunk || currentChunk.kind !== "silence") return;
    setDismissedSilenceSequence(currentChunk.sequence);
    advance();
  }, [advance, currentChunk]);

  const sourceError = audioError ?? audioSession.error;
  const isLoading = !currentChunk || isWaitingForChunk;
  const status = useMemo<ListeningAudioUiStatus>(() => ({
    state: sourceError
      ? "error"
      : isLoading
        ? "loading"
        : isPlaying
          ? "playing"
          : "paused",
    audioPart: currentChunk?.partId ?? null,
    isInSilence: currentChunk?.kind === "silence",
    silenceEndSec:
      currentChunk?.kind === "silence"
        ? (currentOffsetMs + currentChunk.durationMs) / 1000
        : null,
  }), [
    currentChunk,
    currentOffsetMs,
    isLoading,
    isPlaying,
    sourceError,
  ]);

  useEffect(() => {
    onUiStatus?.(status);
  }, [onUiStatus, status]);

  const hasCurrentPart = chunks.some((chunk) => chunk.partId === currentPart);
  const showJump = Boolean(
    !isReviewMode &&
    audioPromptsEnabled &&
    hasCurrentPart &&
    currentChunk &&
    currentChunk.partId !== currentPart &&
    dismissedJumpPart !== currentPart,
  );
  const showSkip = Boolean(
    !isReviewMode &&
    audioPromptsEnabled &&
    currentChunk?.kind === "silence" &&
    silenceRemainingMs > 250 &&
    dismissedSilenceSequence !== currentChunk.sequence,
  );
  const showActions = Boolean(
    needsUserStart || showJump || showSkip || isLoading || sourceError,
  );

  const actions = showActions ? (
    <>
      {needsUserStart && !isReviewMode ? (
        <button
          type="button"
          onClick={() => void playCurrent()}
          className="exam-control-button inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold sm:w-auto"
        >
          <Play size={14} aria-hidden="true" />
          Play audio
        </button>
      ) : null}
      {showSkip ? (
        <div className="flex w-full items-stretch gap-1.5 sm:w-auto">
          <button
            type="button"
            onClick={skipSilence}
            className="exam-control-button inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold sm:flex-none"
          >
            <SkipForward size={14} aria-hidden="true" />
            Skip silence ({formatTime(silenceRemainingMs / 1000)})
          </button>
          <button
            type="button"
            onClick={() => setDismissedSilenceSequence(currentChunk?.sequence ?? null)}
            aria-label="Dismiss skip silence"
            className="exam-icon-button inline-flex min-h-9 w-9 items-center justify-center rounded border"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {showJump ? (
        <div className="flex w-full items-stretch gap-1.5 sm:w-auto">
          <button
            type="button"
            onClick={() => seekToPart(currentPart)}
            className="exam-control-button inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold sm:flex-none"
          >
            <SkipForward size={14} aria-hidden="true" />
            Jump audio to Part {currentPart}
          </button>
          <button
            type="button"
            onClick={() => setDismissedJumpPart(currentPart)}
            aria-label={`Dismiss jump audio to Part ${currentPart}`}
            className="exam-icon-button inline-flex min-h-9 w-9 items-center justify-center rounded border"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {isLoading && !sourceError ? (
        <span className="exam-subtle-text text-[10px] font-bold">
          {audioSession.phase === "loading"
            ? "Loading Kokoro…"
            : "Preparing the next audio chunk…"}
        </span>
      ) : null}
      {sourceError ? (
        <div className="flex items-center gap-2 text-[10px] font-bold text-red-600">
          <span>{sourceError}</span>
          {audioSession.error ? (
            <button
              type="button"
              onClick={audioSession.retry}
              className="exam-control-button rounded border px-2 py-1 text-[10px]"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <>
      {currentChunk?.kind === "speech" ? (
        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          preload="auto"
          onCanPlay={handleCanPlay}
          onPlay={() => {
            setIsPlaying(true);
            setNeedsUserStart(false);
          }}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={advance}
          onError={() => setAudioError("A generated audio chunk could not be played.")}
        />
      ) : null}
      {placement === "header-popout" ? (
        showActions ? (
          <div className="pointer-events-none fixed left-0 right-0 top-[60px] z-40">
            <div className="mx-auto flex max-w-[1400px] justify-center px-2 sm:justify-end sm:px-4">
              <div className="exam-audio-popout pointer-events-auto flex w-full max-w-[calc(100vw-1rem)] flex-wrap items-center gap-2 rounded-b-lg border border-t-0 px-2 py-2 shadow-lg backdrop-blur-sm sm:w-auto sm:px-3">
                {actions}
              </div>
            </div>
          </div>
        ) : null
      ) : showActions ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </>
  );
};
