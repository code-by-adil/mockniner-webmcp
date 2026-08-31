import type {
  ObjectiveContentBlock,
  ObjectiveBlockType,
  TestPartProps,
} from "@ielts/shared";

export type ObjectiveWebRenderContext = TestPartProps;

export type ObjectiveWebBlockByType<T extends ObjectiveBlockType> = Extract<
  ObjectiveContentBlock,
  { type: T }
>;

export type ObjectiveWebBlockRendererProps<T extends ObjectiveBlockType> = {
  block: ObjectiveWebBlockByType<T>;
  ctx: ObjectiveWebRenderContext;
  index: number;
};
