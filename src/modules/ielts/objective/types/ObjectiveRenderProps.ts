import type { AnswerMap } from "@/domain/types";
import type {
  ObjectiveContentBlock,
  ObjectiveBlockType,
} from "@/domain/objectiveContent";

export type ObjectiveRenderProps = {
  answers: AnswerMap;
  onAnswerChange: (id: number, value: string) => void;
  isReviewMode: boolean;
};

type ObjectiveBlockByType<T extends ObjectiveBlockType> = Extract<
  ObjectiveContentBlock,
  { type: T }
>;

export type ObjectiveBlockProps<T extends ObjectiveBlockType> = {
  block: ObjectiveBlockByType<T>;
  ctx: ObjectiveRenderProps;
  index: number;
};
