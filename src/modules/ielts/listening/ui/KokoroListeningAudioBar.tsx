import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListeningAudioActions, ListeningPlayButton, ListeningSkipPrompt } from "./ListeningAudioControls";
import { formatTime } from "@/shared/time";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import type { StoredListeningAudioChunk } from "@/infrastructure/database/listeningAudioRepository";
import type {
  ListeningAudioBarProps,
  ListeningAudioUiStatus,
} from "./listeningAudioTypes";
import {
  chunkOffsetsMs,
  findPartChunkIndex,
  getInitialChunkPosition,
  getNextChunkIndex,
} from "./kokoroPlaybackTimeline";

type Props = ListeningAudioBarProps & {
  audioSession: ListeningAudioSession;
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
  const startsInSilence = initialChunk?.kind === "silence" && !isReviewMode && audioSession.readyToPlay;

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
      !audioSession.readyToPlay ||
      currentChunk?.kind !== "silence" ||
      !shouldContinueRef.current ||
      isReviewMode ||
      isPlaying
    ) return;
    silenceStartedAtRef.current = performance.now();
    setSilenceRemainingMs(currentChunk.durationMs);
    setIsPlaying(true);
  }, [audioSession.readyToPlay, currentChunk, isPlaying, isReviewMode]);

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
  const isLoading = !currentChunk || (!audioSession.readyToPlay && !effectiveIsPlaying);
  const status = useMemo<ListeningAudioUiStatus>(() => ({
    needsUserStart,
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
    needsUserStart,
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
        <ListeningPlayButton onPlay={() => void playCurrent()} />
      ) : null}
      {showSkip ? (
        <ListeningSkipPrompt
          onSkip={skipSilence}
          onDismiss={() => setDismissedSilenceSequence(currentChunk?.sequence ?? null)}
          dismissLabel="Dismiss skip silence"
        >
          Skip silence ({formatTime(Math.ceil(silenceRemainingMs / 1000))})
        </ListeningSkipPrompt>
      ) : null}
      {showJump ? (
        <ListeningSkipPrompt
          onSkip={() => seekToPart(currentPart)}
          onDismiss={() => setDismissedJumpPart(currentPart)}
          dismissLabel={`Dismiss jump audio to Part ${currentPart}`}
        >
          Jump audio to Part {currentPart}
        </ListeningSkipPrompt>
      ) : null}
      {isLoading && !sourceError ? (
        <span className="exam-subtle-text text-[10px] font-bold">
          {audioSession.phase === "loading"
            ? "Preparing the listening voice…"
            : "Preparing the next audio segment…"}
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
          onError={() => setAudioError("This audio segment could not be played.")}
        />
      ) : null}
      {showActions ? (
        <ListeningAudioActions placement={placement}>{actions}</ListeningAudioActions>
      ) : null}
    </>
  );
};
