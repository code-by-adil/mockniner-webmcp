import type React from "react";
import type {
  AnswerMap,
  TestDefinition,
} from "@ielts/shared";

export type ObjectivePracticeRunnerProps = {
  testDefinition: TestDefinition;
  contentKey?: string | undefined;
  topBarContent?: React.ReactNode | undefined;
  onBack: () => void;
  isFullExam?: boolean | undefined;
  isReviewMode?: boolean | undefined;
  answers: AnswerMap;
  currentPart: number;
  secondsRemaining: number;
  onAnswerChange: (id: number, value: string) => void;
  onPartChange: (part: number) => void;
  onTick: () => void;
  onSubmit?: (() => unknown | Promise<unknown>) | undefined;
};
