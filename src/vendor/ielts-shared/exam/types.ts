import type React from "react";
import type {
  AnswerKey as DomainAnswerKey,
  AnswerMap as DomainAnswerMap,
  WritingAnnotation as DomainWritingAnnotation,
} from "@/domain/types";

export interface QuestionBase {
  id: number;
  label: string;
  value: string;
}

export interface MultipleChoiceOption {
  value: string;
  label: string;
}

export interface CheckboxOption {
  value: string;
  label: string;
}

export interface MultipleChoiceData extends QuestionBase {
  questionText: string;
  options: MultipleChoiceOption[];
}

export type AnswerMap = DomainAnswerMap;
export type AnswerKey = DomainAnswerKey;

export interface TestPartProps {
  answers: AnswerMap;
  onAnswerChange: (id: number, val: string) => void;
  isReviewMode?: boolean | undefined;
  answerKey?: AnswerKey | undefined;
  headerContent?: React.ReactNode | undefined;
  footerContent?: React.ReactNode | undefined;
}

export interface TestPartDefinition {
  id: number;
  label: string;
  instructionRange: string;
  instructionText: string;
  Component?: React.ComponentType<TestPartProps> | undefined;
}

export interface ListeningAudioDefinition {
  key: string;
}

export interface TestDefinition {
  id: number;
  name: string;
  parts: TestPartDefinition[];
  answerKey?: AnswerKey | undefined;
  listeningAudio?: ListeningAudioDefinition | undefined;
}

export type WritingAnnotation = DomainWritingAnnotation;

export interface WritingScore {
  band: number;
  taskAchievement: number;
  coherenceCohesion: number;
  lexicalResource: number;
  grammaticalRange: number;
  feedback: string;
  annotations?: WritingAnnotation[] | undefined;
}

export type WritingSubmissionStatus = "partial" | "complete";

export interface WritingSummaryScore extends WritingScore {
  status: WritingSubmissionStatus;
  gradedTaskCount: number;
  missingTasks: Array<1 | 2>;
  task1?: WritingScore | undefined;
  task2?: WritingScore | undefined;
}

export interface WritingGradeTaskRequest {
  promptText: string;
  essayText: string;
  scoreKey?: string | undefined;
}

export interface WritingGradeRequest {
  tasks: {
    task1?: WritingGradeTaskRequest | undefined;
    task2?: WritingGradeTaskRequest | undefined;
  };
}

export interface SpeakingScore {
  band: number;
  fluencyCoherence: number;
  lexicalResource: number;
  grammaticalRange: number;
  pronunciation: number;
  feedback: string;
}

export interface FullExamScores {
  listening?: { raw: number; band: number } | undefined;
  reading?: { raw: number; band: number } | undefined;
  writing?: WritingSummaryScore | undefined;
  speaking?: SpeakingScore | undefined;
}
