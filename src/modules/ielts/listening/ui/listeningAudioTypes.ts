import type { ListeningAudioPersistedState } from "@/infrastructure/media/listeningTimeline";

export type { ListeningAudioPersistedState } from "@/infrastructure/media/listeningTimeline";

export type ListeningAudioBarProps = {
  currentPart: number;
  isReviewMode: boolean;
  placement?: "inline" | "header-popout";
  audioPromptsEnabled?: boolean;
  hydrateState?: ListeningAudioPersistedState | null;
  onPersistState: (next: ListeningAudioPersistedState) => void;
  onUiStatus?: (status: ListeningAudioUiStatus) => void;
  isMuted?: boolean;
};

export type ListeningAudioUiStatus = {
  state: "loading" | "playing" | "paused" | "error" | "unavailable";
  audioPart: number | null;
  isInSilence: boolean;
  silenceEndSec: number | null;
};
