import type { AttemptReader } from "@/application/attemptReader";
import type { AttemptWriter } from "@/application/attemptWriter";
import { getLocalDatabase } from "./client";
import type { SQLocal } from "sqlocal";
import {
  readLearningSummary,
  readObjectiveAttempt,
  readWritingAttempt,
  saveObjectiveAttempt,
  saveWritingAttempt,
  saveWritingEvaluation,
} from "./attemptRepository";
import {
  readSpeakingAttempt,
  saveSpeakingAttempt,
  saveSpeakingEvaluation,
} from "./speakingRepository";

export async function getIeltsRepository(): Promise<
  AttemptReader & AttemptWriter
> {
  return createIeltsRepository(await getLocalDatabase());
}

export function createIeltsRepository(
  database: SQLocal,
): AttemptReader & AttemptWriter {
  return {
    readLearningSummary: (limit) => readLearningSummary(database, limit),
    readObjectiveAttempt: (id) => readObjectiveAttempt(database, id),
    readWritingAttempt: (id) => readWritingAttempt(database, id),
    readSpeakingAttempt: (id) => readSpeakingAttempt(database, id),
    saveObjectiveAttempt: (input) => saveObjectiveAttempt(database, input),
    saveWritingAttempt: (input) => saveWritingAttempt(database, input),
    saveSpeakingAttempt: (input) => saveSpeakingAttempt(database, input),
    saveWritingEvaluation: (evaluation) =>
      saveWritingEvaluation(database, evaluation),
    saveSpeakingEvaluation: (evaluation) =>
      saveSpeakingEvaluation(database, evaluation),
  };
}
