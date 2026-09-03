import { builtInAssessments } from "@/content/builtInAssessments";
import {
  assessmentEvaluationInputSchema,
  gradeAssessment,
  parseAssessmentAuthoringPackage,
  prepareAssessmentEvaluation,
  type AssessmentEvaluation,
  type AssessmentEvaluationInput,
  type AssessmentPackage,
  type AssessmentResponse,
  type AssessmentSubmission,
} from "@/domain/assessment";
import {
  getDraftAssessmentPackageId,
  type AssessmentSession,
  type AssessmentSessionAction,
} from "@/domain/assessmentSession";
import { ApplicationError } from "@/domain/errors";
import { resolveAssessmentReview } from '@/domain/assessmentReview';
import type { AssessmentRepository } from "./assessmentRepository";

export type AssessmentApplicationCommands = {
  installAssessment: (input: unknown) => Promise<AssessmentPackage>;
  start: (packageId: string) => void;
  resume: () => void;
  restart: () => void;
  discard: () => void;
  deleteAssessment: (packageId: string) => Promise<void>;
  goHome: () => void;
  setResponse: (itemId: string, response: AssessmentResponse) => void;
  toggleMark: (itemId: string) => void;
  toggleElimination: (itemId: string, optionId: string) => void;
  setTimerHidden: (hidden: boolean) => void;
  setItem: (itemId: string) => void;
  tick: () => void;
  advanceItem: () => void;
  completePart: (partId: string) => void;
  expirePart: (partId: string) => void;
  submit: () => Promise<AssessmentSubmission>;
  openAttempt: (attemptId: string, itemId?: string, options?: { signal?: AbortSignal; beforeOpen?: () => void | Promise<void> }) => Promise<void>;
  setReview: (review: import('@/domain/assessmentReview').AssessmentReviewSelection | null) => void;
  attachEvaluation: (
    input: AssessmentEvaluationInput,
  ) => Promise<AssessmentEvaluation>;
};

export function mergeAssessmentPackages(
  installed: AssessmentPackage[],
): AssessmentPackage[] {
  const packages = new Map(builtInAssessments.map(assessment => [assessment.packageId, assessment]));
  installed.forEach((assessment) => {
    if (!builtInAssessments.some(builtIn => builtIn.packageId === assessment.packageId))
      packages.set(assessment.packageId, assessment);
  });
  return [...packages.values()];
}

type Dependencies = {
  getState: () => AssessmentSession;
  getAssessments: () => AssessmentPackage[];
  dispatch: (action: AssessmentSessionAction) => void;
  setAssessments: (
    update: (current: AssessmentPackage[]) => AssessmentPackage[],
  ) => void;
  getRepository: () => Promise<AssessmentRepository>;
  flushDrafts?: () => Promise<void>;
};

