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
import { locateIeltsReview, reviewLocationSchema, type ReviewLocation } from '@/domain/reviewLocation';
import { objectiveExplanationInputSchema, type ObjectiveExplanationInput, type ObjectiveExplanation } from '@/domain/objectiveExplanation';
import { resolveWritingEvaluation } from "@/domain/writingAnnotations";
import { getIeltsDrafts, sessionReducer } from "@/domain/session";
import { defaultSpeakingPlan, speakingPlanSchema, type SpeakingPlan } from '@/domain/speakingPlan';

type CommandDependencies = {
  getState: () => IeltsSession;
  dispatch: (action: SessionAction) => void;
  publishSession: (session: IeltsSession, content?: ActiveContentDocuments) => void;
  persistSession: (session: IeltsSession, content?: ActiveContentDocuments, removedContentKey?: string) => void | Promise<void>;
  flushDrafts?: () => Promise<void>;
  now?: () => Date;
  getRepository: () => Promise<AttemptReader & AttemptWriter>;
  getContent: () => ActiveContentDocuments;
  setContent: (documents: ActiveContentDocuments) => void;
  getContentStore: () => Promise<ContentStore>;
};

export type IeltsCommands = {
  deleteContent: (contentKey: string) => Promise<void>;
  discardDraft: (attemptId: string) => void | Promise<void>;
  start: (mode: IeltsMode, section: SectionKey) => void | Promise<void>;
  resume: (attemptId?: string) => void | Promise<void>;
  configureSpeakingPlan: (plan: SpeakingPlan) => void | Promise<void>;
  goHome: () => void | Promise<void>;
  continueExam: () => void | Promise<void>;
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
    location?: ReviewLocation,
    options?: { signal?: AbortSignal; beforeOpen?: () => void | Promise<void> },
  ) => Promise<void>;
  setReviewLocation: (location: ReviewLocation) => void;
  saveObjectiveExplanation: (input: ObjectiveExplanationInput) => Promise<ObjectiveExplanation>;
  closeReview: () => void;
  reset: () => void | Promise<void>;
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
  publishSession,
  persistSession,
  flushDrafts = async () => {},
  now = () => new Date(),
  getRepository,
  getContent,
  setContent,
  getContentStore,
}: CommandDependencies): IeltsCommands {
  let changingPractice = false;
  function changePractice<T>(operation: () => T | Promise<T>): T | Promise<T> {
    if (changingPractice) {
      throw new ApplicationError('PRACTICE_CHANGE_BUSY', 'Another practice change is in progress. Wait for it to finish, then try again.', true);
    }
    changingPractice = true;
    try {
      const result = operation();
      if (result instanceof Promise) return result.finally(() => { changingPractice = false; });
      changingPractice = false;
      return result;
    } catch (error) {
      changingPractice = false;
      throw error;
    }
  }
  const saveFailure = (cause: unknown) => new ApplicationError(
    'DRAFT_SAVE_FAILED',
    cause instanceof Error ? `Could not save the practice draft: ${cause.message}` : 'Could not save the practice draft.',
    true,
  );
  const commit = (action: SessionAction, content?: ActiveContentDocuments, removedContentKey?: string): void | Promise<void> => {
    const before = getState();
    const next = sessionReducer(before, action);
    try {
      const saved = persistSession(next, content, removedContentKey);
      if (saved) return saved.then(() => {
        // Answer edits remain available while saving. Save their latest state
        // before leaving; never publish an older snapshot over those edits.
        if (getState() !== before) return commit(action, content, removedContentKey);
        publishSession(next, content);
      }).catch(cause => { throw cause instanceof ApplicationError ? cause : saveFailure(cause); });
      publishSession(next, content);
    } catch (cause) { throw saveFailure(cause); }
  };
  const openReview = (review: IeltsReview) => {
    dispatch({ type: "OPEN_REVIEW", review });
  };

  const openStoredAttempt = async (
    attemptId: string,
    section: "listening" | "reading" | "writing" | "speaking",
    returnTo: "home" | "result",
    location?: ReviewLocation,
    options?: { signal?: AbortSignal; beforeOpen?: () => void | Promise<void> },
  ): Promise<void> => {
    const reader = await getRepository();
    const signal = options?.signal;
    signal?.throwIfAborted();
    const showReview = async (review: IeltsReview) => {
      const selected = location ? locateIeltsReview(review, reviewLocationSchema.parse(location)) : review;
      signal?.throwIfAborted();
      await options?.beforeOpen?.();
      signal?.throwIfAborted();
      openReview(selected);
    };
    if (section === 'speaking') {
      const stored = await reader.readSpeakingAttempt(attemptId);
      if (!stored) throw new ApplicationError('ATTEMPT_NOT_FOUND', `Speaking attempt ${attemptId} was not found.`, true);
      await showReview({ kind: 'speaking', section, submission: stored.submission, evaluation: stored.evaluation, part: 1, returnTo });
      return;
    }
    if (section === "writing") {
      const stored = await reader.readWritingAttempt(attemptId);
      if (!stored) {
        throw new ApplicationError('ATTEMPT_NOT_FOUND', `Writing attempt ${attemptId} was not found.`, true);
      }
      await showReview({
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
    await showReview({
      kind: "objective",
      explanations: await reader.readObjectiveExplanations(attemptId),
      section,
      submission,
      document,
      part: 1,
      returnTo,
    });
  };

  return {
    setReviewLocation(location) {
      const state = getState();
      if (state.view !== 'review' || !state.review) throw new ApplicationError('NO_VISIBLE_REVIEW', 'Open a submitted review first.', true);
      openReview(locateIeltsReview(state.review, reviewLocationSchema.parse(location)));
    },
    async saveObjectiveExplanation(input) {
      const parsed = objectiveExplanationInputSchema.parse(input);
      const review = getState().review;
      if (getState().view !== 'review' || review?.kind !== 'objective' || review.section !== parsed.section || review.submission.attemptId !== parsed.attemptId) {
        throw new ApplicationError('ATTEMPT_NOT_CURRENT', 'Open this submitted Reading/Listening review before saving an explanation.', true);
      }
      const target = locateIeltsReview(review, { questionId: parsed.questionId });
      const explanation = await (await getRepository()).saveObjectiveExplanation(parsed);
      dispatch({ type: 'SAVE_OBJECTIVE_EXPLANATION', explanation, part: target.part });
      return explanation;
    },
    start(mode, requestedSection) {
      const section = mode === "full" ? "listening" : requestedSection;
      return changePractice(() => commit({
        type: "START",
        mode,
        section,
        contentKeys: Object.fromEntries(Object.entries(getContent()).filter(([key]) => mode === 'full' || key === section).map(([key, document]) => [key, document.contentKey])),
        speakingPlan: mode === 'full' || section === 'speaking' ? defaultSpeakingPlan : undefined,
        startedAt: now().toISOString(),
        attemptId: crypto.randomUUID(),
      }));
    },
    async deleteContent(contentKey) {
      await changePractice(async () => {
        if (getState().view !== 'home') throw new ApplicationError('LIBRARY_REQUIRED', 'Open the library before deleting a saved test.', true);
        const store = await getContentStore();
        const library = await store.loadLibrary();
        const document = library.find(item => item.contentKey === contentKey);
        if (!document || document.source !== 'agent') throw new ApplicationError('PRACTICE_NOT_DELETABLE', 'Only agent-created saved IELTS tests can be deleted.', true);
        const fallback = library.find(item => item.section === document.section && item.contentKey !== contentKey);
        if (!fallback) throw new ApplicationError('CONTENT_NOT_FOUND', 'The default practice could not be loaded. Try reloading the library.', true);
        const content = getContent()[document.section].contentKey === contentKey ? replaceActiveContent(getContent(), fallback) : getContent();
        await commit({ type: 'DELETE_CONTENT', contentKey }, content, contentKey);
      });
    },
    discardDraft(attemptId) {
      return changePractice(() => {
        if (getState().view !== 'home') throw new ApplicationError('LIBRARY_REQUIRED', 'Open the library before deleting an unfinished test.', true);
        if (!getIeltsDrafts(getState()).some(draft => draft.attemptId === attemptId)) throw new ApplicationError('RESUMABLE_ATTEMPT_NOT_FOUND', 'This unfinished test no longer exists.', true);
        return commit({ type: 'DISCARD_DRAFT', attemptId });
      });
    },
    resume(targetAttemptId) {
      return changePractice(async () => {
        const target = getIeltsDrafts(getState()).find(draft => draft.attemptId === (targetAttemptId ?? getState().attemptId));
        if (!target) throw new ApplicationError('RESUMABLE_ATTEMPT_NOT_FOUND', 'This unfinished test no longer exists.', true);
        let documents = getContent();
        const keys = Object.entries(target.contentKeys ?? {});
        if (keys.some(([section, key]) => documents[section as keyof ActiveContentDocuments].contentKey !== key)) {
          const store = await getContentStore();
          for (const [section, key] of keys) {
            const document = await store.loadByKey(key);
            if (!document || document.section !== section) throw new ApplicationError('CONTENT_NOT_FOUND', 'The original questions could not be loaded. Your unfinished test has been kept.', true);
            documents = replaceActiveContent(documents, document);
          }
        }
        await commit({
          type: "RESUME",
          targetAttemptId: target.attemptId!,
          startedAt: now().toISOString(),
          attemptId: crypto.randomUUID(),
        }, documents);
      });
    },
    goHome() {
      return changePractice(() => commit({ type: "GO_HOME" }));
    },
    configureSpeakingPlan(input) {
      requireActiveSection(getState(), 'speaking');
      return changePractice(() => commit({ type: 'SET_SPEAKING_PLAN', plan: speakingPlanSchema.parse(input) }));
    },
    continueExam() {
      return changePractice(() => commit({
        type: "CONTINUE",
        startedAt: now().toISOString(),
        attemptId: crypto.randomUUID(),
      }));
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
      if (changingPractice) return;
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
      if (!changingPractice) dispatch({ type: "TICK", section });
    },
    async installContent(input) {
      return changePractice(async () => {
        const document = parsePracticeContentDocument(input);
        const store = await getContentStore();
        // Persist the old draft against its own questions before activating a new set.
        if (getState().view !== 'home') await commit({ type: 'GO_HOME' });
        await flushDrafts();
        await store.saveAndActivate(document);
        setContent(replaceActiveContent(getContent(), document));
        return document;
      });
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
      if (
        !(state.view === 'review' && state.review?.kind === 'writing' && state.review.submission.attemptId === parsed.attemptId) &&
        !(state.writingSubmission?.attemptId === parsed.attemptId && ["transition", "result"].includes(state.view))
      ) {
        throw new ApplicationError(
          "ATTEMPT_NOT_CURRENT",
          `Writing attempt ${parsed.attemptId} is not the current submitted attempt.`,
        );
      }
      const { expectedRevision, ...feedback } = parsed;
      const candidate = resolveWritingEvaluation(
        stored.submission,
        { ...feedback, evaluatedAt: now().toISOString() },
        true,
      );
      const evaluation = await repository.saveWritingEvaluation(candidate, expectedRevision);
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
      return changePractice(async () => {
        const state = getState();
        if (section === "listening" || section === "reading") {
          const submission = state.objectiveSubmissions[section];
          if (!submission) return;
          await openStoredAttempt(submission.attemptId, section, "result");
          return;
        }
        if (section === "writing") {
          if (!state.writingSubmission) return;
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
      });
    },
    async openAttempt(attemptId, section, location, options) {
      await changePractice(() => openStoredAttempt(attemptId, section, "home", location, options));
    },
    closeReview() {
      changePractice(() => dispatch({ type: "CLOSE_REVIEW" }));
    },
    reset() {
      return changePractice(() => commit({ type: "RESET" }));
    },
  };
}
