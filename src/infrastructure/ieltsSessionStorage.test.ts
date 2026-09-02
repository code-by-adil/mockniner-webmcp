import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writingDocument } from "@/content/writing";
import { initialSession, type IeltsSession } from "@/domain/session";
import { loadSession, saveSession } from "./ieltsSessionStorage";
import type { WritingSubmission } from "@/domain/types";

const id = "22222222-2222-4222-8222-222222222222";
const submission: WritingSubmission = {
  attemptId: id,
  contentKey: writingDocument.contentKey,
  tasks: writingDocument.tasks.map((task) => ({
    task,
    response: "Private submitted answer.",
    wordCount: 3,
  })) as WritingSubmission["tasks"],
  startedAt: "2026-09-02T10:00:00.000Z",
  submittedAt: "2026-09-02T11:00:00.000Z",
};
const session: IeltsSession = {
  ...initialSession,
  attemptId: id,
  mode: "section",
  view: "result",
  currentSection: "writing",
  writingDrafts: {
    1: "Private submitted answer.",
    2: "Private submitted answer.",
  },
  writingSubmission: submission,
  completedSections: ["writing"],
};
const values = new Map<string, string>();
const reader = {
  readLearningSummary: vi.fn(),
  readObjectiveAttempt: vi.fn(),
  readSpeakingAttempt: vi.fn(),
  readWritingAttempt: vi.fn(async () => ({ submission, evaluation: null })),
};
beforeEach(() => {
  values.clear();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("native session storage", () => {
  it("stores only drafts and IDs, then restores submitted work from its repository", async () => {
    saveSession(session);
    const stored = [...values.values()][0];
    expect(stored).not.toContain("Private submitted answer");
    expect(stored).not.toContain("academic_task_1_bar_chart");
    expect(JSON.parse(stored).resultAttemptIds).toEqual({ writing: id });
    expect(await loadSession(reader)).toMatchObject({
      view: "result",
      writingSubmission: submission,
      writingDrafts: { 1: "", 2: "" },
    });
    expect(reader.readWritingAttempt).toHaveBeenCalledExactlyOnceWith(id);
  });
  it("loads the previous full-session format without trusting embedded submissions", async () => {
    values.set(
      "ielts-practice-session-v4",
      JSON.stringify({
        ...session,
        attemptId: undefined,
        writingSubmission: { ...submission, tasks: "corrupted embedded copy" },
      }),
    );
    expect(await loadSession(reader)).toMatchObject({
      writingSubmission: submission,
      completedSections: ["writing"],
    });
  });
  it("does not replace the saved record when the repository fails to load", async () => {
    saveSession(session);
    const before = [...values.values()];
    const failedReader = {
      ...reader,
      readWritingAttempt: vi.fn(async () => {
        throw new Error("Storage unavailable");
      }),
    };
    await expect(loadSession(failedReader)).rejects.toThrow(
      "Storage unavailable",
    );
    expect([...values.values()]).toEqual(before);
  });
  it("preserves malformed session metadata for recovery", async () => {
    const raw = '{"version":1,"draft":{"writingDrafts":{"1":"Saved work"}}}';
    values.set("ielts-practice-session-v4", raw);
    await expect(loadSession(reader)).rejects.toThrow(
      "session metadata is invalid",
    );
    expect(values.get("ielts-practice-session-v4")).toBe(raw);
  });
  it("does not erase result references when a submission cannot be found", async () => {
    saveSession(session);
    const before = [...values.values()];
    await expect(
      loadSession({ ...reader, readWritingAttempt: async () => null }),
    ).rejects.toThrow("submission could not be found");
    expect([...values.values()]).toEqual(before);
  });
});
