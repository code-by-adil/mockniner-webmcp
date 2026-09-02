import { z } from "zod";
import {
  type AssessmentPackage,
} from "./assessmentContract";
import type {
  AssessmentEvaluation,
} from "./assessmentEvaluation";
import {
  assessmentPartHasTool,
  findAssessmentItem,
  findAssessmentPart,
} from "./assessmentSelectors";
import {
  assessmentResponseMapSchema,
  type AssessmentResponse,
  type AssessmentResponseMap,
} from "./assessmentScoring";
import type { AssessmentSubmission } from "./assessmentSubmission";

type AssessmentSessionView = "home" | "assessment" | "result";
type AssessmentWorkspace = {
  markedItemIds: string[];
  eliminatedOptionIds: Record<string, string[]>;
  timerHidden: boolean;
};
export type AssessmentSession = {
  view: AssessmentSessionView;
  attemptId: string | null;
  packageId: string | null;
  partId: string | null;
  itemId: string | null;
  secondsRemaining: number | null;
  deadlineAt: number | null;
  responses: AssessmentResponseMap;
  workspace: AssessmentWorkspace;
  startedAt?: string;
  submission?: AssessmentSubmission;
  evaluation?: AssessmentEvaluation;
};

export type AssessmentSessionAction =
  | { type: "START"; assessment: AssessmentPackage; attemptId: string; startedAt: string; nowMs: number }
  | { type: "RESUME"; assessment: AssessmentPackage; nowMs: number }
  | { type: "GO_HOME" }
  | { type: "SET_RESPONSE"; itemId: string; response: AssessmentResponse }
  | { type: "TOGGLE_MARK"; assessment: AssessmentPackage; itemId: string }
  | { type: "TOGGLE_ELIMINATION"; assessment: AssessmentPackage; itemId: string; optionId: string }
  | { type: "SET_TIMER_HIDDEN"; hidden: boolean }
  | { type: "SET_ITEM"; assessment: AssessmentPackage; itemId: string }
  | { type: "TICK"; nowMs: number }
  | { type: "ADVANCE_ITEM"; assessment: AssessmentPackage }
  | { type: "COMPLETE_PART"; assessment: AssessmentPackage; partId: string; nowMs: number }
  | { type: "EXPIRE_PART"; assessment: AssessmentPackage; partId: string; nowMs: number }
  | { type: "COMPLETE"; submission: AssessmentSubmission }
  | { type: "OPEN_SUBMISSION"; submission: AssessmentSubmission; evaluation: AssessmentEvaluation | null }
  | { type: "ATTACH_EVALUATION"; evaluation: AssessmentEvaluation }
  | { type: "RESET" };

const initialWorkspace: AssessmentWorkspace = {
  markedItemIds: [],
  eliminatedOptionIds: {},
  timerHidden: false,
};
export const initialAssessmentSession: AssessmentSession = {
  view: "home",
  attemptId: null,
  packageId: null,
  partId: null,
  itemId: null,
  secondsRemaining: null,
  deadlineAt: null,
  responses: {},
  workspace: initialWorkspace,
};
export const ASSESSMENT_SESSION_STORAGE_KEY = "assessment-runtime-session-v3";

export function getDraftAssessmentPackageId(session: AssessmentSession): string | null {
  return session.attemptId && session.packageId
    ? session.packageId
    : null;
}

function timerForPart(durationSeconds: number | undefined, nowMs: number) {
  return durationSeconds === undefined
    ? { secondsRemaining: null, deadlineAt: null }
    : { secondsRemaining: durationSeconds, deadlineAt: nowMs + durationSeconds * 1_000 };
}

function remainingSeconds(deadlineAt: number | null, fallback: number | null, nowMs: number) {
  if (deadlineAt === null) return fallback;
  return Math.max(0, Math.ceil((deadlineAt - nowMs) / 1_000));
}

function enterPart(
  state: AssessmentSession,
  assessment: AssessmentPackage,
  partIndex: number,
  nowMs: number,
): AssessmentSession {
  const part = assessment.parts[partIndex];
  if (!part) return state;
  return {
    ...state,
    partId: part.id,
    itemId: part.items[0]!.id,
    ...timerForPart(part.durationSeconds, nowMs),
  };
}

