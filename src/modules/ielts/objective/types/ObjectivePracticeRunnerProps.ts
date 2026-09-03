import type { ObjectiveContentDocument } from "@/domain/objectiveContent";
import type { AnswerMap } from "@/domain/types";

export type ObjectivePracticeRunnerProps = {
  document: ObjectiveContentDocument;
  onBack: () => void;
  isReviewMode?: boolean | undefined;
  answers: AnswerMap;
  currentPart: number;
  secondsRemaining: number;
  onAnswerChange: (id: number, value: string) => void;
  onPartChange: (part: number) => void;
  selectedReviewQuestionId?: number | null;
  onReviewQuestionSelect?: (questionId: number) => void;
  reviewExplanations?: import('@/domain/objectiveExplanation').ObjectiveExplanation[];
  onTick: () => void;
  onSubmit?: (() => unknown | Promise<unknown>) | undefined;
};
