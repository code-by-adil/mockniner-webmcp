type ListeningAudioSources = {
  assetKey: string;
  audioUrl: string;
  timelineUrl: string;
};

const LISTENING_AUDIO_ASSETS: Record<string, ListeningAudioSources> = {
  "local-original": {
    assetKey: "local-original",
    audioUrl: "/audio/listening-test-1.mp3",
    timelineUrl: "/audio/local-original-timeline.json",
  },
};

export function getListeningAudioSources(
  assetKey: string,
): ListeningAudioSources {
  const sources = LISTENING_AUDIO_ASSETS[assetKey];
  if (!sources) {
    throw new Error(`Listening audio asset ${assetKey} is not available offline.`);
  }
  return sources;
}
