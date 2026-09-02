import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { satPracticeAssessment } from "@/content/sat";
import {
  assessmentEvaluationInputSchema,
  compileAssessment,
  gradeAssessment,
  parseAssessmentAuthoringPackage,
  validateAssessmentEvaluation,
  type AssessmentEvaluation,
  type AssessmentEvaluationInput,
  type AssessmentHistoryEntry,
  type AssessmentPackage,
  type AssessmentPlan,
  type AssessmentResponse,
  type AssessmentSubmission,
} from "@/domain/assessment";
import {
  assessmentSessionReducer,
  loadAssessmentSession,
  saveAssessmentSession,
  type AssessmentSession,
} from "@/domain/assessmentSession";
import { reportWebHandledProductFailure } from "@/shared/observability/report-error";

export type AssessmentApplicationCommands = {
  installAssessment: (input: unknown) => Promise<AssessmentPackage>;
  start: (packageId: string) => void;
  resume: () => void;
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
  attachEvaluation: (input: AssessmentEvaluationInput) => Promise<AssessmentEvaluation>;
  reset: () => void;
};

function mergePackages(installed: AssessmentPackage[]): AssessmentPackage[] {
  const packages = new Map<string, AssessmentPackage>([[satPracticeAssessment.packageId, satPracticeAssessment]]);
  installed.forEach((assessment) => {
    if (assessment.packageId !== satPracticeAssessment.packageId) packages.set(assessment.packageId, assessment);
  });
  return [...packages.values()];
}

async function openAssessmentPersistence() {
  const [{ getLocalDatabase }, repository] = await Promise.all([
    import("@/infrastructure/database/client"),
    import("@/infrastructure/database/assessmentRepository"),
  ]);
  return { database: await getLocalDatabase(), repository };
}

