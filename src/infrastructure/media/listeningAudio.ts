type ListeningAudioSources = {
  contentKey: string;
  audioUrl: string;
  timelineUrl: string;
};

export function getListeningAudioSources(
  contentKey: string,
): ListeningAudioSources {
  const encodedContentKey = encodeURIComponent(contentKey);
  return {
    contentKey,
    audioUrl: "/audio/listening-test-1.mp3",
    timelineUrl: `/audio/${encodedContentKey}-timeline.json`,
  };
}
