import { z } from "zod";
import type { AttemptReader } from "@/application/attemptReader";
import { initialSession, type IeltsAttemptState, type IeltsSession } from "@/domain/session";
import { speakingPlanSchema } from '@/domain/speakingPlan';
import { answerMapSchema } from "@/domain/attemptValidation";

export const STORAGE_KEY = "ielts-practice-session-v4";
const section = z.enum(["listening", "reading", "writing", "speaking"]);
const timestamp = z.iso.datetime({ offset: true });
const draftSchema = z.object({
  contentKeys: z.object({ listening: z.string().optional(), reading: z.string().optional(), writing: z.string().optional() }).optional(),
  speakingPlan: speakingPlanSchema.optional(),
  attemptId: z.uuid().nullable().default(null),
  view: z.enum(["home", "exam", "transition", "result", "review"]),
  mode: z.enum(["full", "section"]).nullable(),
  currentSection: section.nullable(),
  partBySection: z.object({
    listening: z.number().int().positive(),
    reading: z.number().int().positive(),
    writing: z.number().int().positive(),
    speaking: z.number().int().positive(),
  }),
  secondsRemaining: z.object({
    listening: z.number().int().nonnegative(),
    reading: z.number().int().nonnegative(),
    writing: z.number().int().nonnegative(),
    speaking: z.number().int().nonnegative(),
  }),
  answers: z.object({ listening: answerMapSchema, reading: answerMapSchema }),
  writingDrafts: z.object({ 1: z.string(), 2: z.string() }),
  listeningPlayback: z.object({
    currentTimeSec: z.number().nonnegative(),
    volume: z.number().min(0).max(1),
  }),
  completedSections: z.array(section),
  startedAt: timestamp.optional(),
  startedAtBySection: z.object({
    listening: timestamp.optional(),
    reading: timestamp.optional(),
    writing: timestamp.optional(),
    speaking: timestamp.optional(),
  }),
});
const resultIdsSchema = z.object({
  listening: z.uuid().optional(),
  reading: z.uuid().optional(),
  writing: z.uuid().optional(),
  speaking: z.uuid().optional(),
});
export const attemptSnapshotSchema = z.object({
  draft: draftSchema,
  resultAttemptIds: resultIdsSchema,
});
const snapshotSchema = attemptSnapshotSchema.extend({
  version: z.union([z.literal(1), z.literal(2)]),
  pausedDrafts: z.array(attemptSnapshotSchema).max(5).default([]),
});
const submissionId = z.object({ attemptId: z.uuid() }).optional();
const legacySchema = draftSchema.extend({
  objectiveSubmissions: z.object({
    listening: submissionId,
    reading: submissionId,
  }),
  writingSubmission: submissionId,
  speakingSubmission: submissionId,
});

export function parseSnapshot(value: string): z.infer<typeof snapshotSchema> {
  const raw: unknown = JSON.parse(value);
  const current = snapshotSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = legacySchema.parse(raw);
  return {
    version: 1,
    pausedDrafts: [],
    draft: {
      ...draftSchema.parse(legacy),
      view: legacy.view === "review" ? "home" : legacy.view,
    },
    resultAttemptIds: {
      listening: legacy.objectiveSubmissions.listening?.attemptId,
      reading: legacy.objectiveSubmissions.reading?.attemptId,
      writing: legacy.writingSubmission?.attemptId,
      speaking: legacy.speakingSubmission?.attemptId,
    },
  };
}

export async function loadSession(
  reader: AttemptReader,
): Promise<IeltsSession> {
  if (typeof localStorage === "undefined") return initialSession;
  const value = localStorage.getItem(STORAGE_KEY);
  if (!value) return initialSession;
  let snapshot: z.infer<typeof snapshotSchema>;
  try {
    snapshot = parseSnapshot(value);
  } catch (cause) {
    throw new Error("Saved IELTS session metadata is invalid.", { cause });
  }
  const [active, ...pausedDrafts] = await Promise.all([
    restoreAttempt(snapshot, reader),
    ...snapshot.pausedDrafts.map(draft => restoreAttempt(draft, reader)),
  ]);
  return { ...active!, pausedDrafts };
}

export async function restoreAttempt(snapshot: z.infer<typeof attemptSnapshotSchema>, reader: AttemptReader): Promise<IeltsAttemptState> {
  const { pausedDrafts: _paused, ...initialAttempt } = initialSession;
  const { draft, resultAttemptIds: ids } = snapshot;
  const [listening, reading, writing, speaking] = await Promise.all([
    ids.listening ? reader.readObjectiveAttempt(ids.listening) : null,
    ids.reading ? reader.readObjectiveAttempt(ids.reading) : null,
    ids.writing ? reader.readWritingAttempt(ids.writing) : null,
    ids.speaking ? reader.readSpeakingAttempt(ids.speaking) : null,
  ]);
  if (
    (ids.listening && !listening) ||
    (ids.reading && !reading) ||
    (ids.writing && !writing) ||
    (ids.speaking && !speaking)
  ) {
    throw new Error("A saved IELTS submission could not be found.");
  }
  return {
    ...initialAttempt,
    ...draft,
    attemptId: draft.attemptId ?? (draft.mode ? crypto.randomUUID() : null),
    view: draft.view === "review" ? "home" : draft.view,
    objectiveSubmissions: {
      ...(listening ? { listening } : {}),
      ...(reading ? { reading } : {}),
    },
    writingSubmission: writing?.submission,
    writingEvaluation: writing?.evaluation ?? undefined,
    speakingSubmission: speaking?.submission,
    speakingEvaluation: speaking?.evaluation ?? undefined,
  };
}

export function saveSession(session: IeltsSession): void {
  if (typeof localStorage === "undefined") return;
  if (!session.mode && !session.pausedDrafts.length) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 2,
    ...snapshotAttempt(session),
    pausedDrafts: session.pausedDrafts.map(snapshotAttempt),
  }));
}

export function snapshotAttempt(session: IeltsAttemptState) {
  const draft = draftSchema.parse({
    ...session,
    view:
      session.view === "review"
        ? (session.review?.returnTo ?? "home")
        : session.view,
    answers: {
      listening: session.objectiveSubmissions.listening
        ? {}
        : session.answers.listening,
      reading: session.objectiveSubmissions.reading
        ? {}
        : session.answers.reading,
    },
    writingDrafts: session.writingSubmission
      ? { 1: "", 2: "" }
      : session.writingDrafts,
  });
  return {
    draft,
    resultAttemptIds: {
      listening: session.objectiveSubmissions.listening?.attemptId,
      reading: session.objectiveSubmissions.reading?.attemptId,
      writing: session.writingSubmission?.attemptId,
      speaking: session.speakingSubmission?.attemptId,
    },
  };
}
