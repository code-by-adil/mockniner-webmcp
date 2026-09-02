import { gradeObjectiveDocument } from "@/domain/objectiveScoring";
import { countWords } from "@/shared/text";
import {
  parsePracticeContentDocument,
  replaceActiveContent,
  requireActiveObjectiveContent,
  type ActiveContentDocuments,
  type PracticeContentDocument,
} from "@/domain/contentDocument";
import {
  writingEvaluationInputSchema,
  type WritingEvaluationInput,
} from "@/domain/writingEvaluation";
import {
  speakingEvaluationInputSchema,
  type SpeakingEvaluationInput,
} from "@/domain/speakingEvaluation";
import type {
  IeltsMode,
  IeltsReview,
  IeltsSession,
  ListeningPlaybackState,
  SessionAction,
} from "@/domain/session";
import type {
  ObjectiveSubmission,
  SectionKey,
  SpeakingSubmission,
  SpeakingEvaluation,
  WritingEvaluation,
  WritingSubmission,
  WritingSubmittedTask,
} from "@/domain/types";
import type {
  AttemptWriter,
  CompleteSpeakingAttemptInput,
} from "./attemptWriter";
import type { ContentStore } from "./contentStore";
import type { AttemptReader } from "./attemptReader";
import { ApplicationError } from "@/domain/errors";
import { resolveWritingEvaluation } from "@/domain/writingAnnotations";
import { findContentBlockingDraft, getIeltsDrafts, sessionReducer } from "@/domain/session";
import { defaultSpeakingPlan, speakingPlanSchema, type SpeakingPlan } from '@/domain/speakingPlan';

type CommandDependencies = {
  getState: () => IeltsSession;
  dispatch: (action: SessionAction) => void;
  persistSession?: (session: IeltsSession) => void | Promise<void>;
  flushDrafts?: () => Promise<void>;
  now?: () => Date;
  getRepository: () => Promise<AttemptReader & AttemptWriter>;
  getContent: () => ActiveContentDocuments;
  setContent: (documents: ActiveContentDocuments) => void;
  getContentStore: () => Promise<ContentStore>;
};

export type IeltsCommands = {
  start: (mode: IeltsMode, section: SectionKey) => void | Promise<void>;
  resume: (attemptId?: string) => void | Promise<void>;
  configureSpeakingPlan: (plan: SpeakingPlan) => void | Promise<void>;
  goHome: () => void | Promise<void>;
  continueExam: () => void;
  setPart: (section: SectionKey, part: number) => void;
  setObjectiveAnswer: (
    section: "listening" | "reading",
    questionId: number,
    value: string,
  ) => void;
  setWritingDraft: (task: 1 | 2, value: string) => void;
  setListeningPlayback: (playback: ListeningPlaybackState) => void;
  tick: (section: SectionKey) => void;
  installContent: (input: unknown) => Promise<PracticeContentDocument>;
  submitObjective: (
    section: "listening" | "reading",
  ) => Promise<ObjectiveSubmission>;
  submitWriting: () => Promise<WritingSubmission>;
  attachWritingEvaluation: (
    input: WritingEvaluationInput,
  ) => Promise<WritingEvaluation>;
  submitSpeaking: (
    input: CompleteSpeakingAttemptInput,
  ) => Promise<SpeakingSubmission>;
  attachSpeakingEvaluation: (
    input: SpeakingEvaluationInput,
  ) => Promise<SpeakingEvaluation>;
  openReview: (section: SectionKey) => Promise<void>;
  openAttempt: (
    attemptId: string,
    section: "listening" | "reading" | "writing" | "speaking",
  ) => Promise<void>;
  closeReview: () => void;
  reset: () => void;
};

function requireActiveSection(
  state: IeltsSession,
  section: SectionKey,
): asserts state is IeltsSession & { attemptId: string } {
  if (
    !state.attemptId ||
    state.view !== "exam" ||
    state.currentSection !== section
  ) {
    throw new Error(`${section} is not the active exam section.`);
  }
}

