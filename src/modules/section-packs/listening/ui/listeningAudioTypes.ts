export type { ListeningAudioPersistedState } from "@/infrastructure/media/listeningTimeline";

export type ListeningAudioUiStatus = {
  state: "loading" | "playing" | "paused" | "error" | "unavailable";
  audioPart: number | null;
  isInSilence: boolean;
  silenceEndSec: number | null;
};
