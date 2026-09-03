// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListeningAudioActions, ListeningPlayButton, ListeningSkipPrompt } from "./ListeningAudioControls";

describe("listening audio controls", () => {
  it("forwards play, skip, and dismiss actions without owning playback state", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const onPlay = vi.fn();
    const onSkip = vi.fn();
    const onDismiss = vi.fn();
    try {
      await act(async () => root.render(
        <ListeningAudioActions placement="inline">
          <ListeningPlayButton onPlay={onPlay} />
          <ListeningSkipPrompt onSkip={onSkip} onDismiss={onDismiss} dismissLabel="Dismiss skip silence">
            Skip silence (00:10)
          </ListeningSkipPrompt>
        </ListeningAudioActions>,
      ));
      const buttons = container.querySelectorAll("button");
      expect(buttons).toHaveLength(3);
      await act(async () => { for (const button of buttons) button.click(); });
      expect(onPlay).toHaveBeenCalledOnce();
      expect(onSkip).toHaveBeenCalledOnce();
      expect(onDismiss).toHaveBeenCalledOnce();
      expect(buttons[2].getAttribute("aria-label")).toBe("Dismiss skip silence");
      expect(container.querySelector("audio")).toBeNull();
      expect(container.querySelector(".exam-audio-popout")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });

  it("keeps shared focus and layout classes on the controls", () => {
    const html = renderToStaticMarkup(
      <ListeningAudioActions placement="header-popout">
        <ListeningSkipPrompt
          onSkip={() => undefined}
          onDismiss={() => undefined}
          dismissLabel="Dismiss jump audio to Part 2"
        >
          Jump audio to Part 2
        </ListeningSkipPrompt>
      </ListeningAudioActions>,
    );
    expect(html).toContain("exam-audio-popout");
    expect(html).toContain("focus-visible:ring-black/30");
    expect(html).toContain("shrink-0");
    expect(html).toContain("Jump audio to Part 2");
  });
});
