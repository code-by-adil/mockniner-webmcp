// Legacy localStorage codec. Runtime drafts live in the SQLite draft repository.
import { z } from 'zod';
import { assessmentResponseMapSchema } from '@/domain/assessmentScoring';
import { initialAssessmentSession, type AssessmentSession } from '@/domain/assessmentSession';
export const ASSESSMENT_SESSION_STORAGE_KEY = 'assessment-runtime-session-v3';

export const storedSessionSchema = z.strictObject({
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