export function createAssessmentCommands({
  getState,
  getAssessments,
  dispatch,
  setAssessments,
  getRepository,
  flushDrafts = async () => {},
}: Dependencies): AssessmentApplicationCommands {
  const submissions = new Map<string, Promise<AssessmentSubmission>>();
  const currentAssessment = () => {
    const assessment = getState().packageSnapshot ?? getAssessments().find(
      (candidate) => candidate.packageId === getState().packageId,
    );
    if (!assessment)
      throw new Error("The current assessment is not installed.");
    return assessment;
  };
  const start = (assessment: AssessmentPackage) => {
    const now = new Date();
    dispatch({
      type: "START",
      assessment,
      attemptId: crypto.randomUUID(),
      startedAt: now.toISOString(),
      nowMs: now.getTime(),
    });
  };
  return {
    async installAssessment(input) {
      const assessment: AssessmentPackage = {
        ...parseAssessmentAuthoringPackage(input),
        source: "agent",
      };
      if (builtInAssessments.some(builtIn => builtIn.packageId === assessment.packageId))
        throw new ApplicationError(
          "ASSESSMENT_INSTALL_CONFLICT",
          `Assessment package ID ${assessment.packageId} is reserved for built-in content.`,
          true,
        );
      if (getDraftAssessmentPackageId(getState()) === assessment.packageId) {
        throw new ApplicationError(
          "ASSESSMENT_INSTALL_CONFLICT",
          `Assessment ${assessment.packageId} cannot be replaced while its attempt is in progress. Finish or discard it first.`,
          true,
        );
      }
      await (await getRepository()).savePackage(assessment);
      setAssessments((current) =>
        mergeAssessmentPackages([
          ...current.filter((item) => item.packageId !== assessment.packageId),
          assessment,
        ]),
      );
      return assessment;
    },
    start(packageId) {
      const assessment = getAssessments().find(
        (candidate) => candidate.packageId === packageId,
      );
      if (!assessment)
        throw new Error(`Assessment ${packageId} is not installed.`);
      const draft = getDraftAssessmentPackageId(getState());
      if (draft)
        throw new ApplicationError(
          "ACTIVE_ATTEMPT",
          `An unfinished attempt for ${draft} is in progress. Resume, restart, or discard it first.`,
          true,
        );
      start(assessment);
    },
    resume() {
      dispatch({
        type: "RESUME",
        assessment: currentAssessment(),
        nowMs: Date.now(),
      });
    },
    restart() {
      if (!getDraftAssessmentPackageId(getState()))
        throw new Error(
          "No unfinished assessment attempt is available to restart.",
        );
      start(currentAssessment());
    },
    discard() {
      dispatch({ type: "RESET" });
    },
    async deleteAssessment(packageId) {
      const assessment = getAssessments().find(
        (candidate) => candidate.packageId === packageId,
      );
      if (!assessment)
        throw new Error(`Assessment ${packageId} is not installed.`);
      if (assessment.source !== "agent")
        throw new Error(`Built-in assessment ${packageId} cannot be deleted.`);
      await (await getRepository()).deletePackage(packageId);
      setAssessments((current) =>
        current.filter((candidate) => candidate.packageId !== packageId),
      );
      if (getState().packageId === packageId) dispatch({ type: "RESET" });
    },
    goHome() {
      dispatch({ type: "GO_HOME" });
    },
    setResponse(itemId, response) {
      dispatch({ type: "SET_RESPONSE", itemId, response });
    },
    toggleMark(itemId) {
      dispatch({
        type: "TOGGLE_MARK",
        assessment: currentAssessment(),
        itemId,
      });
    },
    toggleElimination(itemId, optionId) {
      dispatch({
        type: "TOGGLE_ELIMINATION",
        assessment: currentAssessment(),
        itemId,
        optionId,
      });
    },
    setTimerHidden(hidden) {
      dispatch({ type: "SET_TIMER_HIDDEN", hidden });
    },
    setItem(itemId) {
      dispatch({ type: "SET_ITEM", assessment: currentAssessment(), itemId });
    },
    tick() {
      dispatch({ type: "TICK", nowMs: Date.now() });
    },
    advanceItem() {
      dispatch({ type: "ADVANCE_ITEM", assessment: currentAssessment() });
    },
    completePart(partId) {
      dispatch({
        type: "COMPLETE_PART",
        assessment: currentAssessment(),
        partId,
        nowMs: Date.now(),
      });
    },
    expirePart(partId) {
      dispatch({
        type: "EXPIRE_PART",
        assessment: currentAssessment(),
        partId,
        nowMs: Date.now(),
      });
    },
    async submit() {
      const state = getState();
      if (state.view === "result" && state.submission) return state.submission;
      if (state.view !== "assessment" || !state.attemptId || !state.startedAt)
        throw new Error("No assessment attempt is active.");
      const pending = submissions.get(state.attemptId);
      if (pending) return pending;
      const assessment = currentAssessment();
      const snapshot: AssessmentSubmission = {
        attemptId: state.attemptId,
        packageId: assessment.packageId,
        package: assessment,
        responses: state.responses,
        result: gradeAssessment(assessment, state.responses),
        startedAt: state.startedAt,
        submittedAt: new Date().toISOString(),
      };
      const saving = (async () => {
        await flushDrafts();
        const submission = await (await getRepository()).saveAttempt(snapshot);
        dispatch({ type: "COMPLETE", submission });
        return submission;
      })();
      submissions.set(state.attemptId, saving);
      try {
        return await saving;
      } finally {
        submissions.delete(state.attemptId);
      }
    },
    setReview(review) {
      const state = getState();
      if (state.view !== 'result' || !state.submission) throw new ApplicationError('NO_VISIBLE_REVIEW', 'Open a submitted assessment first.', true);
      dispatch({ type: 'SET_REVIEW', review: review ? resolveAssessmentReview(state.submission, review) : null });
    },
    async openAttempt(attemptId, itemId, options) {
      const stored = await (await getRepository()).readAttempt(attemptId);
      options?.signal?.throwIfAborted();
      if (!stored)
        throw new ApplicationError(
          "ASSESSMENT_SUBMISSION_NOT_FOUND",
          `Assessment attempt ${attemptId} was not found.`,
        );
      const review = itemId ? resolveAssessmentReview(stored.submission, { filter: 'all', itemId }) : undefined;
      await options?.beforeOpen?.();
      options?.signal?.throwIfAborted();
      dispatch({
        type: "OPEN_SUBMISSION",
        submission: stored.submission,
        evaluation: stored.evaluation,
        review,
      });
    },
    async attachEvaluation(input) {
      const parsed = assessmentEvaluationInputSchema.parse(input);
      const repository = await getRepository();
      const stored = await repository.readAttempt(parsed.attemptId);
      if (!stored)
        throw new ApplicationError(
          "ASSESSMENT_SUBMISSION_NOT_FOUND",
          `Assessment attempt ${parsed.attemptId} was not found.`,
        );
      const state = getState();
      if (
        state.view !== "result" ||
        state.submission?.attemptId !== parsed.attemptId
      )
        throw new ApplicationError(
          "ATTEMPT_NOT_CURRENT",
          `Assessment attempt ${parsed.attemptId} is not the current visible submission.`,
        );
      let feedback: ReturnType<typeof prepareAssessmentEvaluation>;
      try {
        feedback = prepareAssessmentEvaluation(stored.submission, parsed);
      } catch (error) {
        if (error instanceof Error)
          throw new ApplicationError(
            "EVALUATION_CONTRACT_MISMATCH",
            error.message,
            true,
          );
        throw error;
      }
      const { expectedRevision } = parsed;
      const evaluation = await repository.saveEvaluation({ ...feedback, evaluatedAt: new Date().toISOString() }, expectedRevision);
      dispatch({ type: "ATTACH_EVALUATION", evaluation });
      return evaluation;
    },
  };
}
