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
  initialAssessmentSession,
  type AssessmentSessionAction,
} from "@/domain/assessmentSession";
import { reportHandledError } from "@/shared/reportHandledError";
import { flushSync } from 'react-dom';
import { getDraftRepository } from '@/infrastructure/database/draftRepository';
import { draftSaves } from '@/infrastructure/saveCoordinator';
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
    initialAssessmentSession,
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
  const dispatchAndSave = useCallback((action: AssessmentSessionAction) => {
    const next = assessmentSessionReducer(getState(), action);
    flushSync(() => dispatch(action));
    draftSaves.enqueue('assessment', async () => (await getDraftRepository()).saveAssessment(next));
  }, [getState]);
  // The factory stores these getters. It only reads them when a command runs after commit.
  const commands = useMemo(
    () =>
      // oxlint-disable-next-line react/refs
      createAssessmentCommands({
        getState,
        getAssessments,
        dispatch: dispatchAndSave,
        flushDrafts: draftSaves.flush,
        setAssessments,
        setHistory,
        getRepository,
      }),
    [getState, getAssessments, dispatchAndSave],
  );

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
      .then(async ([packages, attempts]) => {
        const installed = mergeAssessmentPackages(packages);
        const drafts = await getDraftRepository();
        const session = await drafts.loadAssessment(installed);
        if (cancelled) return;
        setAssessments(installed);
        dispatch({ type: 'RESTORE', session });
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

  return {
    state,
    assessments,
    assessmentReady,
    loadError,
    history,
    commands,
    currentAssessment:
      state.packageSnapshot ?? assessments.find(
        (assessment) => assessment.packageId === state.packageId,
      ) ?? null,
  };
}
