import type {
  AnswerMap,
  ObjectiveResult,
  ObjectiveSubmission,
  SpeakingSubmission,
  SpeakingEvaluation,
  WritingEvaluation,
  WritingSubmission,
  WritingSubmittedTask,
} from "@/domain/types";

export type SaveObjectiveAttemptInput = {
  attemptId: string;
  section: "listening" | "reading";
  contentKey: string;
  answers: AnswerMap;
  result: ObjectiveResult;
  startedAt: string;
  submittedAt: string;
};

export type SaveWritingAttemptInput = {
  attemptId: string;
  contentKey: string;
  tasks: [WritingSubmittedTask, WritingSubmittedTask];
  startedAt: string;
  submittedAt: string;
};

export type SpeakingRecordingInput = {
  status: 'answered' | 'skipped';
  promptId: number;
  partLabel: string;
  sequence: number;
  promptText: string;
  timeLimitSeconds: number;
  durationMs: number;
  audio: Blob | null;
  transcript: string;
};

export type SaveSpeakingAttemptInput = {
  attemptId: string;
  contentKey: string;
  startedAt: string;
  submittedAt: string;
  recordings: SpeakingRecordingInput[];
};

export type CompleteSpeakingAttemptInput = Omit<
  SaveSpeakingAttemptInput,
  "submittedAt" | "attemptId"
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
  saveSpeakingEvaluation: (evaluation: SpeakingEvaluation) => Promise<void>;
};
