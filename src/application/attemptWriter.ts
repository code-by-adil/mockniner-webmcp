import type {
  AnswerMap,
  ObjectiveResult,
  ObjectiveSubmission,
  SpeakingSubmission,
  WritingEvaluation,
  WritingSubmission,
  WritingSubmittedTask,
} from "@/domain/types";

export type SaveObjectiveAttemptInput = {
  section: "listening" | "reading";
  contentKey: string;
  answers: AnswerMap;
  result: ObjectiveResult;
  startedAt: string;
  submittedAt: string;
};

export type SaveWritingAttemptInput = {
  contentKey: string;
  tasks: [WritingSubmittedTask, WritingSubmittedTask];
  startedAt: string;
  submittedAt: string;
};

export type SpeakingRecordingInput = {
  promptId: number;
  partLabel: string;
  sequence: number;
  promptText: string;
  timeLimitSeconds: number;
  durationMs: number;
  audio: Blob;
};

export type SaveSpeakingAttemptInput = {
  contentKey: string;
  startedAt: string;
  submittedAt: string;
  recordings: SpeakingRecordingInput[];
};

export type CompleteSpeakingAttemptInput = Omit<
  SaveSpeakingAttemptInput,
  "submittedAt"
>;

export type AttemptWriter = {
  saveObjectiveAttempt: (
    input: SaveObjectiveAttemptInput,
  ) => Promise<ObjectiveSubmission>;
  saveWritingAttempt: (
    input: SaveWritingAttemptInput,
  ) => Promise<WritingSubmission>;
  saveWritingEvaluation: (evaluation: WritingEvaluation) => Promise<void>;
  saveSpeakingAttempt: (
    input: SaveSpeakingAttemptInput,
  ) => Promise<SpeakingSubmission>;
};
