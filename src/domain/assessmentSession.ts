import { z } from "zod";
import {
  assessmentResponseMapSchema,
  type AssessmentEvaluation,
  type AssessmentPackage,
  type AssessmentResponse,
  type AssessmentResponseMap,
  type AssessmentSubmission,
} from "./assessment";

export type AssessmentSessionView = "home" | "assessment" | "result";

export type AssessmentSession = {
  view: AssessmentSessionView;
  packageId: string | null;
  sectionIndex: number;
  moduleIndex: number;
  itemIndex: number;
  secondsRemaining: number | null;
  responses: AssessmentResponseMap;
  markedItemIds: string[];
  startedAt?: string;
  submission?: AssessmentSubmission;
  evaluation?: AssessmentEvaluation;
};

export type AssessmentSessionAction =
  | { type: "START"; assessment: AssessmentPackage; startedAt: string }
  | { type: "RESUME"; assessment: AssessmentPackage }
  | { type: "GO_HOME" }
  | { type: "SET_RESPONSE"; itemId: string; response: AssessmentResponse }
  | { type: "TOGGLE_MARK"; itemId: string }
  | { type: "SET_ITEM"; assessment: AssessmentPackage; itemIndex: number }
  | { type: "TICK" }
  | { type: "ADVANCE"; assessment: AssessmentPackage }
  | { type: "EXPIRE_MODULE"; assessment: AssessmentPackage }
  | { type: "COMPLETE"; submission: AssessmentSubmission }
  | {
      type: "OPEN_SUBMISSION";
      submission: AssessmentSubmission;
      evaluation: AssessmentEvaluation | null;
    }
  | { type: "ATTACH_EVALUATION"; evaluation: AssessmentEvaluation }
  | { type: "RESET" };

export const initialAssessmentSession: AssessmentSession = {
  view: "home",
  packageId: null,
  sectionIndex: 0,
  moduleIndex: 0,
  itemIndex: 0,
  secondsRemaining: null,
  responses: {},
  markedItemIds: [],
};

export const ASSESSMENT_SESSION_STORAGE_KEY = "assessment-runtime-session-v1";

function moduleDuration(
  assessment: AssessmentPackage,
  sectionIndex: number,
  moduleIndex: number,
): number | null {
  return assessment.sections[sectionIndex]?.modules[moduleIndex]?.durationSeconds ?? null;
}

function advanceToNextModule(
  state: AssessmentSession,
  assessment: AssessmentPackage,
): AssessmentSession {
  const section = assessment.sections[state.sectionIndex];
  if (!section) return state;
  if (state.moduleIndex < section.modules.length - 1) {
    const moduleIndex = state.moduleIndex + 1;
    return {
      ...state,
      moduleIndex,
      itemIndex: 0,
      secondsRemaining: moduleDuration(assessment, state.sectionIndex, moduleIndex),
    };
  }
  if (state.sectionIndex < assessment.sections.length - 1) {
    const sectionIndex = state.sectionIndex + 1;
    return {
      ...state,
      sectionIndex,
      moduleIndex: 0,
      itemIndex: 0,
      secondsRemaining: moduleDuration(assessment, sectionIndex, 0),
    };
  }
  return state;
}

function resumeAssessment(
  state: AssessmentSession,
  assessment: AssessmentPackage,
): AssessmentSession {
  if (state.packageId !== assessment.packageId || state.submission) return state;

  const sectionIndex = Math.min(state.sectionIndex, assessment.sections.length - 1);
  const section = assessment.sections[sectionIndex]!;
  const moduleIndex = Math.min(state.moduleIndex, section.modules.length - 1);
  const module = section.modules[moduleIndex]!;
  const itemIndex = Math.min(state.itemIndex, module.items.length - 1);
  const duration = module.durationSeconds ?? null;
  const secondsRemaining = duration === null
    ? null
    : Math.min(state.secondsRemaining ?? duration, duration);

  return {
    ...state,
    view: "assessment",
    sectionIndex,
    moduleIndex,
    itemIndex,
    secondsRemaining,
  };
}

