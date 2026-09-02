import { z } from "zod";
import type { AttemptReader } from "@/application/attemptReader";
import { initialSession, type IeltsSession } from "@/domain/session";
import { answerMapSchema } from "@/domain/attemptValidation";

const STORAGE_KEY = "ielts-practice-session-v4";
const section = z.enum(["listening", "reading", "writing", "speaking"]);
const timestamp = z.iso.datetime({ offset: true });
const draftSchema = z.object({
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
const snapshotSchema = z.object({
  version: z.literal(1),
  draft: draftSchema,
  resultAttemptIds: resultIdsSchema,
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

function parseSnapshot(value: string): z.infer<typeof snapshotSchema> {
  const raw: unknown = JSON.parse(value);
  const current = snapshotSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = legacySchema.parse(raw);
  return {
    version: 1,
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
    ...initialSession,
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
  if (!session.mode) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
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
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      draft,
      resultAttemptIds: {
        listening: session.objectiveSubmissions.listening?.attemptId,
        reading: session.objectiveSubmissions.reading?.attemptId,
        writing: session.writingSubmission?.attemptId,
        speaking: session.speakingSubmission?.attemptId,
      },
    }),
  );
}
