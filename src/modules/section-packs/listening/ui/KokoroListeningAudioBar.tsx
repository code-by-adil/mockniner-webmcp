import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, SkipForward, X } from "lucide-react";
import { formatTime } from "@/shared/time";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import type { StoredListeningAudioChunk } from "@/infrastructure/database/listeningAudioRepository";
import type {
  ListeningAudioPersistedState,
  ListeningAudioUiStatus,
} from "./listeningAudioTypes";
import {
  chunkOffsetsMs,
  findPartChunkIndex,
  getInitialChunkPosition,
  getNextChunkIndex,
} from "./kokoroPlaybackTimeline";

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

function GeneratedSpeechAudio({
  chunk,
  audioRef,
  onCanPlay,
  onPlay,
  onPause,
  onTimeUpdate,
  onEnded,
  onError,
}: {
  chunk: StoredListeningAudioChunk;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onCanPlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  onTimeUpdate: () => void;
  onEnded: () => void;
  onError: () => void;
}) {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !chunk.audio) return;
    const urlApi = globalThis.URL;
    if (
      typeof globalThis.Blob !== "function" ||
      typeof urlApi?.createObjectURL !== "function"
    ) {
      queueMicrotask(() => audio.dispatchEvent(new Event("error")));
      return;
    }
    const revokeObjectUrl = typeof urlApi.revokeObjectURL === "function"
      ? urlApi.revokeObjectURL.bind(urlApi)
      : null;
    const nextUrl = urlApi.createObjectURL(
      new globalThis.Blob([chunk.audio], { type: chunk.mimeType ?? "audio/wav" }),
    );
    audio.src = nextUrl;
    audio.load();
    return () => {
      audio.removeAttribute("src");
      audio.load();
      revokeObjectUrl?.(nextUrl);
    };
  }, [audioRef, chunk.audio, chunk.mimeType]);

  return (
    <audio
      ref={audioRef}
      preload="auto"
      onCanPlay={onCanPlay}
      onPlay={onPlay}
      onPause={onPause}
      onTimeUpdate={onTimeUpdate}
      onEnded={onEnded}
      onError={onError}
    />
  );
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
  const [initialPosition] = useState(() => getInitialChunkPosition(
    chunks,
    offsetsMs,
    hydrateState?.currentTimeSec ?? 0,
  ));
  const initialChunk = chunks[initialPosition.index] ?? null;
  const startsInSilence = initialChunk?.kind === "silence" && !isReviewMode;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldContinueRef = useRef(!isReviewMode);
  const pendingSpeechSeekRef = useRef(initialPosition.localMs / 1000);
  const silenceElapsedRef = useRef(initialPosition.localMs);
  const silenceStartedAtRef = useRef<number | null>(null);
  const onPersistStateRef = useRef(onPersistState);

  const [chunkIndex, setChunkIndex] = useState(initialPosition.index);
  const volume = hydrateState?.volume ?? 0.85;
  const [isPlaying, setIsPlaying] = useState(startsInSilence);
  const [silenceRemainingMs, setSilenceRemainingMs] = useState(() =>
    startsInSilence && initialChunk
      ? Math.max(0, initialChunk.durationMs - initialPosition.localMs)
      : 0,
  );
  const [needsUserStart, setNeedsUserStart] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [dismissedJumpPart, setDismissedJumpPart] = useState<number | null>(null);
  const [dismissedSilenceSequence, setDismissedSilenceSequence] = useState<number | null>(null);

  const currentChunk = chunks[chunkIndex] ?? null;
  const currentOffsetMs = offsetsMs[chunkIndex] ?? 0;
  const nextChunk = chunks[chunkIndex + 1] ?? null;

  useEffect(() => {
    onPersistStateRef.current = onPersistState;
  }, [onPersistState]);

  const advance = useCallback((): void => {
    setIsPlaying(false);
    setDismissedSilenceSequence(null);
    silenceStartedAtRef.current = null;
    silenceElapsedRef.current = 0;
    pendingSpeechSeekRef.current = 0;

    const nextIndex = getNextChunkIndex(
      chunkIndex,
      chunks.length,
      audioSession.phase,
      audioSession.totalChunks,
    );
    if (nextIndex == null) {
      shouldContinueRef.current = false;
      return;
    }

    if (nextChunk) {
      if (nextChunk.partId === dismissedJumpPart) {
        setDismissedJumpPart(null);
      }
      onPersistStateRef.current({
        currentTimeSec: (offsetsMs[nextIndex] ?? 0) / 1000,
        volume,
      });
      if (nextChunk.kind === "silence" && shouldContinueRef.current) {
        silenceStartedAtRef.current = performance.now();
        setSilenceRemainingMs(nextChunk.durationMs);
        setIsPlaying(true);
      }
    }
    setChunkIndex(nextIndex);
  }, [
    audioSession.phase,
    audioSession.totalChunks,
    chunkIndex,
    chunks.length,
    dismissedJumpPart,
    nextChunk,
    offsetsMs,
    volume,
  ]);

  useEffect(() => {
    if (
      currentChunk?.kind !== "silence" ||
      !shouldContinueRef.current ||
      isReviewMode ||
      isPlaying
    ) return;
    silenceStartedAtRef.current = performance.now();
    setSilenceRemainingMs(currentChunk.durationMs);
    setIsPlaying(true);
  }, [currentChunk, isPlaying, isReviewMode]);

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

  const effectiveIsPlaying = !isReviewMode && isPlaying;
  useEffect(() => {
    if (!effectiveIsPlaying || !currentChunk || currentChunk.kind !== "silence") return;
    if (silenceStartedAtRef.current == null) {
      silenceStartedAtRef.current = performance.now();
    }
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
  }, [advance, currentChunk, currentOffsetMs, effectiveIsPlaying, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [currentChunk, isMuted, volume]);

  useEffect(() => {
    if (!isReviewMode) return;
    shouldContinueRef.current = false;
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
    const targetIndex = findPartChunkIndex(chunks, partId);
    if (targetIndex < 0) return;
    audioRef.current?.pause();
    setIsPlaying(false);
    silenceElapsedRef.current = 0;
    pendingSpeechSeekRef.current = 0;
    setChunkIndex(targetIndex);
    setDismissedJumpPart(null);
    shouldContinueRef.current = true;
    onPersistStateRef.current({
      currentTimeSec: (offsetsMs[targetIndex] ?? 0) / 1000,
      volume,
    });
    const targetChunk = chunks[targetIndex];
    if (targetChunk?.kind === "silence") {
      silenceStartedAtRef.current = performance.now();
      setSilenceRemainingMs(targetChunk.durationMs);
      setIsPlaying(true);
    }
  }, [chunks, offsetsMs, volume]);

  const skipSilence = useCallback((): void => {
    if (!currentChunk || currentChunk.kind !== "silence") return;
    advance();
  }, [advance, currentChunk]);

  const sourceError = audioError ?? audioSession.error;
  const isLoading = !currentChunk;
  const status = useMemo<ListeningAudioUiStatus>(() => ({
    state: sourceError
      ? "error"
      : isLoading
        ? "loading"
        : effectiveIsPlaying
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
    effectiveIsPlaying,
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
            Skip silence ({formatTime(Math.ceil(silenceRemainingMs / 1000))})
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
        <GeneratedSpeechAudio
          key={currentChunk.sequence}
          chunk={currentChunk}
          audioRef={audioRef}
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
