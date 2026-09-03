// @vitest-environment happy-dom
import { act, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { satPracticeAssessment } from "@/content/sat";
import type { AssessmentSubmission } from "@/domain/assessment";
import {
  initialAssessmentSession,
} from "@/domain/assessmentSession";
import type {
  ObjectiveSubmission,
  SpeakingSubmission,
  WritingSubmission,
} from "@/domain/types";
import { useIeltsApplication } from "./useIeltsApplication";
import { useAssessmentApplication } from "./useAssessmentApplication";
import { getIeltsExample } from '@/content/ieltsExamples';
import { defaultSpeakingPlan } from '@/domain/speakingPlan';
import { loadSession } from '@/infrastructure/ieltsSessionStorage';
import { draftSaves } from '@/infrastructure/saveCoordinator';
import { ASSESSMENT_SESSION_STORAGE_KEY, saveAssessmentSession } from '@/infrastructure/assessmentSessionStorage';

// Persistence is a boundary here; real SQLite upgrade/rollback tests live in
// draftRepository.test.ts. These adapters retain the old fixtures for hook tests.
vi.mock('@/infrastructure/database/draftRepository', () => ({ getDraftRepository: async () => {
  const native = await import('@/infrastructure/ieltsSessionStorage');
  const universal = await import('@/infrastructure/assessmentSessionStorage');
  return {
    issues: [],
    loadIelts: async (reader: Parameters<typeof native.loadSession>[0]) => ({ session: await native.loadSession(reader), documents: [] }),
    saveIelts: native.saveSession,
    loadAssessment: async () => universal.loadAssessmentSession(),
    saveAssessment: universal.saveAssessmentSession,
  };
} }));

const repositories = vi.hoisted(() => ({
  ielts: {
    readObjectiveExplanations: async () => [],
    readLearningSummary: vi.fn(),
    readObjectiveAttempt: vi.fn(async () => null),
    readWritingAttempt: vi.fn(async () => null),
    readSpeakingAttempt: vi.fn(async () => null),
    saveObjectiveAttempt: vi.fn(),
    saveWritingAttempt: vi.fn(),
    saveSpeakingAttempt: vi.fn(),
    saveObjectiveExplanation: vi.fn(),
    saveWritingEvaluation: vi.fn(),
    saveSpeakingEvaluation: vi.fn(),
  },
  assessment: {
    loadPackages: vi.fn(async () => []),
    readHistory: vi.fn(async () => []),
    saveAttempt: vi.fn(),
  },
}));
vi.mock("@/infrastructure/database/assessmentRepository", () => ({
  getAssessmentRepository: async () => repositories.assessment,
}));

const nativePersistence = {
  getRepository: async () => repositories.ielts,
  getContentStore: async () => ({
    loadActive: async () => [],
    loadByKey: async () => null,
    saveAndActivate: async () => {},
  }),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let root: Root;
let host: HTMLDivElement;
let native: ReturnType<typeof useIeltsApplication>;
let universal: ReturnType<typeof useAssessmentApplication>;
function Native() {
  const application = useIeltsApplication(nativePersistence);
  useLayoutEffect(() => {
    native = application;
  });
  return <p>{application.state.view}</p>;
}
function Universal() {
  const application = useAssessmentApplication();
  useLayoutEffect(() => {
    universal = application;
  });
  return <p>{application.state.view}</p>;
}

it('commits installed content before the external installation caller reads its identity', async () => {
  await act(async () => root.render(<Native />));
  const example = getIeltsExample('listening');
  await act(async () => {
    await native.commands.installContent(example);
    expect(native.content.listening.contentKey).toBe(example.contentKey);
  });
});

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await draftSaves.flush();
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("real application hook lifecycle", () => {
  it('persists a configured Speaking plan before returning and retains it across a section switch and remount', async () => {
    await act(async () => root.render(<Native />));
    const plan = { ...defaultSpeakingPlan, contentKey: 'durable-speaking', title: 'Durable interview' };
    let id!: string;
    await act(async () => {
      await native.commands.start('section', 'speaking');
      id = native.state.attemptId!;
      await native.commands.configureSpeakingPlan(plan);
      expect(await loadSession(repositories.ielts)).toMatchObject({ attemptId: id, speakingPlan: plan });
      await native.commands.start('section', 'reading');
    });
    await act(async () => root.render(<div>Unmounted</div>));
    await act(async () => root.render(<Native />));
    await act(async () => { await native.commands.goHome(); await native.commands.resume(id); });
    expect(native.state).toMatchObject({ attemptId: id, speakingPlan: plan, currentSection: 'speaking' });
  });
  it('rejects configuration and navigation when storage fails, without changing the current draft', async () => {
    await act(async () => root.render(<Native />));
    await act(async () => native.commands.start('section', 'speaking'));
    const before = native.state;
    const storage = localStorage;
    vi.stubGlobal('localStorage', { getItem: storage.getItem.bind(storage), removeItem: storage.removeItem.bind(storage), setItem() { throw new Error('Quota exceeded'); } });
    try {
      await expect(native.commands.configureSpeakingPlan(defaultSpeakingPlan)).rejects.toThrow('Quota exceeded');
      await expect(native.commands.start('section', 'reading')).rejects.toThrow('Quota exceeded');
      expect(native.state).toBe(before);
    } finally { vi.stubGlobal('localStorage', storage); }
  });
  it('finishes the correct parked draft when a submission resolves after switching sections', async () => {
    await act(async () => root.render(<Native />));
    await act(async () => native.commands.start('section', 'writing'));
    const pending = deferred<WritingSubmission>();
    repositories.ielts.saveWritingAttempt.mockReturnValueOnce(pending.promise);
    let saving!: Promise<WritingSubmission>;
    await act(async () => { saving = native.commands.submitWriting(); });
    const saved = repositories.ielts.saveWritingAttempt.mock.calls[0][0];
    await act(async () => native.commands.start('section', 'speaking'));
    const currentId = native.state.attemptId;
    expect(native.state.pausedDrafts).toHaveLength(1);
    await act(async () => { pending.resolve(saved); await saving; });
    expect(native.state).toMatchObject({ attemptId: currentId, currentSection: 'speaking', pausedDrafts: [], completedSections: [] });
  });
  it("refreshes native history when a save completes after returning home", async () => {
    await act(async () => root.render(<Native />));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await act(async () => native.commands.start("section", "writing"));
    const pending = deferred<WritingSubmission>();
    repositories.ielts.saveWritingAttempt.mockReturnValueOnce(pending.promise);
    let saving!: Promise<WritingSubmission>;
    await act(async () => {
      saving = native.commands.submitWriting();
    });
    const submission: WritingSubmission =
      repositories.ielts.saveWritingAttempt.mock.calls[0][0];
    await act(async () => native.commands.goHome());
    const reads = repositories.ielts.readLearningSummary.mock.calls.length;
    await act(async () => {
      pending.resolve(submission);
      await saving;
    });
    expect(native.state.view).toBe("home");
    expect(repositories.ielts.readLearningSummary).toHaveBeenCalledTimes(
      reads + 1,
    );
  });

  it("keeps a custom assessment draft when its catalog cannot be loaded", async () => {
    saveAssessmentSession({
      ...initialAssessmentSession,
      attemptId: "22222222-2222-4222-8222-222222222222",
      packageId: "custom-package",
      partId: "part-1",
      itemId: "item-1",
      startedAt: "2026-09-02T10:00:00.000Z",
      responses: { "item-1": "Saved answer" },
    });
    const before = localStorage.getItem(ASSESSMENT_SESSION_STORAGE_KEY);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(repositories.assessment, "loadPackages").mockRejectedValue(
      new Error("Storage unavailable"),
    );
    await act(async () =>
      root.render(
        <StrictMode>
          <Universal />
        </StrictMode>,
      ),
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(universal.assessmentReady).toBe(false);
    expect(universal.loadError).toContain("could not be loaded");
    expect(universal.state.responses).toEqual({}); // Not exposed until its catalog loads.
    expect(localStorage.getItem(ASSESSMENT_SESSION_STORAGE_KEY)).toBe(before);
  });

  it.each(["writing", "reading", "speaking"] as const)(
    "keeps a restarted %s attempt when an earlier save finishes",
    async (section) => {
      await act(async () => {
        root.render(
          <StrictMode>
            <Native />
          </StrictMode>,
        );
      });
      await act(async () => {
        await vi.dynamicImportSettled();
      });
      expect(native.contentReady).toBe(true);
      await act(async () => native.commands.start("section", section));
      const oldId = native.state.attemptId;
      const pending = deferred<
        ObjectiveSubmission | WritingSubmission | SpeakingSubmission
      >();
      let saving!: Promise<unknown>;
      let submission:
        ObjectiveSubmission | WritingSubmission | SpeakingSubmission;
      await act(async () => {
        if (section === "writing") {
          repositories.ielts.saveWritingAttempt.mockReturnValueOnce(
            pending.promise,
          );
          saving = native.commands.submitWriting();
        } else if (section === "reading") {
          repositories.ielts.saveObjectiveAttempt.mockReturnValueOnce(
            pending.promise,
          );
          saving = native.commands.submitObjective("reading");
        } else {
          repositories.ielts.saveSpeakingAttempt.mockReturnValueOnce(
            pending.promise,
          );
          saving = native.commands.submitSpeaking({
            contentKey: "speaking",
            startedAt: new Date().toISOString(),
            recordings: [],
          });
        }
      });
      if (section === "writing")
        submission = repositories.ielts.saveWritingAttempt.mock.calls[0][0];
      else if (section === "reading")
        submission = repositories.ielts.saveObjectiveAttempt.mock.calls[0][0];
      else
        submission = {
          ...repositories.ielts.saveSpeakingAttempt.mock.calls[0][0],
          responses: [],
        };
      await act(async () => native.commands.goHome());
      await act(async () => native.commands.start("section", section));
      const newId = native.state.attemptId;
      expect(newId).not.toBe(oldId);
      await act(async () => {
        pending.resolve(submission);
        await saving;
      });
      expect(native.state).toMatchObject({
        view: "exam",
        attemptId: newId,
        currentSection: section,
        completedSections: [],
      });
      expect(native.state.writingSubmission).toBeUndefined();
      expect(native.state.speakingSubmission).toBeUndefined();
      expect(native.state.objectiveSubmissions).toEqual({});
    },
  );

  it("scopes universal in-flight submission reuse to the attempt ID", async () => {
    await act(async () =>
      root.render(
        <StrictMode>
          <Universal />
        </StrictMode>,
      ),
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await act(async () =>
      universal.commands.start(satPracticeAssessment.packageId),
    );
    const first = deferred<AssessmentSubmission>();
    const second = deferred<AssessmentSubmission>();
    repositories.assessment.saveAttempt
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    let savingFirst!: Promise<AssessmentSubmission>;
    let duplicate!: Promise<AssessmentSubmission>;
    await act(async () => {
      savingFirst = universal.commands.submit();
      duplicate = universal.commands.submit();
    });
    expect(repositories.assessment.saveAttempt).toHaveBeenCalledOnce();
    await act(async () => universal.commands.restart());
    let savingSecond!: Promise<AssessmentSubmission>;
    await act(async () => {
      savingSecond = universal.commands.submit();
    });
    expect(repositories.assessment.saveAttempt).toHaveBeenCalledTimes(2);
    const oldSnapshot: AssessmentSubmission =
      repositories.assessment.saveAttempt.mock.calls[0][0];
    const newSnapshot: AssessmentSubmission =
      repositories.assessment.saveAttempt.mock.calls[1][0];
    await act(async () => {
      first.resolve(oldSnapshot);
      await Promise.all([savingFirst, duplicate]);
    });
    expect(universal.state).toMatchObject({
      view: "assessment",
      attemptId: newSnapshot.attemptId,
    });
    await act(async () => {
      second.resolve(newSnapshot);
      await savingSecond;
    });
    expect(universal.state).toMatchObject({
      view: "result",
      attemptId: null,
      submission: newSnapshot,
    });
  });
});
