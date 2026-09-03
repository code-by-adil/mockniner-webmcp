import { builtInAssessments } from "@/content/builtInAssessments";
import {
  assessmentEvaluationInputSchema,
  getAssessmentEvaluationStatus,
  gradeAssessment,
  parseAssessmentAuthoringPackage,
  validateAssessmentEvaluation,
  type AssessmentEvaluation,
  type AssessmentEvaluationInput,
  type AssessmentHistoryEntry,
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
  openAttempt: (attemptId: string) => Promise<void>;
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
  setHistory: (
    update: (current: AssessmentHistoryEntry[]) => AssessmentHistoryEntry[],
  ) => void;
  getRepository: () => Promise<AssessmentRepository>;
  flushDrafts?: () => Promise<void>;
};

export function createAssessmentCommands({
  getState,
  getAssessments,
  dispatch,
  setAssessments,
  setHistory,
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
        setHistory((current) =>
          [
            {
              attemptId: submission.attemptId,
              packageId: submission.packageId,
              title: submission.package.title,
              rawScore: submission.result.rawScore,
              maximumScore: submission.result.maximumScore,
              evaluationStatus: getAssessmentEvaluationStatus(
                submission.result,
              ),
              submittedAt: submission.submittedAt,
            },
            ...current.filter(
              (attempt) => attempt.attemptId !== submission.attemptId,
            ),
          ].slice(0, 10),
        );
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
    async openAttempt(attemptId) {
      const stored = await (await getRepository()).readAttempt(attemptId);
      if (!stored)
        throw new ApplicationError(
          "ASSESSMENT_SUBMISSION_NOT_FOUND",
          `Assessment attempt ${attemptId} was not found.`,
        );
      dispatch({
        type: "OPEN_SUBMISSION",
        submission: stored.submission,
        evaluation: stored.evaluation,
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
      if (stored.evaluation)
        throw new ApplicationError(
          "EVALUATION_EXISTS",
          `Assessment attempt ${parsed.attemptId} already has an evaluation.`,
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
      try {
        validateAssessmentEvaluation(stored.submission, parsed);
      } catch (error) {
        if (error instanceof Error)
          throw new ApplicationError(
            "EVALUATION_CONTRACT_MISMATCH",
            error.message,
            true,
          );
        throw error;
      }
      const evaluation = { ...parsed, evaluatedAt: new Date().toISOString() };
      await repository.saveEvaluation(evaluation);
      setHistory((current) =>
        current.map((attempt) =>
          attempt.attemptId === evaluation.attemptId
            ? { ...attempt, evaluationStatus: "evaluated" }
            : attempt,
        ),
      );
      dispatch({ type: "ATTACH_EVALUATION", evaluation });
      return evaluation;
    },
  };
}
