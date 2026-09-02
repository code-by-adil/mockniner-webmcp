// @vitest-environment happy-dom
import { act, StrictMode, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BundledListeningAudioBar } from "./BundledListeningAudioBar";

const timeline = {
  events: [
    { type: "speech", start: 0, end: 10, part: 1 },
    { type: "silence", start: 10, end: 20, part: 1 },
    { type: "speech", start: 60, end: 120, part: 2 },
  ],
};

describe("bundled Listening media lifecycle", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onPersistState = vi.fn();
  const onUiStatus = vi.fn();
  const loads: Array<{ src: string | null; crossOrigin: string | null; preload: string }> = [];

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(timeline))));
    // Happy DOM emits canplay synchronously from src; browsers load metadata asynchronously.
    vi.spyOn(HTMLMediaElement.prototype, "src", "set").mockImplementation(function (this: HTMLMediaElement, src) {
      this.setAttribute("src", src);
    });
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
      loads.push({ src: this.getAttribute("src"), crossOrigin: this.crossOrigin, preload: this.preload });
      this.currentTime = 0;
      Object.defineProperty(this, "readyState", { configurable: true, value: 0 });
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"));
    });
    vi.spyOn(HTMLMediaElement.prototype, "fastSeek").mockImplementation(function (this: HTMLMediaElement, time) {
      this.currentTime = time;
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("User activation required", "NotAllowedError"),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    loads.length = 0;
    onPersistState.mockClear();
    onUiStatus.mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function render(props: Partial<ComponentProps<typeof BundledListeningAudioBar>> = {}) {
    await act(async () => root.render(
      <StrictMode>
        <BundledListeningAudioBar
          audioAssetKey="local-original"
          currentPart={1}
          isReviewMode={false}
          onPersistState={onPersistState}
          onUiStatus={onUiStatus}
          {...props}
        />
      </StrictMode>,
    ));
    const audio = container.querySelector("audio");
    if (!audio) throw new Error("Bundled audio did not mount");
    return audio;
  }

  async function loadMetadata(audio: HTMLAudioElement) {
    Object.defineProperty(audio, "readyState", { configurable: true, value: 4 });
    Object.defineProperty(audio, "duration", { configurable: true, value: 120 });
    await act(async () => {
      audio.dispatchEvent(new Event("loadedmetadata"));
      audio.dispatchEvent(new Event("canplay"));
    });
  }

  async function click(text: string) {
    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.trim() === text,
    );
    if (!button) throw new Error(`Missing button: ${text}`);
    await act(async () => button.click());
  }

  it("restores its source after StrictMode cleanup and loads it with the media policy set", async () => {
    const audio = await render();
    expect(audio.getAttribute("src")).toBe("/audio/listening-test-1.mp3");
    expect(loads).toEqual([
      { src: "/audio/listening-test-1.mp3", crossOrigin: "anonymous", preload: "metadata" },
      { src: null, crossOrigin: "anonymous", preload: "metadata" },
      { src: "/audio/listening-test-1.mp3", crossOrigin: "anonymous", preload: "metadata" },
    ]);
    expect(audio.play).not.toHaveBeenCalled();
    await loadMetadata(audio);
    expect(container.textContent).not.toContain("Buffering audio");
    expect(container.textContent).not.toContain("Loading timeline");
    expect(container.textContent).toContain("Play");
    expect(audio.play).toHaveBeenCalledOnce();
    expect(onUiStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: "paused" }));
  });

  it("restores the saved cursor before autoplay and permits Play after autoplay is blocked", async () => {
    const audio = await render({ hydrateState: { currentTimeSec: 42, volume: 0.6 } });
    vi.mocked(audio.play).mockImplementation(async function (this: HTMLAudioElement) {
      expect(this.currentTime).toBe(42);
      throw new DOMException("User activation required", "NotAllowedError");
    });
    await loadMetadata(audio);
    expect(audio.currentTime).toBe(42);
    expect(audio.volume).toBe(0.6);

    vi.mocked(audio.play).mockImplementation(async function (this: HTMLAudioElement) {
      expect(this.currentTime).toBe(42);
      this.dispatchEvent(new Event("play"));
    });
    await click("Play audio");
    expect(onUiStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: "playing" }));
    expect(container.textContent).not.toContain("Play");
    await act(async () => audio.pause());
    expect(onUiStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: "paused" }));
  });

  it("keeps the source stable through rerenders, silence skipping, and timeline jumps", async () => {
    const audio = await render();
    await loadMetadata(audio);
    vi.mocked(audio.play).mockResolvedValue(undefined);
    await act(async () => {
      audio.currentTime = 12;
      audio.dispatchEvent(new Event("timeupdate"));
    });
    expect(onPersistState).toHaveBeenLastCalledWith({ currentTimeSec: 12, volume: 0.85 });
    await click("Skip silence (00:08)");
    expect(audio.currentTime).toBeCloseTo(20.01);
    await render({ currentPart: 2 });
    await click("Jump audio to Part 2");
    expect(audio.currentTime).toBeCloseTo(60.01);
    expect(onPersistState).toHaveBeenLastCalledWith({ currentTimeSec: 60.01, volume: 0.85 });
    expect(loads).toHaveLength(3);
    expect(audio.getAttribute("src")).toBe("/audio/listening-test-1.mp3");
  });

  it("releases the old media without persisting its reset and resumes on reentry", async () => {
    const audio = await render();
    await loadMetadata(audio);
    await act(async () => {
      audio.currentTime = 37;
      audio.dispatchEvent(new Event("timeupdate"));
    });
    const saved = onPersistState.mock.lastCall?.[0];
    expect(saved).toEqual({ currentTimeSec: 37, volume: 0.85 });
    onPersistState.mockClear();
    onUiStatus.mockClear();
    vi.mocked(audio.pause).mockClear();

    await act(async () => root.render(null));
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.getAttribute("src")).toBeNull();
    expect(loads.at(-1)?.src).toBeNull();
    expect(audio.currentTime).toBe(0);
    await act(async () => {
      audio.dispatchEvent(new Event("timeupdate"));
      audio.dispatchEvent(new Event("error"));
      audio.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(onPersistState).not.toHaveBeenCalled();
    expect(onUiStatus).not.toHaveBeenCalled();

    const resumed = await render({ hydrateState: saved });
    expect(resumed).not.toBe(audio);
    expect(resumed.getAttribute("src")).toBe("/audio/listening-test-1.mp3");
    await loadMetadata(resumed);
    expect(resumed.currentTime).toBe(37);
  });

  it("does not autoplay in review and applies mute without reloading the source", async () => {
    const audio = await render({ isReviewMode: true, isMuted: true });
    await loadMetadata(audio);
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.volume).toBe(0);
    expect(container.textContent).not.toContain("Play");
    await render({ isReviewMode: true, isMuted: false });
    expect(audio.volume).toBe(0.85);
    expect(loads).toHaveLength(3);
  });
});
