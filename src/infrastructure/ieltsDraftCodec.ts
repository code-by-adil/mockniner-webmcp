import { z } from "zod";
import type { AttemptReader } from "@/application/attemptReader";
import { initialSession, type IeltsAttemptState } from "@/domain/session";
import { speakingPlanSchema } from '@/domain/speakingPlan';
import { answerMapSchema } from "@/domain/attemptValidation";

const section = z.enum(["listening", "reading", "writing", "speaking"]);
const timestamp = z.iso.datetime({ offset: true });
const draftSchema = z.object({
  contentKeys: z.object({ listening: z.string().optional(), reading: z.string().optional(), writing: z.string().optional() }).optional(),
  speakingPlan: speakingPlanSchema.optional(),
  attemptId: z.uuid().nullable(),
  view: z.enum(["home", "exam", "transition", "result"]),
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
