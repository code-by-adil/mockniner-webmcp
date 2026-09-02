import type { ObjectiveContentBlock } from "@/domain/objectiveContent";
import type { ObjectiveWebRenderContext } from "../types/ObjectiveWebRenderContext";
import { CompletionQuestionsBlock } from "./CompletionQuestionsBlock";
import {
  FeatureMatchingQuestionsBlock,
  HeadingMatchingQuestionsBlock,
} from "./MatchingQuestionsBlock";
import { MapLabelingQuestionsBlock } from "./MapLabelingQuestionsBlock";
import { MCQQuestionsBlock, TrueFalseNotGivenQuestionsBlock, YesNoNotGivenQuestionsBlock } from "./RadioQuestionsBlock";
import { MultipleSelectionQuestionBlock } from "./MultipleSelectionQuestionBlock";
import { GroupHeaderBlock, PassageBlock, SpacerBlock, TextBlock } from "./TextBlocks";

export function ObjectiveWebBlock({
  block,
  ctx,
  index,
}: {
  block: ObjectiveContentBlock;
  ctx: ObjectiveWebRenderContext;
  index: number;
}) {
  const props = { block, ctx, index };
  switch (block.type) {
    case "group_header":
      return <GroupHeaderBlock {...props} block={block} />;
    case "text":
      return <TextBlock {...props} block={block} />;
    case "passage":
      return <PassageBlock {...props} block={block} />;
    case "completion_questions":
      return <CompletionQuestionsBlock {...props} block={block} />;
    case "mcq_questions":
      return <MCQQuestionsBlock {...props} block={block} />;
    case "true_false_not_given_questions":
      return <TrueFalseNotGivenQuestionsBlock {...props} block={block} />;
    case "yes_no_not_given_questions":
      return <YesNoNotGivenQuestionsBlock {...props} block={block} />;
    case "feature_matching_questions":
      return <FeatureMatchingQuestionsBlock {...props} block={block} />;
    case "heading_matching_questions":
      return <HeadingMatchingQuestionsBlock {...props} block={block} />;
    case "multiple_selection_question":
      return <MultipleSelectionQuestionBlock {...props} block={block} />;
    case "map_labeling_questions":
      return <MapLabelingQuestionsBlock {...props} block={block} />;
    case "spacer":
      return <SpacerBlock {...props} block={block} />;
  }
}
