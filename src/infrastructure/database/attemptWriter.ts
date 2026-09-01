import type { AttemptWriter } from "@/application/attemptWriter";
import { getLocalDatabase } from "./client";
import {
  saveObjectiveAttempt,
  saveWritingAttempt,
  saveWritingEvaluation,
} from "./attemptRepository";
import {
  saveSpeakingAttempt,
  saveSpeakingEvaluation,
} from "./speakingRepository";

let writerPromise: Promise<AttemptWriter> | null = null;

export function getAttemptWriter(): Promise<AttemptWriter> {
  writerPromise ??= getLocalDatabase()
    .then((database) => {
      const writer: AttemptWriter = {
        saveObjectiveAttempt: (input) => saveObjectiveAttempt(database, input),
        saveWritingAttempt: (input) => saveWritingAttempt(database, input),
        saveWritingEvaluation: (evaluation) =>
          saveWritingEvaluation(database, evaluation),
        saveSpeakingAttempt: (input) => saveSpeakingAttempt(database, input),
        saveSpeakingEvaluation: (evaluation) =>
          saveSpeakingEvaluation(database, evaluation),
      };
      return writer;
    })
    .catch((error) => {
      writerPromise = null;
      throw error;
    });
  return writerPromise;
}
