// @vitest-environment happy-dom
import { act, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLocal } from 'sqlocal';
import { satPracticeAssessment } from "@/content/sat";
import type { AssessmentSubmission } from "@/domain/assessment";
import {
  assessmentSessionReducer, initialAssessmentSession,
} from "@/domain/assessmentSession";
import type { WritingSubmission } from "@/domain/types";
import { useIeltsApplication } from "./useIeltsApplication";
import { useAssessmentApplication } from "./useAssessmentApplication";
import { getIeltsExample } from '@/content/ieltsExamples';
import { defaultSpeakingPlan } from '@/domain/speakingPlan';
import { draftSaves } from '@/infrastructure/saveCoordinator';
import { createDraftRepository } from '@/infrastructure/database/draftRepository';
import { createIeltsRepository } from '@/infrastructure/database/ieltsRepository';
import { createAssessmentRepository } from '@/infrastructure/database/assessmentRepository';
import { createContentStore } from '@/infrastructure/database/contentRepository';
import { migrateDatabase } from '@/infrastructure/database/migrations';

function createRepositories(database: SQLocal) {
  const ielts = createIeltsRepository(database);
  const assessment = createAssessmentRepository(database);
  return {
    ielts: {
      ...ielts,
      saveObjectiveAttempt: vi.fn(ielts.saveObjectiveAttempt),
      saveWritingAttempt: vi.fn(ielts.saveWritingAttempt),
      saveSpeakingAttempt: vi.fn(ielts.saveSpeakingAttempt),
    },
    assessment: {
      ...assessment,
      saveAttempt: vi.fn(assessment.saveAttempt),
    },
  };
}

let database: SQLocal;
let drafts: ReturnType<typeof createDraftRepository>;
let repositories: ReturnType<typeof createRepositories>;

const nativePersistence = {
  getRepository: async () => repositories.ielts,
  getContentStore: async () => createContentStore(database),
  getDraftRepository: async () => drafts,
};
const assessmentPersistence = {
  getRepository: async () => repositories.assessment,
  getDraftRepository: async () => drafts,
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
  const application = useAssessmentApplication(assessmentPersistence);
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

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal('Worker', class {});
  vi.stubGlobal('navigator', {});
  vi.clearAllMocks();
  let connected!: () => void;
  const ready = new Promise<void>(resolve => { connected = resolve; });
  database = new SQLocal({ databasePath: ':memory:', onInit: sql => [sql`PRAGMA foreign_keys = ON`], onConnect: connected });
  await ready;
  await migrateDatabase(database);
  drafts = createDraftRepository(database);
  repositories = createRepositories(database);
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
  await database.destroy(true);
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
      expect((await createDraftRepository(database).loadIelts(repositories.ielts)).session).toMatchObject({ attemptId: id, speakingPlan: plan });
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
    await database.sql`CREATE TRIGGER fail_draft_save BEFORE INSERT ON practice_drafts BEGIN SELECT RAISE(ABORT, 'Quota exceeded'); END`;
    try {
      await expect(native.commands.configureSpeakingPlan(defaultSpeakingPlan)).rejects.toThrow('Quota exceeded');
      await expect(native.commands.start('section', 'reading')).rejects.toThrow('Quota exceeded');
      expect(native.state).toBe(before);
    } finally { await database.sql`DROP TRIGGER fail_draft_save`; }
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
  it("keeps a custom assessment draft when its catalog cannot be loaded", async () => {
    const state = assessmentSessionReducer(initialAssessmentSession, {
      type: 'START', assessment: satPracticeAssessment, attemptId: crypto.randomUUID(),
      startedAt: '2026-09-02T10:00:00.000Z', nowMs: Date.parse('2026-09-02T10:00:00.000Z'),
    });
    await drafts.saveAssessment(state);
    const before = await database.sql`SELECT * FROM practice_drafts`;
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
    expect(await database.sql`SELECT * FROM practice_drafts`).toEqual(before);
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
      const pending = deferred<void>();
      let saving!: Promise<unknown>;
      await act(async () => {
        if (section === "writing") {
          repositories.ielts.saveWritingAttempt.mockImplementationOnce(async submission => { await pending.promise; return submission; });
          saving = native.commands.submitWriting();
        } else if (section === "reading") {
          repositories.ielts.saveObjectiveAttempt.mockImplementationOnce(async submission => { await pending.promise; return submission; });
          saving = native.commands.submitObjective("reading");
        } else {
          repositories.ielts.saveSpeakingAttempt.mockImplementationOnce(async submission => { await pending.promise; return { ...submission, responses: [] }; });
          saving = native.commands.submitSpeaking({
            contentKey: "speaking",
            startedAt: new Date().toISOString(),
            recordings: [],
          });
        }
      });
      await act(async () => native.commands.goHome());
      await act(async () => native.commands.start("section", section));
      const newId = native.state.attemptId;
      expect(newId).not.toBe(oldId);
      await act(async () => {
        pending.resolve();
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
