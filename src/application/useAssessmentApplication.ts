import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { satPracticeAssessment } from "@/content/sat";
import type {
  AssessmentHistoryEntry,
  AssessmentPackage,
} from "@/domain/assessment";
import {
  assessmentSessionReducer,
  getDraftAssessmentPackageId,
  loadAssessmentSession,
  saveAssessmentSession,
} from "@/domain/assessmentSession";
import { reportHandledError } from "@/shared/reportHandledError";
import {
  createAssessmentCommands,
  mergeAssessmentPackages,
} from "./assessmentCommands";

const getRepository = async () =>
  (
    await import("@/infrastructure/database/assessmentRepository")
  ).getAssessmentRepository();

export function useAssessmentApplication() {
  const [state, dispatch] = useReducer(
    assessmentSessionReducer,
    undefined,
    loadAssessmentSession,
  );
  const [assessments, setAssessments] = useState<AssessmentPackage[]>([
    satPracticeAssessment,
  ]);
  const [assessmentReady, setAssessmentReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<AssessmentHistoryEntry[]>([]);
  const current = useRef({ state, assessments });
  useLayoutEffect(() => {
    current.current = { state, assessments };
  }, [state, assessments]);
  const getState = useCallback(() => current.current.state, []);
  const getAssessments = useCallback(() => current.current.assessments, []);
  // The factory stores these getters. It only reads them when a command runs after commit.
  const commands = useMemo(
    () =>
      // oxlint-disable-next-line react/refs
      createAssessmentCommands({
        getState,
        getAssessments,
        dispatch,
        setAssessments,
        setHistory,
        getRepository,
      }),
    [getState, getAssessments],
  );

  useEffect(() => saveAssessmentSession(state), [state]);
  useEffect(() => {
    let cancelled = false;
    const onInvalid = (
      error: Error,
      row: { kind: "package" | "attempt"; id: string },
    ) => {
      reportHandledError(error, {
        feature: "assessment-catalog-row-load",
        rowKind: row.kind,
        rowId: row.id,
      });
    };
    void getRepository()
      .then((repository) =>
        Promise.all([
          repository.loadPackages(onInvalid),
          repository.readHistory(10, onInvalid),
        ]),
      )
      .then(([packages, attempts]) => {
        if (cancelled) return;
        setAssessments(mergeAssessmentPackages(packages));
        setHistory(attempts);
        setAssessmentReady(true);
      })
      .catch((error) => {
        reportHandledError(error, { feature: "assessment-catalog-load" });
        if (!cancelled)
          setLoadError(
            "Your saved assessments could not be loaded. Your unfinished attempt has been kept.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const draftPackageId = getDraftAssessmentPackageId(state);
  useEffect(() => {
    if (
      assessmentReady &&
      draftPackageId &&
      !assessments.some((assessment) => assessment.packageId === draftPackageId)
    )
      dispatch({ type: "RESET" });
  }, [assessmentReady, assessments, draftPackageId]);

  return {
    state,
    assessments,
    assessmentReady,
    loadError,
    history,
    commands,
    currentAssessment:
      assessments.find(
        (assessment) => assessment.packageId === state.packageId,
      ) ?? null,
  };
}
