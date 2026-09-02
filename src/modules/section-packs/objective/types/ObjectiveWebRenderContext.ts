import type { AnswerMap } from "@/domain/types";
import type {
  ObjectiveContentBlock,
  ObjectiveBlockType,
} from "@/domain/objectiveContent";

export type ObjectiveWebRenderContext = {
  answers: AnswerMap;
  onAnswerChange: (id: number, value: string) => void;
  isReviewMode: boolean;
};

type ObjectiveWebBlockByType<T extends ObjectiveBlockType> = Extract<
  ObjectiveContentBlock,
  { type: T }
>;

export type ObjectiveWebBlockRendererProps<T extends ObjectiveBlockType> = {
  block: ObjectiveWebBlockByType<T>;
  ctx: ObjectiveWebRenderContext;
  index: number;
};
