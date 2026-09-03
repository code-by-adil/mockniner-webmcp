import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ListeningAudioSession } from "@/application/useListeningAudio";
import { listeningDocument } from "@/content/objective";
import type { ListeningContentDocument } from "@/domain/objectiveContent";
import { ListeningAudioBar } from "./ListeningAudioBar";

const session: ListeningAudioSession = {
  phase: "ready",
  hydrated: true,
  chunks: [1, 2].map((partId, sequence) => ({
    contentKey: "generated-listening",
    cacheVersion: "test",
    sequence,
    partId,
    segmentIndex: 0,
    kind: "silence",
    durationMs: 10_000,
    mimeType: null,
    byteLength: 0,
    audio: null,
  })),
  totalChunks: 2,
  error: null,
  completedChunks: 2,
  readyToPlay: true,
  retry: () => undefined,
};

const generatedDocument: ListeningContentDocument = {
  ...listeningDocument,
  audio: {
    type: "kokoro",
    speakers: [{ id: "narrator", voice: "bf_emma" }],
    parts: [1, 2, 3, 4].map((partId) => ({
      partId,
      segments: [{ type: "silence", durationMs: 10_000 }],
    })),
  },
};

function renderAudio(
  document = generatedDocument,
  audioSession = session,
  isReviewMode = false,
) {
  return renderToStaticMarkup(
    <ListeningAudioBar
      document={document}
      audioSession={audioSession}
      currentPart={2}
      isReviewMode={isReviewMode}
      placement="header-popout"
      onPersistState={() => undefined}
    />,
  );
}

describe("listening player dispatch and controls", () => {
  it("renders bundled audio without waiting for Kokoro hydration", () => {
    const html = renderAudio(listeningDocument, { ...session, hydrated: false });
    expect(html).toContain("<audio");
    expect(html).toContain("Buffering audio…");
    expect(html).toContain("Loading audio navigation…");
    expect(html).not.toContain("Restoring saved listening audio");
  });

  it("waits for generated-audio hydration before mounting its controls", () => {
    const html = renderAudio(generatedDocument, { ...session, hydrated: false });
    expect(html).toContain("Restoring saved listening audio…");
    expect(html).not.toContain("Skip silence");
    expect(html).not.toContain("exam-audio-popout");
  });

  it("renders generated silence and jump prompts with their original labels", () => {
    const html = renderAudio();
    expect(html).toContain("Skip silence (00:10)");
    expect(html).toContain("Jump audio to Part 2");
    expect(html).toContain('aria-label="Dismiss skip silence"');
    expect(html).toContain('aria-label="Dismiss jump audio to Part 2"');
    expect(html).toContain("exam-audio-popout");
    expect(html).not.toContain("exam-header-popout-wiggle");
  });

  it("keeps generated-audio playback prompts hidden during review", () => {
    expect(renderAudio(generatedDocument, session, true)).toBe("");
  });
});