export function useAssessmentApplication(): {
  state: AssessmentSession;
  assessments: AssessmentPackage[];
  currentAssessment: AssessmentPackage | null;
  currentPlan: AssessmentPlan | null;
  assessmentReady: boolean;
  history: AssessmentHistoryEntry[];
  commands: AssessmentApplicationCommands;
} {
  const [state, dispatch] = useReducer(assessmentSessionReducer, undefined, loadAssessmentSession);
  const [assessments, setAssessments] = useState<AssessmentPackage[]>([satPracticeAssessment]);
  const [assessmentReady, setAssessmentReady] = useState(false);
  const [history, setHistory] = useState<AssessmentHistoryEntry[]>([]);
  const submissionPromiseRef = useRef<Promise<AssessmentSubmission> | null>(null);

  useEffect(() => saveAssessmentSession(state), [state]);
  useEffect(() => {
    let cancelled = false;
    const reportInvalidAssessment = (error: Error, row: { kind: "package" | "attempt"; id: string }) => {
      reportWebHandledProductFailure(error, {
        feature: "assessment-catalog-row-load", rowKind: row.kind, rowId: row.id,
      });
    };
    void openAssessmentPersistence()
      .then(({ database, repository }) => Promise.all([
        repository.loadAssessmentPackages(database, reportInvalidAssessment),
        repository.readAssessmentHistory(database, 10, reportInvalidAssessment),
      ]))
      .then(([storedAssessments, storedHistory]) => {
        if (cancelled) return;
        setAssessments(mergePackages(storedAssessments));
        setHistory(storedHistory);
      })
      .catch((error) => reportWebHandledProductFailure(error, { feature: "assessment-catalog-load" }))
      .finally(() => { if (!cancelled) setAssessmentReady(true); });
    return () => { cancelled = true; };
  }, []);

  const currentAssessment = assessments.find((assessment) => assessment.packageId === state.packageId) ?? null;
  const currentPlan = useMemo(
    () => currentAssessment ? compileAssessment(currentAssessment) : null,
    [currentAssessment],
  );

  const commands = useMemo<AssessmentApplicationCommands>(() => ({
    async installAssessment(input) {
      const authoredAssessment = parseAssessmentAuthoringPackage(input);
      const assessment: AssessmentPackage = { ...authoredAssessment, source: "agent" };
      if (assessment.packageId === satPracticeAssessment.packageId) {
        throw new Error(`Assessment package ID ${assessment.packageId} is reserved for built-in content.`);
      }
      if (state.packageId === assessment.packageId && !state.submission) {
        throw new Error(`Assessment ${assessment.packageId} cannot be replaced while its attempt is in progress.`);
      }
      const { database, repository } = await openAssessmentPersistence();
      await repository.saveAssessmentPackage(database, assessment);
      setAssessments((current) => mergePackages([
        ...current.filter((candidate) => candidate.packageId !== assessment.packageId),
        assessment,
      ]));
      return assessment;
    },
    start(packageId) {
      const assessment = assessments.find((candidate) => candidate.packageId === packageId);
      if (!assessment) throw new Error(`Assessment ${packageId} is not installed.`);
      const now = new Date();
      dispatch({
        type: "START",
        plan: compileAssessment(assessment),
        attemptId: crypto.randomUUID(),
        startedAt: now.toISOString(),
        nowMs: now.getTime(),
      });
    },
    resume() {
      if (!currentPlan) throw new Error("The resumable assessment is not installed.");
      dispatch({ type: "RESUME", plan: currentPlan, nowMs: Date.now() });
    },
    goHome() { dispatch({ type: "GO_HOME" }); },
    setResponse(itemId, response) { dispatch({ type: "SET_RESPONSE", itemId, response }); },
    toggleMark(itemId) {
      if (!currentPlan) throw new Error("No assessment is active.");
      dispatch({ type: "TOGGLE_MARK", plan: currentPlan, itemId });
    },
    toggleElimination(itemId, optionId) {
      if (!currentPlan) throw new Error("No assessment is active.");
      dispatch({ type: "TOGGLE_ELIMINATION", plan: currentPlan, itemId, optionId });
    },
    setTimerHidden(hidden) { dispatch({ type: "SET_TIMER_HIDDEN", hidden }); },
    setItem(itemId) {
      if (!currentPlan) throw new Error("No assessment is active.");
      dispatch({ type: "SET_ITEM", plan: currentPlan, itemId });
    },
    tick() { dispatch({ type: "TICK", nowMs: Date.now() }); },
    advanceItem() {
      if (!currentPlan) throw new Error("No assessment is active.");
      dispatch({ type: "ADVANCE_ITEM", plan: currentPlan });
    },
    completePart(partId) {
      if (!currentPlan) throw new Error("No assessment is active.");
      dispatch({ type: "COMPLETE_PART", plan: currentPlan, partId, nowMs: Date.now() });
    },
    expirePart(partId) {
      if (!currentPlan) throw new Error("No assessment is active.");
      dispatch({ type: "EXPIRE_PART", plan: currentPlan, partId, nowMs: Date.now() });
    },
    async submit() {
      if (state.submission) return state.submission;
      if (submissionPromiseRef.current) return submissionPromiseRef.current;
      if (!currentAssessment || !state.attemptId || !state.startedAt) {
        throw new Error("No assessment attempt is active.");
      }
      const attemptId = state.attemptId;
      const startedAt = state.startedAt;
      const submissionPromise = (async () => {
        const submittedAt = new Date().toISOString();
        const result = gradeAssessment(currentAssessment, state.responses);
        const { database, repository } = await openAssessmentPersistence();
        const submission = await repository.saveAssessmentAttempt(database, {
          attemptId,
          assessment: currentAssessment,
          responses: state.responses,
          result,
          startedAt,
          submittedAt,
        });
        setHistory((current) => [{
          attemptId: submission.attemptId,
          packageId: submission.packageId,
          title: submission.package.title,
          rawScore: submission.result.rawScore,
          maximumScore: submission.result.maximumScore,
          awaitingEvaluationCount: submission.result.awaitingEvaluationCount,
          submittedAt: submission.submittedAt,
        }, ...current.filter((attempt) => attempt.attemptId !== submission.attemptId)].slice(0, 10));
        dispatch({ type: "COMPLETE", submission });
        return submission;
      })();
      submissionPromiseRef.current = submissionPromise;
      try {
        return await submissionPromise;
      } finally {
        submissionPromiseRef.current = null;
      }
    },
    async openAttempt(attemptId) {
      const { database, repository } = await openAssessmentPersistence();
      const stored = await repository.readAssessmentAttempt(database, attemptId);
      if (!stored) throw new Error(`Assessment attempt ${attemptId} was not found.`);
      dispatch({ type: "OPEN_SUBMISSION", submission: stored.submission, evaluation: stored.evaluation });
    },
    async attachEvaluation(input) {
      const parsed = assessmentEvaluationInputSchema.parse(input);
      const { database, repository } = await openAssessmentPersistence();
      const stored = await repository.readAssessmentAttempt(database, parsed.attemptId);
      if (!stored) throw new Error(`Assessment attempt ${parsed.attemptId} was not found.`);
      if (stored.evaluation) throw new Error(`Assessment attempt ${parsed.attemptId} already has an evaluation.`);
      if (state.view !== "result" || state.submission?.attemptId !== parsed.attemptId) {
        throw new Error(`Assessment attempt ${parsed.attemptId} is not the current visible submission.`);
      }
      validateAssessmentEvaluation(stored.submission, parsed);
      const evaluation: AssessmentEvaluation = { ...parsed, evaluatedAt: new Date().toISOString() };
      await repository.saveAssessmentEvaluation(database, evaluation);
      dispatch({ type: "ATTACH_EVALUATION", evaluation });
      return evaluation;
    },
    reset() { dispatch({ type: "RESET" }); },
  }), [
    assessments,
    currentAssessment,
    currentPlan,
    state.attemptId,
    state.packageId,
    state.responses,
    state.startedAt,
    state.submission,
    state.view,
  ]);

  return { state, assessments, currentAssessment, currentPlan, assessmentReady, history, commands };
}
