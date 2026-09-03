import { revision } from '@/content/bundledListeningAudio.json';

type BundledListeningSources = {
  assetKey: string;
  audioUrl: string;
  timelineUrl: string;
};

const LISTENING_AUDIO_ASSETS: Record<string, BundledListeningSources> = {
  "local-original": {
    assetKey: "local-original",
    audioUrl: `/audio/listening-test-1.mp3?v=${revision}`,
    timelineUrl: `/audio/local-original-timeline.json?v=${revision}`,
  },
};

export function getBundledListeningSources(
  assetKey: string,
): BundledListeningSources {
  const sources = LISTENING_AUDIO_ASSETS[assetKey];
  if (!sources) {
    throw new Error(`Listening audio asset ${assetKey} is not available offline.`);
  }
  return sources;
}