export function assessmentSessionReducer(
  state: AssessmentSession,
  action: AssessmentSessionAction,
): AssessmentSession {
  switch (action.type) {
    case "START":
      return {
        ...initialAssessmentSession,
        view: "assessment",
        packageId: action.assessment.packageId,
        secondsRemaining: moduleDuration(action.assessment, 0, 0),
        startedAt: action.startedAt,
      };
    case "RESUME":
      return resumeAssessment(state, action.assessment);
    case "GO_HOME":
      return { ...state, view: "home" };
    case "SET_RESPONSE":
      if (state.view !== "assessment") return state;
      return {
        ...state,
        responses: { ...state.responses, [action.itemId]: action.response },
      };
    case "TOGGLE_MARK":
      if (state.view !== "assessment") return state;
      return {
        ...state,
        markedItemIds: state.markedItemIds.includes(action.itemId)
          ? state.markedItemIds.filter((itemId) => itemId !== action.itemId)
          : [...state.markedItemIds, action.itemId],
      };
    case "SET_ITEM": {
      if (state.view !== "assessment") return state;
      const module = action.assessment.sections[state.sectionIndex]?.modules[state.moduleIndex];
      if (!module) return state;
      return {
        ...state,
        itemIndex: Math.max(0, Math.min(module.items.length - 1, Math.trunc(action.itemIndex))),
      };
    }
    case "TICK":
      if (state.view !== "assessment" || state.secondsRemaining === null || state.secondsRemaining <= 0) {
        return state;
      }
      return { ...state, secondsRemaining: state.secondsRemaining - 1 };
    case "ADVANCE": {
      if (state.view !== "assessment") return state;
      const section = action.assessment.sections[state.sectionIndex];
      const module = section?.modules[state.moduleIndex];
      if (!section || !module) return state;
      if (state.itemIndex < module.items.length - 1) {
        return { ...state, itemIndex: state.itemIndex + 1 };
      }
      return advanceToNextModule(state, action.assessment);
    }
    case "EXPIRE_MODULE": {
      if (state.view !== "assessment") return state;
      return advanceToNextModule(state, action.assessment);
    }
    case "COMPLETE":
      return { ...state, view: "result", submission: action.submission };
    case "OPEN_SUBMISSION":
      return {
        ...initialAssessmentSession,
        view: "result",
        packageId: action.submission.packageId,
        submission: action.submission,
        ...(action.evaluation ? { evaluation: action.evaluation } : {}),
      };
    case "ATTACH_EVALUATION":
      if (state.submission?.attemptId !== action.evaluation.attemptId) return state;
      return { ...state, view: "result", evaluation: action.evaluation };
    case "RESET":
      return initialAssessmentSession;
  }
}

const storedSessionSchema = z.strictObject({
  packageId: z.string().min(1),
  sectionIndex: z.number().int().nonnegative(),
  moduleIndex: z.number().int().nonnegative(),
  itemIndex: z.number().int().nonnegative(),
  secondsRemaining: z.number().int().nonnegative().nullable(),
  responses: assessmentResponseMapSchema,
  markedItemIds: z.array(z.string()),
  startedAt: z.iso.datetime({ offset: true }),
});

export function loadAssessmentSession(): AssessmentSession {
  if (typeof window === "undefined") return initialAssessmentSession;
  try {
    const stored = window.localStorage.getItem(ASSESSMENT_SESSION_STORAGE_KEY);
    if (!stored) return initialAssessmentSession;
    const parsed = storedSessionSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) return initialAssessmentSession;
    return { ...initialAssessmentSession, ...parsed.data, view: "home" };
  } catch {
    return initialAssessmentSession;
  }
}

export function saveAssessmentSession(session: AssessmentSession): void {
  if (typeof window === "undefined") return;
  if (!session.packageId || !session.startedAt || session.submission) {
    window.localStorage.removeItem(ASSESSMENT_SESSION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ASSESSMENT_SESSION_STORAGE_KEY, JSON.stringify({
    packageId: session.packageId,
    sectionIndex: session.sectionIndex,
    moduleIndex: session.moduleIndex,
    itemIndex: session.itemIndex,
    secondsRemaining: session.secondsRemaining,
    responses: session.responses,
    markedItemIds: session.markedItemIds,
    startedAt: session.startedAt,
  }));
}

export function isFinalAssessmentItem(
  assessment: AssessmentPackage,
  session: AssessmentSession,
): boolean {
  const finalSectionIndex = assessment.sections.length - 1;
  const finalSection = assessment.sections[finalSectionIndex];
  const finalModuleIndex = (finalSection?.modules.length ?? 1) - 1;
  const finalModule = finalSection?.modules[finalModuleIndex];
  return session.sectionIndex === finalSectionIndex &&
    session.moduleIndex === finalModuleIndex &&
    session.itemIndex === (finalModule?.items.length ?? 1) - 1;
}

export function isFinalAssessmentModule(
  assessment: AssessmentPackage,
  session: AssessmentSession,
): boolean {
  const finalSectionIndex = assessment.sections.length - 1;
  const finalSection = assessment.sections[finalSectionIndex];
  return session.sectionIndex === finalSectionIndex &&
    session.moduleIndex === (finalSection?.modules.length ?? 1) - 1;
}