function resumeAssessment(
  state: AssessmentSession,
  assessment: AssessmentPackage,
  nowMs: number,
): AssessmentSession {
  if (!state.attemptId || state.packageId !== assessment.packageId) return state;
  const part = findAssessmentPart(assessment, state.partId) ?? assessment.parts[0]!;
  const item = findAssessmentItem(part, state.itemId) ?? part.items[0]!;
  const duration = part.durationSeconds ?? null;
  const fallback = duration === null ? null : Math.min(state.secondsRemaining ?? duration, duration);
  return {
    ...state,
    view: "assessment",
    submission: undefined,
    evaluation: undefined,
    partId: part.id,
    itemId: item.id,
    secondsRemaining: remainingSeconds(state.deadlineAt, fallback, nowMs),
    deadlineAt: duration === null
      ? null
      : state.deadlineAt ?? nowMs + (fallback ?? duration) * 1_000,
  };
}

export function assessmentSessionReducer(
  state: AssessmentSession,
  action: AssessmentSessionAction,
): AssessmentSession {
  switch (action.type) {
    case "START": {
      const firstPart = action.assessment.parts[0]!;
      return {
        ...initialAssessmentSession,
        workspace: { ...initialWorkspace },
        view: "assessment",
        attemptId: action.attemptId,
        packageId: action.assessment.packageId,
        partId: firstPart.id,
        itemId: firstPart.items[0]!.id,
        startedAt: action.startedAt,
        ...timerForPart(firstPart.durationSeconds, action.nowMs),
      };
    }
    case "RESUME":
      return resumeAssessment(state, action.assessment, action.nowMs);
    case "GO_HOME":
      return { ...state, view: "home" };
    case "SET_RESPONSE":
      if (state.view !== "assessment" || action.itemId !== state.itemId) return state;
      return { ...state, responses: { ...state.responses, [action.itemId]: action.response } };
    case "TOGGLE_MARK": {
      if (state.view !== "assessment" || action.itemId !== state.itemId) return state;
      const part = findAssessmentPart(action.assessment, state.partId);
      if (!part) return state;
      if (!assessmentPartHasTool(part, "mark_for_review")) return state;
      const marked = state.workspace.markedItemIds;
      return {
        ...state,
        workspace: {
          ...state.workspace,
          markedItemIds: marked.includes(action.itemId)
            ? marked.filter((itemId) => itemId !== action.itemId)
            : [...marked, action.itemId],
        },
      };
    }
    case "TOGGLE_ELIMINATION": {
      if (state.view !== "assessment" || action.itemId !== state.itemId) return state;
      const part = findAssessmentPart(action.assessment, state.partId);
      if (!part) return state;
      if (!assessmentPartHasTool(part, "option_eliminator")) return state;
      const current = state.workspace.eliminatedOptionIds[action.itemId] ?? [];
      const eliminated = current.includes(action.optionId)
        ? current.filter((optionId) => optionId !== action.optionId)
        : [...current, action.optionId];
      const selected = state.responses[action.itemId];
      const responses = selected === action.optionId
        ? Object.fromEntries(Object.entries(state.responses).filter(([itemId]) => itemId !== action.itemId))
        : Array.isArray(selected) && selected.includes(action.optionId)
          ? { ...state.responses, [action.itemId]: selected.filter((optionId) => optionId !== action.optionId) }
          : selected && !Array.isArray(selected) && typeof selected === "object" &&
              Object.values(selected).includes(action.optionId)
            ? {
                ...state.responses,
                [action.itemId]: Object.fromEntries(
                  Object.entries(selected).filter(([, optionId]) => optionId !== action.optionId),
                ),
              }
          : state.responses;
      return {
        ...state,
        responses,
        workspace: {
          ...state.workspace,
          eliminatedOptionIds: { ...state.workspace.eliminatedOptionIds, [action.itemId]: eliminated },
        },
      };
    }
    case "SET_TIMER_HIDDEN":
      return { ...state, workspace: { ...state.workspace, timerHidden: action.hidden } };
    case "SET_ITEM": {
      if (state.view !== "assessment") return state;
      const part = findAssessmentPart(action.assessment, state.partId);
      if (!part) return state;
      if (part.navigation !== "free" || !part.items.some((item) => item.id === action.itemId)) return state;
      return { ...state, itemId: action.itemId };
    }
    case "TICK": {
      if (state.view !== "assessment" || state.secondsRemaining === null) return state;
      return { ...state, secondsRemaining: remainingSeconds(state.deadlineAt, state.secondsRemaining, action.nowMs) };
    }
    case "ADVANCE_ITEM": {
      if (state.view !== "assessment") return state;
      const part = findAssessmentPart(action.assessment, state.partId);
      if (!part) return state;
      const index = part.items.findIndex((item) => item.id === state.itemId);
      return index >= 0 && index < part.items.length - 1
        ? { ...state, itemId: part.items[index + 1]!.id }
        : state;
    }
    case "COMPLETE_PART":
    case "EXPIRE_PART": {
      if (state.view !== "assessment" || state.partId !== action.partId) return state;
      const currentIndex = action.assessment.parts.findIndex((part) => part.id === state.partId);
      return currentIndex >= 0 && currentIndex < action.assessment.parts.length - 1
        ? enterPart(state, action.assessment, currentIndex + 1, action.nowMs)
        : state;
    }
    case "COMPLETE":
      if (state.attemptId !== action.submission.attemptId) return state;
      return {
        ...initialAssessmentSession,
        view: state.view === "assessment" ? "result" : state.view,
        submission: state.view === "assessment" ? action.submission : state.submission,
        evaluation: state.view === "assessment" ? undefined : state.evaluation,
      };
    case "OPEN_SUBMISSION":
      return {
        ...state,
        view: "result",
        submission: action.submission,
        evaluation: action.evaluation ?? undefined,
      };
    case "ATTACH_EVALUATION":
      return state.submission?.attemptId === action.evaluation.attemptId
        ? { ...state, evaluation: action.evaluation }
        : state;
    case "RESET":
      return initialAssessmentSession;
  }
}

