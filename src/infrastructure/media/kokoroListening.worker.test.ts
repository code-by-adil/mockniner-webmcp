import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KokoroListeningAudio } from "@/domain/objectiveContent";
import { KOKORO_RUNTIME } from "./kokoroConfig";
import type {
  KokoroListeningWorkerRequest,
  KokoroListeningWorkerResponse,
} from "./kokoroListening.worker";
import type { KokoroPlanChunk } from "./kokoroScript";

const mocked = vi.hoisted(() => ({
  createPlan: vi.fn(),
  fromPretrained: vi.fn(),
}));

vi.mock("./kokoroModel", () => ({ loadKokoroModel: mocked.fromPretrained }));
vi.mock("./kokoroScript", () => ({
  createKokoroPlan: mocked.createPlan,
}));

const requestAudio: KokoroListeningAudio = {
  type: "kokoro",
  speakers: [],
  parts: [],
};

const plan: KokoroPlanChunk[] = [
  {
    sequence: 0,
    partId: 1,
    segmentIndex: 0,
    kind: "speech",
    text: "Welcome to the listening test.",
    voice: "af_heart",
  },
  {
    sequence: 1,
    partId: 1,
    segmentIndex: 1,
    kind: "silence",
    durationMs: 750,
  },
];

let handleMessage: ((event: MessageEvent<KokoroListeningWorkerRequest>) => void) | null;
let posted: ReturnType<typeof vi.fn<(message: KokoroListeningWorkerResponse) => void>>;

async function startWorker(completedSequences: number[]): Promise<void> {
  await import("./kokoroListening.worker");
  expect(handleMessage).not.toBeNull();
  handleMessage!({
    data: { type: "generate", audio: requestAudio, completedSequences },
  } as MessageEvent<KokoroListeningWorkerRequest>);
}

function responseTypes(): KokoroListeningWorkerResponse["type"][] {
  return posted.mock.calls.map(([response]) => response.type);
}

beforeEach(() => {
  vi.resetModules();
  mocked.createPlan.mockReset().mockResolvedValue(plan);
  mocked.fromPretrained.mockReset();
  handleMessage = null;
  posted = vi.fn<(message: KokoroListeningWorkerResponse) => void>();
  vi.stubGlobal("navigator", {
    gpu: { requestAdapter: vi.fn().mockResolvedValue({}) },
  });
  vi.stubGlobal("postMessage", posted);
  vi.stubGlobal("addEventListener", vi.fn((type, listener) => {
    if (type === "message") {
      handleMessage = listener as typeof handleMessage;
    }
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Kokoro worker protocol", () => {
  it("generates serially and waits for each persistence acknowledgement", async () => {
    const generate = vi.fn().mockResolvedValue({
      audio: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      sampling_rate: 24_000,
      toBlob: () => new Blob([new Uint8Array(60)], { type: "audio/wav" }),
    });
    mocked.fromPretrained.mockResolvedValue({ generate });

    await startWorker([]);
    await vi.waitFor(() => {
      expect(responseTypes()).toEqual(["planned", "ready", "chunk"]);
    });
    expect(posted.mock.calls[2]?.[0]).toMatchObject({
      type: "chunk",
      chunk: { sequence: 0, kind: "speech" },
    });

    handleMessage!({
      data: { type: "persisted", sequence: 0 },
    } as MessageEvent<KokoroListeningWorkerRequest>);
    await vi.waitFor(() => {
      expect(responseTypes()).toEqual([
        "planned",
        "ready",
        "chunk",
        "chunk",
      ]);
    });
    expect(posted.mock.calls[3]?.[0]).toMatchObject({
      type: "chunk",
      chunk: { sequence: 1, kind: "silence", durationMs: 750 },
    });
    expect(responseTypes()).not.toContain("complete");

    handleMessage!({
      data: { type: "persisted", sequence: 1 },
    } as MessageEvent<KokoroListeningWorkerRequest>);
    await vi.waitFor(() => {
      expect(responseTypes().at(-1)).toBe("complete");
    });

    expect(mocked.fromPretrained).toHaveBeenCalledWith(
      expect.any(Function),
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith("Welcome to the listening test.", {
      voice: "af_heart",
      speed: KOKORO_RUNTIME.speed,
    });
  });

  it("completes a fully persisted plan without loading the model", async () => {
    await startWorker([0, 1]);
    await vi.waitFor(() => {
      expect(responseTypes()).toEqual(["planned", "complete"]);
    });
    expect(mocked.fromPretrained).not.toHaveBeenCalled();
  });
});
