import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { ListeningAudioActions, ListeningPlayButton, ListeningSkipPrompt } from "./ListeningAudioControls";
import { getBundledListeningSources } from "@/infrastructure/media/bundledListeningAssets";
import { parseListeningTimeline, type NormalizedListeningTimeline } from "@/infrastructure/media/listeningTimeline";
import { formatTime } from "@/shared/time";
import type { ListeningAudioBarProps, ListeningAudioUiStatus } from "./listeningAudioTypes";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

type Props = ListeningAudioBarProps & { audioAssetKey: string };

export const BundledListeningAudioBar: FC<Props> = ({
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
  const sources = useMemo(() => getBundledListeningSources(audioAssetKey), [audioAssetKey]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceActiveRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(Math.max(0, hydrateState?.currentTimeSec ?? 0));
  const attemptedAutoplayRef = useRef(false);
  const volume = Math.min(1, Math.max(0, hydrateState?.volume ?? 0.85));

  const [timeline, setTimeline] = useState<NormalizedListeningTimeline | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(() => Math.max(0, hydrateState?.currentTimeSec ?? 0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [needsUserStart, setNeedsUserStart] = useState(false);
  const [dismissedJumpPart, setDismissedJumpPart] = useState<number | null>(null);
  const [dismissedSilenceKey, setDismissedSilenceKey] = useState<string | null>(null);

  const audioPart = timeline?.events.findLast(event =>
    event.start <= currentTimeSec && event.part != null && event.part >= 1 && event.part <= 4,
  )?.part ?? null;
  const activeSilence = timeline?.silenceRanges.find(range =>
    currentTimeSec >= range.start && currentTimeSec < range.end,
  ) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(sources.timelineUrl, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const normalized = parseListeningTimeline(await response.json());
        if (!normalized) throw new Error("Invalid timeline format");
        if (!controller.signal.aborted) setTimeline(normalized);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setTimelineError(errorMessage(error, "Audio navigation could not load."));
      });
    return () => controller.abort();
  }, [sources.timelineUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    sourceActiveRef.current = true;
    attemptedAutoplayRef.current = false;
    // Source setup and cleanup are symmetric, including StrictMode effect replay.
    audio.src = sources.audioUrl;
    audio.load();
    return () => {
      sourceActiveRef.current = false;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [sources.audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [isMuted, volume]);

  useEffect(() => {
    if (isReviewMode) audioRef.current?.pause();
  }, [isReviewMode]);

  useEffect(() => {
    const status: ListeningAudioUiStatus = {
      needsUserStart,
      state: audioError ? "error" : isLoadingAudio ? "loading" : isPlaying ? "playing" : "paused",
      audioPart,
      isInSilence: activeSilence != null,
      silenceEndSec: activeSilence?.end ?? null,
    };
    onUiStatus?.(status);
  }, [activeSilence, audioError, audioPart, isLoadingAudio, isPlaying, needsUserStart, onUiStatus]);

  const persistPosition = (audio: HTMLAudioElement): void => {
    // load() resets currentTime. Do not replace a saved cursor until restoration.
    if (!sourceActiveRef.current || pendingSeekRef.current != null) return;
    const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    setCurrentTimeSec(time);
    onPersistState({ currentTimeSec: time, volume });
  };

  const restorePosition = (audio: HTMLAudioElement): boolean => {
    const pending = pendingSeekRef.current;
    if (pending == null) return true;
    if (audio.readyState < 1) return false;
    try {
      audio.currentTime = Math.min(pending, Number.isFinite(audio.duration) ? audio.duration : pending);
      pendingSeekRef.current = null;
      persistPosition(audio);
      return true;
    } catch (error) {
      setAudioError(errorMessage(error, "The playback position could not be restored. Select Play audio to retry."));
      setNeedsUserStart(true);
      return false;
    }
  };

  const playAudio = async (): Promise<void> => {
    const audio = audioRef.current;
    if (isReviewMode || !audio || !sourceActiveRef.current) return;
    attemptedAutoplayRef.current = true;
    if (audio.readyState >= 1 && !restorePosition(audio)) return;
    setAudioError(null);
    try {
      await audio.play();
      if (sourceActiveRef.current) setNeedsUserStart(false);
    } catch (error) {
      if (!sourceActiveRef.current || error instanceof DOMException && error.name === "AbortError") return;
      setNeedsUserStart(true);
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
        setAudioError(errorMessage(error, "Unable to play audio."));
      }
    }
  };

  const handleMetadata = (audio: HTMLAudioElement): void => {
    if (!sourceActiveRef.current) return;
    setIsLoadingAudio(false);
    if (!restorePosition(audio)) return;
    setAudioError(null);
    if (!attemptedAutoplayRef.current) void playAudio();
  };

  const seekTo = async (target: number): Promise<void> => {
    const audio = audioRef.current;
    if (isReviewMode || !audio) return;
    pendingSeekRef.current = Math.max(0, target);
    if (audio.readyState >= 1 && !restorePosition(audio)) return;
    // loadedmetadata applies a queued seek before playback if the source is loading.
    await playAudio();
  };

  const silenceRemainingSec = activeSilence ? Math.max(0, activeSilence.end - currentTimeSec) : 0;
  const silenceKey = activeSilence ? `${activeSilence.start}:${activeSilence.end}` : null;
  const partStart = timeline?.partStarts[currentPart];
  const showJump = !isReviewMode && audioPromptsEnabled && partStart != null &&
    dismissedJumpPart !== currentPart && (audioPart == null ? currentPart > 1 : audioPart !== currentPart);
  const showSkip = !isReviewMode && audioPromptsEnabled && activeSilence != null &&
    silenceRemainingSec > 0.25 && silenceKey !== dismissedSilenceKey;
  const isTimelineLoading = !timeline && !timelineError;
  const showActions = needsUserStart || showSkip || showJump || isLoadingAudio || isTimelineLoading || timelineError || audioError;

  return (
    <>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="metadata"
        onLoadedMetadata={event => handleMetadata(event.currentTarget)}
        onCanPlay={event => handleMetadata(event.currentTarget)}
        onTimeUpdate={event => persistPosition(event.currentTarget)}
        onPlay={() => { setIsPlaying(true); setNeedsUserStart(false); setAudioError(null); }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onWaiting={() => setIsLoadingAudio(true)}
        onError={() => { if (sourceActiveRef.current) setAudioError("Failed to load audio."); }}
      />
      {showActions ? (
        <ListeningAudioActions placement={placement}>
          {needsUserStart && !isReviewMode ? <ListeningPlayButton onPlay={() => void playAudio()} /> : null}
          {showSkip ? (
            <ListeningSkipPrompt
              onSkip={() => void seekTo(activeSilence.end + 0.01)}
              onDismiss={() => setDismissedSilenceKey(silenceKey)}
              dismissLabel="Dismiss skip silence"
            >
              Skip silence ({formatTime(silenceRemainingSec)})
            </ListeningSkipPrompt>
          ) : null}
          {showJump ? (
            <ListeningSkipPrompt
              onSkip={() => void seekTo(partStart + 0.01)}
              onDismiss={() => setDismissedJumpPart(currentPart)}
              dismissLabel={`Dismiss jump audio to Part ${currentPart}`}
            >
              Jump audio to Part {currentPart}
            </ListeningSkipPrompt>
          ) : null}
          {isLoadingAudio ? <span className="exam-subtle-text text-[10px] font-bold">Buffering audio…</span> : null}
          {isTimelineLoading ? <span className="exam-subtle-text text-[10px] font-bold">Loading audio navigation…</span> : null}
          {timelineError ? <span className="text-[10px] font-bold text-amber-700">Audio navigation unavailable</span> : null}
          {audioError ? <span className="text-[10px] font-bold text-red-600">{audioError}</span> : null}
        </ListeningAudioActions>
      ) : null}
    </>
  );
};