function requireVisibleSection(state: IeltsSession, section: SectionKey): void {
  const visibleSection =
    state.view === "review" ? state.review?.section : state.currentSection;
  if (
    (state.view !== "exam" && state.view !== "review") ||
    visibleSection !== section
  ) {
    throw new Error(`${section} is not the visible exam section.`);
  }
}

export function createIeltsCommands({
  getState,
  dispatch,
  persistSession = () => {},
  flushDrafts = async () => {},
  now = () => new Date(),
  getRepository,
  getContent,
  setContent,
  getContentStore,
}: CommandDependencies): IeltsCommands {
  // Metadata-changing commands must be durable before tools report success.
  const commit = (action: SessionAction) => {
    const next = sessionReducer(getState(), action);
    try {
      const saved = persistSession(next);
      if (saved) return saved.then(() => { dispatch(action); return flushDrafts(); });
    }
    catch (cause) { throw new ApplicationError('DRAFT_SAVE_FAILED', cause instanceof Error ? `Could not save the practice draft: ${cause.message}` : 'Could not save the practice draft.', true); }
    dispatch(action);
  };
  const openReview = (review: IeltsReview) => {
    dispatch({ type: "OPEN_REVIEW", review });
  };

  const openStoredAttempt = async (
    attemptId: string,
    section: "listening" | "reading" | "writing" | "speaking",
    returnTo: "home" | "result",
  ): Promise<void> => {
    const reader = await getRepository();
    if (section === 'speaking') {
      const stored = await reader.readSpeakingAttempt(attemptId);
      if (!stored) throw new ApplicationError('ATTEMPT_NOT_FOUND', `Speaking attempt ${attemptId} was not found.`, true);
      openReview({ kind: 'speaking', section, submission: stored.submission, evaluation: stored.evaluation, part: 1, returnTo });
      return;
    }
    if (section === "writing") {
      const stored = await reader.readWritingAttempt(attemptId);
      if (!stored) {
        throw new ApplicationError('ATTEMPT_NOT_FOUND', `Writing attempt ${attemptId} was not found.`, true);
      }
      openReview({
        kind: "writing",
        section,
        submission: stored.submission,
        evaluation: stored.evaluation,
        part: 1,
        returnTo,
      });
      return;
    }

    const submission = await reader.readObjectiveAttempt(attemptId);
    if (!submission) {
      throw new ApplicationError('ATTEMPT_NOT_FOUND', `${section} attempt ${attemptId} was not found.`, true);
    }
    if (submission.section !== section) {
      throw new ApplicationError('ATTEMPT_KIND_MISMATCH',
        `Attempt ${attemptId} belongs to ${submission.section}, not ${section}.`,
      );
    }
    const activeDocument = getContent()[section];
    const document =
      activeDocument.contentKey === submission.contentKey
        ? activeDocument
        : await (await getContentStore()).loadByKey(submission.contentKey);
    if (!document) {
      throw new Error(
        `Content ${submission.contentKey} for attempt ${attemptId} was not found.`,
      );
    }
    if (document.section !== section) {
      throw new Error(
        `Content ${submission.contentKey} belongs to ${document.section}, not ${section}.`,
      );
    }
    openReview({
      kind: "objective",
      section,
      submission,
      document,
      part: 1,
      returnTo,
    });
  };

  return {
    start(mode, requestedSection) {
      const section = mode === "full" ? "listening" : requestedSection;
      return commit({
        type: "START",
        mode,
        section,
        contentKeys: Object.fromEntries(Object.entries(getContent()).filter(([key]) => mode === 'full' || key === section).map(([key, document]) => [key, document.contentKey])),
        speakingPlan: mode === 'full' || section === 'speaking' ? defaultSpeakingPlan : undefined,
        startedAt: now().toISOString(),
        attemptId: crypto.randomUUID(),
      });
    },
    resume(targetAttemptId) {
      return commit({
        type: "RESUME",
        targetAttemptId,
        startedAt: now().toISOString(),
        attemptId: crypto.randomUUID(),
      });
    },
    goHome() {
      return commit({ type: "GO_HOME" });
    },
    configureSpeakingPlan(input) {
      requireActiveSection(getState(), 'speaking');
      return commit({ type: 'SET_SPEAKING_PLAN', plan: speakingPlanSchema.parse(input) });
    },
    continueExam() {
      dispatch({
        type: "CONTINUE",
        startedAt: now().toISOString(),
        attemptId: crypto.randomUUID(),
      });
    },
    setPart(section, part) {
      requireVisibleSection(getState(), section);
      dispatch({
        type: "SET_PART",
        section,
        part: Math.max(1, Math.trunc(part)),
      });
    },
    setObjectiveAnswer(section, questionId, value) {
      requireActiveSection(getState(), section);
      dispatch({ type: "SET_ANSWER", section, questionId, value });
    },
    setWritingDraft(task, value) {
      requireActiveSection(getState(), "writing");
      dispatch({ type: "SET_WRITING", task, value });
    },
    setListeningPlayback(playback) {
      requireActiveSection(getState(), "listening");
      dispatch({
        type: "SET_LISTENING_PLAYBACK",
        playback: {
          currentTimeSec: Math.max(0, playback.currentTimeSec),
          volume: Math.min(1, Math.max(0, playback.volume)),
        },
      });
    },
    tick(section) {
      dispatch({ type: "TICK", section });
    },
    async installContent(input) {
      const document = parsePracticeContentDocument(input);
      const assertContentUnlocked = () => {
        if (findContentBlockingDraft(getState(), document.section))
          throw new ApplicationError(
            "ACTIVE_ATTEMPT",
            "Finish the unfinished practice using this section before replacing its content. Other section drafts are preserved.",
            true,
          );
      };
      assertContentUnlocked();
      const store = await getContentStore();
      assertContentUnlocked();
      await store.saveAndActivate(document);
      setContent(replaceActiveContent(getContent(), document));
      await commit({ type: getIeltsDrafts(getState()).length ? 'GO_HOME' : 'RESET' });
      return document;
    },
    async submitObjective(section) {
      await flushDrafts();
      const state = getState();
      requireActiveSection(state, section);
      const document = requireActiveObjectiveContent(getContent(), section);
      const { contentKey } = document;
      const result = gradeObjectiveDocument(document, state.answers[section]);
      const submittedAt = now().toISOString();
      const submission = await (
        await getRepository()
      ).saveObjectiveAttempt({
        attemptId: state.attemptId,
        section,
        contentKey,
        answers: state.answers[section],
        result,
        startedAt:
          state.startedAtBySection[section] ?? state.startedAt ?? submittedAt,
        submittedAt,
      });
      dispatch({ type: "COMPLETE_OBJECTIVE", submission });
      return submission;
    },
    async submitWriting() {
      await flushDrafts();
      const state = getState();
      requireActiveSection(state, "writing");
      const document = getContent().writing;
      const submittedAt = now().toISOString();
      const submittedTasks = document.tasks.map((task) => {
        const response = state.writingDrafts[task.id];
        return { task, response, wordCount: countWords(response) };
      }) as [WritingSubmittedTask, WritingSubmittedTask];
      const submission = await (
        await getRepository()
      ).saveWritingAttempt({
        attemptId: state.attemptId,
        contentKey: document.contentKey,
        tasks: submittedTasks,
        startedAt:
          state.startedAtBySection.writing ?? state.startedAt ?? submittedAt,
        submittedAt,
      });
      dispatch({ type: "COMPLETE_WRITING", submission });
      return submission;
    },
    async attachWritingEvaluation(input) {
      const parsed = writingEvaluationInputSchema.parse(input);
      const repository = await getRepository();
      const stored = await repository.readWritingAttempt(parsed.attemptId);
      const state = getState();
      if (!stored)
        throw new ApplicationError(
          "WRITING_SUBMISSION_NOT_FOUND",
          `Writing attempt ${parsed.attemptId} was not found.`,
        );
      if (stored.evaluation)
        throw new ApplicationError(
          "EVALUATION_EXISTS",
          `Writing attempt ${parsed.attemptId} already has an evaluation.`,
        );
      if (
        !(state.view === 'review' && state.review?.kind === 'writing' && state.review.submission.attemptId === parsed.attemptId) &&
        !(state.writingSubmission?.attemptId === parsed.attemptId && ["transition", "result"].includes(state.view))
      ) {
        throw new ApplicationError(
          "ATTEMPT_NOT_CURRENT",
          `Writing attempt ${parsed.attemptId} is not the current submitted attempt.`,
        );
      }
      const evaluation = resolveWritingEvaluation(
        stored.submission,
        { ...parsed, evaluatedAt: now().toISOString() },
        true,
      );
      await repository.saveWritingEvaluation(evaluation);
      dispatch({ type: "ATTACH_WRITING_EVALUATION", evaluation });
      return evaluation;
    },
    async submitSpeaking(input) {
      await flushDrafts();
      const activeState = getState();
      requireActiveSection(activeState, "speaking");
      const submission = await (
        await getRepository()
      ).saveSpeakingAttempt({
        ...input,
        attemptId: activeState.attemptId,
        submittedAt: now().toISOString(),
      });
      dispatch({ type: "COMPLETE_SPEAKING", submission });
      return submission;
    },
    async attachSpeakingEvaluation(input) {
      const parsed = speakingEvaluationInputSchema.parse(input);
      const repository = await getRepository();
      const stored = await repository.readSpeakingAttempt(parsed.attemptId);
      const state = getState();
      if (!stored)
        throw new ApplicationError(
          "SPEAKING_SUBMISSION_NOT_FOUND",
          `Speaking attempt ${parsed.attemptId} was not found.`,
        );
      if (stored.evaluation)
        throw new ApplicationError(
          "EVALUATION_EXISTS",
          `Speaking attempt ${parsed.attemptId} already has an evaluation.`,
        );
      if (
        !(state.view === 'review' && state.review?.kind === 'speaking' && state.review.submission.attemptId === parsed.attemptId) &&
        !(state.speakingSubmission?.attemptId === parsed.attemptId && ["transition", "result"].includes(state.view))
      ) {
        throw new ApplicationError(
          "ATTEMPT_NOT_CURRENT",
          `Speaking attempt ${parsed.attemptId} is not the current submitted attempt.`,
        );
      }
      const evaluation = { ...parsed, evaluatedAt: now().toISOString() };
      if (parsed.status !== 'insufficient_evidence' && !stored.submission.responses.some(response => response.status === 'answered' && response.transcript.trim())) {
        throw new ApplicationError('INSUFFICIENT_SPEAKING_EVIDENCE', 'No transcript evidence was submitted. Use status insufficient_evidence with feedback and omit all bands.', true);
      }
      await repository.saveSpeakingEvaluation(evaluation);
      dispatch({ type: "ATTACH_SPEAKING_EVALUATION", evaluation });
      return evaluation;
    },
    async openReview(section) {
      const state = getState();
      if (section === "listening" || section === "reading") {
        const submission = state.objectiveSubmissions[section];
        if (!submission) return;
        await openStoredAttempt(submission.attemptId, section, "result");
        return;
      }
      if (section === "writing") {
        if (!state.writingSubmission || !state.writingEvaluation) return;
        await openStoredAttempt(
          state.writingSubmission.attemptId,
          section,
          "result",
        );
        return;
      }
      if (!state.speakingSubmission || !state.speakingEvaluation) return;
      openReview({
        kind: "speaking",
        section,
        submission: state.speakingSubmission,
        evaluation: state.speakingEvaluation,
        part: 1,
        returnTo: "result",
      });
    },
    async openAttempt(attemptId, section) {
      await openStoredAttempt(attemptId, section, "home");
    },
    closeReview() {
      dispatch({ type: "CLOSE_REVIEW" });
    },
    reset() {
      dispatch({ type: "RESET" });
    },
  };
}
