import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writingDocument } from "@/content/writing";
import { initialSession, sessionReducer, getIeltsDrafts, type IeltsSession } from "@/domain/session";
import { loadSession, saveSession } from "./ieltsSessionStorage";
import { defaultSpeakingPlan } from '@/domain/speakingPlan';
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
  readObjectiveExplanations: async () => [],
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
  it('retains the exact configured Speaking plan and attempt identity after reload', async () => {
    const speaking = { ...initialSession, mode: 'section' as const, view: 'exam' as const,
      currentSection: 'speaking' as const, attemptId: id,
      speakingPlan: { ...defaultSpeakingPlan, contentKey: 'reload-plan', title: 'Saved custom interview' } };
    saveSession(speaking);
    expect(await loadSession(reader)).toMatchObject({ attemptId: id, speakingPlan: speaking.speakingPlan });
  });
  it('round trips all five independent slots, plans, answer positions and timers', async () => {
    let state = initialSession;
    for (const [index, section] of (['speaking', 'reading', 'writing', 'listening', 'listening'] as const).entries()) {
      state = sessionReducer(state, { type: 'START', mode: index === 4 ? 'full' : 'section', section, attemptId: crypto.randomUUID(), startedAt: submission.startedAt });
      if (section === 'speaking') state = sessionReducer(state, { type: 'SET_SPEAKING_PLAN', plan: defaultSpeakingPlan });
      if (section === 'reading') state = sessionReducer(state, { type: 'SET_ANSWER', section, questionId: 1, value: 'TRUE' });
      if (section === 'writing') state = sessionReducer(state, { type: 'SET_WRITING', task: 1, value: 'My preserved draft.' });
      state = sessionReducer(state, { type: 'SET_PART', section, part: 2 });
      state = sessionReducer(state, { type: 'TICK', section });
    }
    saveSession(state);
    const restored = await loadSession(reader);
    expect(getIeltsDrafts(restored)).toHaveLength(5);
    for (const draft of getIeltsDrafts(state)) {
      const resumed = sessionReducer(sessionReducer(restored, { type: 'GO_HOME' }), { type: 'RESUME', targetAttemptId: draft.attemptId!, attemptId: crypto.randomUUID(), startedAt: submission.startedAt });
      expect(resumed.speakingPlan).toEqual(draft.speakingPlan);
      expect(resumed).toMatchObject({ attemptId: draft.attemptId, answers: draft.answers,
        writingDrafts: draft.writingDrafts, partBySection: draft.partBySection, secondsRemaining: draft.secondsRemaining });
      expect(getIeltsDrafts(resumed)).toHaveLength(5);
    }
  });
  it('migrates version-one snapshots without losing a draft and preserves invalid plans for recovery', async () => {
    saveSession({ ...session, speakingPlan: defaultSpeakingPlan });
    const old = JSON.parse(values.get('ielts-practice-session-v4')!);
    old.version = 1; delete old.pausedDrafts; delete old.draft.speakingPlan;
    values.set('ielts-practice-session-v4', JSON.stringify(old));
    expect(await loadSession(reader)).toMatchObject({ attemptId: id, pausedDrafts: [] });
    old.draft.speakingPlan = { ...defaultSpeakingPlan, questions: [] };
    const malformed = JSON.stringify(old);
    values.set('ielts-practice-session-v4', malformed);
    await expect(loadSession(reader)).rejects.toThrow('session metadata is invalid');
    expect(values.get('ielts-practice-session-v4')).toBe(malformed);
  });
  it('keeps parked drafts when the current slot is reset', async () => {
    let state = sessionReducer(initialSession, { type: 'START', mode: 'section', section: 'speaking', attemptId: id, startedAt: submission.startedAt });
    state = sessionReducer(state, { type: 'START', mode: 'section', section: 'reading', attemptId: crypto.randomUUID(), startedAt: submission.startedAt });
    saveSession(sessionReducer(state, { type: 'RESET' }));
    expect(getIeltsDrafts(await loadSession(reader))).toMatchObject([{ attemptId: id, currentSection: 'speaking' }]);
  });
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
