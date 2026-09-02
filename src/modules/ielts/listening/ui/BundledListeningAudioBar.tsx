import React, { useEffect, useMemo, useRef, useState } from "react";
import { ListeningAudioActions, ListeningPlayButton, ListeningSkipPrompt } from "./ListeningAudioControls";
import { getListeningAudioSources } from "@/infrastructure/media/listeningAudio";
import {
  parseListeningTimeline,
  type NormalizedListeningTimeline,
} from "@/infrastructure/media/listeningTimeline";
import { formatTime } from "@/shared/time";
import type {
  ListeningAudioBarProps,
  ListeningAudioUiStatus,
} from "./listeningAudioTypes";

type ListeningSilenceRange =
  NormalizedListeningTimeline["silenceRanges"][number];

function findLastIndexLeq(starts: number[], t: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midValue = starts[mid];
    if (midValue != null && midValue <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function isUserActivationPlaybackError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return true;
  }

  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message.includes("user didn't interact") ||
    message.includes("user activation") ||
    message.includes("notallowederror")
  );
}

function clampUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

type Props = ListeningAudioBarProps & {
  audioAssetKey: string;
};

export const BundledListeningAudioBar: React.FC<Props> = ({
  audioAssetKey,
  currentPart,
  isReviewMode,
  placement = "inline",
  audioPromptsEnabled = true,
  hydrateState,
  onPersistState,
  onUiStatus,
  isMuted = false,
}) => {
  const sources = useMemo(
    () => getListeningAudioSources(audioAssetKey),
    [audioAssetKey],
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeekRef = useRef<number | null>(
    hydrateState ? clampNonNegative(hydrateState.currentTimeSec) : null,
  );
  const hasAttemptedAutoplayRef = useRef(false);

  const [timeline, setTimeline] = useState<NormalizedListeningTimeline | null>(
    null,
  );
  const timelineRef = useRef<NormalizedListeningTimeline | null>(null);

  const [isTimelineLoading, setIsTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const [currentTimeSec, setCurrentTimeSec] = useState(
    () => hydrateState ? clampNonNegative(hydrateState.currentTimeSec) : 0,
  );
  const [audioPart, setAudioPart] = useState<number | null>(null);
  const [activeSilence, setActiveSilence] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [needsUserStart, setNeedsUserStart] = useState(false);
  const [dismissedJumpPart, setDismissedJumpPart] = useState<number | null>(
    null,
  );
  const [dismissedSilenceKey, setDismissedSilenceKey] = useState<string | null>(
    null,
  );

  const volume = hydrateState ? clampUnitInterval(hydrateState.volume) : 0.85;

  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const isReviewModeRef = useRef(isReviewMode);
  const onPersistStateRef = useRef(onPersistState);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isReviewModeRef.current = isReviewMode;
  }, [isReviewMode]);

  useEffect(() => {
    onPersistStateRef.current = onPersistState;
  }, [onPersistState]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(sources.timelineUrl, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((json) => {
        const normalized = parseListeningTimeline(json);
        if (!normalized) throw new Error("Invalid timeline format");
        setTimeline(normalized);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setTimeline(null);
        setTimelineError(getErrorMessage(error, "Failed to load timeline"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsTimelineLoading(false);
      });
    return () => controller.abort();
  }, [sources.timelineUrl]);

  useEffect(() => {
    const status: ListeningAudioUiStatus = {
      state: audioError
        ? "error"
        : isLoadingAudio
          ? "loading"
          : isPlaying
            ? "playing"
            : "paused",
      audioPart,
      isInSilence: Boolean(activeSilence),
      silenceEndSec: activeSilence?.end ?? null,
    };
    onUiStatus?.(status);
  }, [
    activeSilence,
    audioError,
    audioPart,
    isLoadingAudio,
    isPlaying,
    onUiStatus,
  ]);

  const playAudio = async () => {
    if (isReviewModeRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setNeedsUserStart(false);
    } catch (error: unknown) {
      if (isUserActivationPlaybackError(error)) {
        setNeedsUserStart(true);
        return;
      }
      setAudioError(getErrorMessage(error, "Unable to play audio"));
    }
  };

  const findSilenceAtTime = (t: number): ListeningSilenceRange | null => {
    const tl = timelineRef.current;
    if (!tl || tl.silenceRanges.length === 0) return null;
    const idx = findLastIndexLeq(tl.silenceStarts, t);
    if (idx < 0) return null;
    const range = tl.silenceRanges[idx];
    if (!range) return null;
    if (t >= range.start && t < range.end) return range;
    return null;
  };

  const getAudioPartAtTime = (t: number): number | null => {
    const tl = timelineRef.current;
    if (!tl) return null;
    const idx = findLastIndexLeq(tl.eventStarts, t);
    if (idx < 0) return null;
    for (let i = idx; i >= 0; i--) {
      const ev = tl.events[i];
      if (!ev) continue;
      if (ev.part && ev.part >= 1 && ev.part <= 4) return ev.part;
    }
    return null;
  };

  const seekToPart = async (part: number): Promise<void> => {
    if (isReviewModeRef.current) return;
    const tl = timelineRef.current;
    if (!tl) return;
    const start = tl.partStarts[part];
    if (!isFiniteNumber(start)) return;

    const ok = await seekAudioTo(start + 0.01);
    if (!ok) {
      setAudioError("Unable to jump audio at the moment");
      return;
    }
    setAudioPart(part);
    await playAudio();
  };

  const skipCurrentSilence = async (): Promise<void> => {
    if (isReviewModeRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    const silence = findSilenceAtTime(audio.currentTime || 0);
    if (!silence) return;
    const ok = await seekAudioTo(silence.end + 0.01);
    if (!ok) {
      setAudioError("Unable to skip silence at the moment");
      return;
    }
    setActiveSilence(null);
    await playAudio();
  };

  const seekAudioTo = async (targetSec: number): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;

    if (audio.readyState < 1) {
      const isReady = await new Promise<boolean>((resolve) => {
        let timeoutId = 0;
        const done = (ok: boolean): void => {
          window.clearTimeout(timeoutId);
          audio.removeEventListener("loadedmetadata", onLoadedMetadata);
          audio.removeEventListener("canplay", onLoadedMetadata);
          audio.removeEventListener("error", onError);
          resolve(ok);
        };
        const onLoadedMetadata = (): void => done(audio.readyState >= 1);
        const onError = (): void => done(false);
        timeoutId = window.setTimeout(() => done(audio.readyState >= 1), 1500);

        audio.addEventListener("loadedmetadata", onLoadedMetadata, {
          once: true,
        });
        audio.addEventListener("canplay", onLoadedMetadata, { once: true });
        audio.addEventListener("error", onError, { once: true });
        audio.load();
      });

      if (!isReady) return false;
    }

    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : targetSec;
    const clampedTarget = Math.max(0, Math.min(targetSec, duration));
    const seekThreshold = 1.5;
    const isCloseEnough = (): boolean => {
      const t = audio.currentTime || 0;
      return (
        Math.abs(t - clampedTarget) <= seekThreshold ||
        t >= clampedTarget - seekThreshold
      );
    };

    try {
      if (typeof audio.fastSeek === "function") {
        audio.fastSeek(clampedTarget);
      } else {
        audio.currentTime = clampedTarget;
      }
    } catch {
      return false;
    }

    if (isCloseEnough()) {
      setCurrentTimeSec(audio.currentTime || clampedTarget);
      setAudioError(null);
      onPersistStateRef.current({
        currentTimeSec: audio.currentTime || clampedTarget,
        volume: volumeRef.current,
      });
      return true;
    }

    const landed = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        window.clearTimeout(timeoutId);
        audio.removeEventListener("seeked", onSeeked);
        audio.removeEventListener("timeupdate", onTimeUpdateAfterSeek);
        resolve(ok);
      };
      const onSeeked = (): void => done(isCloseEnough());
      const onTimeUpdateAfterSeek = (): void => {
        if (isCloseEnough()) done(true);
      };
      const timeoutId = window.setTimeout(() => done(isCloseEnough()), 900);

      audio.addEventListener("seeked", onSeeked);
      audio.addEventListener("timeupdate", onTimeUpdateAfterSeek);
    });

    if (!landed) return false;

    setCurrentTimeSec(audio.currentTime || clampedTarget);
    setAudioError(null);
    onPersistStateRef.current({
      currentTimeSec: audio.currentTime || clampedTarget,
      volume: volumeRef.current,
    });
    return true;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.volume = isMutedRef.current ? 0 : volumeRef.current;
    const tryAutoplay = (): void => {
      if (hasAttemptedAutoplayRef.current) return;
      if (isReviewModeRef.current) return;
      hasAttemptedAutoplayRef.current = true;
      void audio.play().catch(() => {
        setNeedsUserStart(true);
      });
    };

    const onLoadedMetadata = (): void => {
      setIsLoadingAudio(false);
      setAudioError(null);

      const pending = pendingSeekRef.current;
      if (pending != null && Number.isFinite(pending)) {
        try {
          audio.currentTime = Math.max(
            0,
            Math.min(pending, audio.duration || pending),
          );
          setCurrentTimeSec(audio.currentTime);
        } catch {
        } finally {
          pendingSeekRef.current = null;
        }
      }
      tryAutoplay();
    };

    const onTimeUpdate = (): void => {
      const t = audio.currentTime || 0;
      setCurrentTimeSec(t);

      const silence = findSilenceAtTime(t);
      setActiveSilence((prev) => {
        if (!prev && !silence) return prev;
        if (
          prev &&
          silence &&
          prev.start === silence.start &&
          prev.end === silence.end
        )
          return prev;
        return silence ?? null;
      });

      // Persist playback position continuously so resume can recover close to the last moment.
      onPersistStateRef.current({
        currentTimeSec: t,
        volume: volumeRef.current,
      });

      const nextAudioPart = getAudioPartAtTime(t);
      setAudioPart((prev) => {
        if (prev === nextAudioPart) return prev;
        return nextAudioPart;
      });
    };

    const onPlay = (): void => {
      setIsPlaying(true);
      setNeedsUserStart(false);
      setAudioError(null);
    };

    const onPause = (): void => {
      setIsPlaying(false);
    };

    const onWaiting = (): void => {
      setIsLoadingAudio(true);
    };

    const onCanPlay = (): void => {
      setIsLoadingAudio(false);
      setAudioError(null);
      if (!hasAttemptedAutoplayRef.current && !isReviewModeRef.current) {
        tryAutoplay();
      }
    };

    const onError = (): void => {
      setAudioError("Failed to load audio");
    };

    const onEnded = (): void => {
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    // This effect owns the source so setup also restores it after effect replay.
    audio.src = sources.audioUrl;
    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        // Media teardown is best-effort; some browsers reject it after source failure.
      }
    };
  }, [sources.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
    const t = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    onPersistStateRef.current({ currentTimeSec: t, volume });
  }, [isMuted, volume]);

  useEffect(() => {
    if (!isReviewMode) return;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
    } catch {
      // Review mode is already non-playing when an uninitialized element rejects pause().
    }
  }, [isReviewMode]);

  const canUseTimeline = Boolean(timeline) && !timelineError;
  const hasPartStartForCurrentPart = Boolean(
    timeline && isFiniteNumber(timeline.partStarts[currentPart]),
  );
  const showJumpToCurrentPart = Boolean(
    !isReviewMode &&
    audioPromptsEnabled &&
    canUseTimeline &&
    hasPartStartForCurrentPart &&
    dismissedJumpPart !== currentPart &&
    (audioPart == null ? currentPart > 1 : audioPart !== currentPart),
  );

  const silenceRemainingSec = activeSilence
    ? Math.max(0, activeSilence.end - currentTimeSec)
    : 0;
  const activeSilenceKey = activeSilence
    ? `${activeSilence.start}:${activeSilence.end}`
    : null;
  const showSkipSilence = Boolean(
    !isReviewMode &&
    audioPromptsEnabled &&
    activeSilence &&
    silenceRemainingSec > 0.25 &&
    activeSilenceKey !== dismissedSilenceKey,
  );

  const showActionsRow = Boolean(
    needsUserStart ||
    showSkipSilence ||
    showJumpToCurrentPart ||
    isLoadingAudio ||
    isTimelineLoading ||
    timelineError ||
    audioError,
  );
  const [isPopoutWiggling, setIsPopoutWiggling] = useState(false);

  useEffect(() => {
    if (placement !== "header-popout" || !showActionsRow) return;

    let burstCount = 0;
    let wiggleResetTimer: number | null = null;
    const maxBursts = 3;
    const intervalMs = 2000;

    const runWiggleBurst = (): void => {
      burstCount += 1;
      setIsPopoutWiggling(true);
      if (wiggleResetTimer != null) window.clearTimeout(wiggleResetTimer);
      wiggleResetTimer = window.setTimeout(() => {
        setIsPopoutWiggling(false);
      }, 460);
    };

    runWiggleBurst();
    const intervalId = window.setInterval(() => {
      if (burstCount >= maxBursts) {
        window.clearInterval(intervalId);
        return;
      }
      runWiggleBurst();
      if (burstCount >= maxBursts) {
        window.clearInterval(intervalId);
      }
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
      if (wiggleResetTimer != null) window.clearTimeout(wiggleResetTimer);
    };
  }, [placement, showActionsRow]);

  const actionsContent = showActionsRow ? (
    <>
      {needsUserStart && !isReviewMode && (
        <ListeningPlayButton
          onPlay={() => void playAudio()}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        />
      )}

      {showSkipSilence && (
        <ListeningSkipPrompt
          onSkip={() => void skipCurrentSilence()}
          onDismiss={() => setDismissedSilenceKey(activeSilenceKey)}
          dismissLabel="Dismiss skip silence"
          actionClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          dismissClassName="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        >
          Skip silence ({formatTime(silenceRemainingSec)})
        </ListeningSkipPrompt>
      )}

      {showJumpToCurrentPart && (
        <ListeningSkipPrompt
          onSkip={() => void seekToPart(currentPart)}
          onDismiss={() => setDismissedJumpPart(currentPart)}
          dismissLabel={`Dismiss jump audio to Part ${currentPart}`}
          actionClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          dismissClassName="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        >
          Jump audio to Part {currentPart}
        </ListeningSkipPrompt>
      )}

      {isLoadingAudio && (
        <span className="exam-subtle-text text-[10px] font-bold">
          Buffering audio…
        </span>
      )}
      {isTimelineLoading && (
        <span className="exam-subtle-text text-[10px] font-bold">
          Loading timeline…
        </span>
      )}
      {timelineError && (
        <span className="text-[10px] font-bold text-amber-700">
          Timeline unavailable
        </span>
      )}
      {audioError && (
        <span className="text-[10px] font-bold text-red-600">{audioError}</span>
      )}
    </>
  ) : null;

  return (
    <>
      <audio ref={audioRef} />
      {showActionsRow ? (
        <ListeningAudioActions
          placement={placement}
          popoutClassName={isPopoutWiggling ? "exam-header-popout-wiggle" : ""}
        >
          {actionsContent}
        </ListeningAudioActions>
      ) : null}
    </>
  );
};
