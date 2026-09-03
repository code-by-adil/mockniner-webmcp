import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { builtInAssessments } from "@/content/builtInAssessments";
import type { AssessmentPackage } from "@/domain/assessment";
import {
  assessmentSessionReducer,
  initialAssessmentSession,
  type AssessmentSession,
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

const defaultPersistence = { getRepository, getDraftRepository };

export function useAssessmentApplication(persistence = defaultPersistence) {
  const [state, setState] = useState(initialAssessmentSession);
  const [assessments, setAssessments] = useState<AssessmentPackage[]>(builtInAssessments);
  const [assessmentReady, setAssessmentReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const current = useRef({ state, assessments });
  const getState = useCallback(() => current.current.state, []);
  const getAssessments = useCallback(() => current.current.assessments, []);
  const publishSession = useCallback((session: AssessmentSession) => {
    current.current.state = session;
    flushSync(() => setState(session));
  }, []);
  const updateAssessments = useCallback((update: (current: AssessmentPackage[]) => AssessmentPackage[]) => {
    const next = update(current.current.assessments);
    current.current.assessments = next;
    flushSync(() => setAssessments(next));
  }, []);
  const dispatchAndSave = useCallback((action: AssessmentSessionAction) => {
    const next = assessmentSessionReducer(getState(), action);
    if (action.type === 'SET_RESPONSE' || action.type === 'TICK') {
      current.current.state = next;
      setState(next);
    } else publishSession(next);
    draftSaves.enqueue('assessment', async () => (await persistence.getDraftRepository()).saveAssessment(next));
  }, [getState, publishSession, persistence]);
  // The factory stores these getters. It only reads them when a command runs after commit.
  const commands = useMemo(
    () =>
      // oxlint-disable-next-line react/refs
      createAssessmentCommands({
        getState,
        getAssessments,
        dispatch: dispatchAndSave,
        flushDrafts: draftSaves.flush,
        setAssessments: updateAssessments,
        getRepository: persistence.getRepository,
      }),
    [getState, getAssessments, dispatchAndSave, updateAssessments, persistence],
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
    void persistence.getRepository()
      .then(repository => repository.loadPackages(onInvalid))
      .then(async packages => {
        const installed = mergeAssessmentPackages(packages);
        const drafts = await persistence.getDraftRepository();
        const session = await drafts.loadAssessment();
        if (cancelled) return;
        updateAssessments(() => installed);
        publishSession(session);
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
  }, [persistence, publishSession, updateAssessments]);

  return {
    state,
    assessments,
    assessmentReady,
    loadError,
    commands,
    currentAssessment:
      state.packageSnapshot ?? assessments.find(
        (assessment) => assessment.packageId === state.packageId,
      ) ?? null,
  };
}