const storedSessionSchema = z.strictObject({
  attemptId: z.uuid(),
  packageId: z.string().min(1),
  partId: z.string().min(1),
  itemId: z.string().min(1),
  secondsRemaining: z.number().int().nonnegative().nullable(),
  deadlineAt: z.number().finite().nullable(),
  responses: assessmentResponseMapSchema,
  workspace: z.strictObject({
    markedItemIds: z.array(z.string()),
    eliminatedOptionIds: z.record(z.string(), z.array(z.string())),
    timerHidden: z.boolean(),
  }),
  startedAt: z.iso.datetime({ offset: true }),
});

export function loadAssessmentSession(): AssessmentSession {
  if (typeof window === "undefined") return initialAssessmentSession;
  try {
    const stored = window.localStorage.getItem(ASSESSMENT_SESSION_STORAGE_KEY);
    if (!stored) return initialAssessmentSession;
    const parsed = storedSessionSchema.safeParse(JSON.parse(stored));
    return parsed.success ? { ...initialAssessmentSession, ...parsed.data, view: "home" } : initialAssessmentSession;
  } catch {
    return initialAssessmentSession;
  }
}

export function saveAssessmentSession(session: AssessmentSession): void {
  if (typeof window === "undefined") return;
  if (!session.attemptId || !session.packageId || !session.partId || !session.itemId || !session.startedAt) {
    window.localStorage.removeItem(ASSESSMENT_SESSION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ASSESSMENT_SESSION_STORAGE_KEY, JSON.stringify({
    attemptId: session.attemptId,
    packageId: session.packageId,
    partId: session.partId,
    itemId: session.itemId,
    secondsRemaining: session.secondsRemaining,
    deadlineAt: session.deadlineAt,
    responses: session.responses,
    workspace: session.workspace,
    startedAt: session.startedAt,
  }));
}

export function isLastItemInPart(assessment: AssessmentPackage, session: AssessmentSession): boolean {
  return findAssessmentPart(assessment, session.partId)?.items.at(-1)?.id === session.itemId;
}

export function isFinalPart(assessment: AssessmentPackage, session: AssessmentSession): boolean {
  return assessment.parts.at(-1)?.id === session.partId;
}
