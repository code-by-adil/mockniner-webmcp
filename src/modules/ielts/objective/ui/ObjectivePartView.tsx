import type {
  ObjectiveContentBlock,
  ObjectiveContentDocument,
} from "@/domain/objectiveContent";
import { HighlightableArea } from "@/shared/ui/exam/HighlightableArea";
import { ResizableSplitPane } from "@/shared/ui/exam/ResizableSplitPane";
import { ObjectiveBlockView } from "../blocks/ObjectiveBlockView";
import type { ObjectiveRenderProps } from "../types/ObjectiveRenderProps";
import {
  HeadingMatchingOptionsBlock,
  HeadingMatchingPassageBlock,
} from "../blocks/MatchingQuestionsBlock";
import {
  splitObjectivePartBlocks,
  toObjectiveBlockListItems,
  type ObjectiveBlockListItem,
} from "./objectiveRendering";

type ObjectivePartViewProps = ObjectiveRenderProps & {
  part: ObjectiveContentDocument["parts"][number];
  section: ObjectiveContentDocument["section"];
};

function BlockList({
  blocks,
  exam,
  className = "",
}: {
  blocks: ObjectiveBlockListItem[];
  exam: ObjectiveRenderProps;
  className?: string;
}) {
  return (
    <div className={className}>
      {blocks.map((item) => (
        <ObjectiveBlockView
          key={`${item.block.type}-${item.originalIndex}`}
          block={item.block}
          ctx={exam}
          index={item.originalIndex}
        />
      ))}
    </div>
  );
}

type HeadingMatchingBlockItem = ObjectiveBlockListItem & {
  block: Extract<ObjectiveContentBlock, { type: "heading_matching_questions" }>;
};

function findHeadingMatchingBlock(
  blocks: ObjectiveBlockListItem[],
): HeadingMatchingBlockItem | undefined {
  return blocks.find(
    (item): item is HeadingMatchingBlockItem =>
      item.block.type === "heading_matching_questions",
  );
}

export function ObjectivePartView({
  part,
  section,
  ...exam
}: ObjectivePartViewProps) {
  if (section === "reading") {
    const { passageBlocks, questionBlocks } = splitObjectivePartBlocks(
      part.blocks,
    );
    if (passageBlocks.length > 0) {
      const headingMatchingBlock = findHeadingMatchingBlock(questionBlocks);
      return (
        <ResizableSplitPane
          left={
            <HighlightableArea className="h-full overflow-y-auto bg-white p-4 sm:p-8">
              {passageBlocks.map((item) =>
                item.block.type === "passage" && headingMatchingBlock ? (
                  <HeadingMatchingPassageBlock
                    key={`${item.block.type}-${item.originalIndex}`}
                    passage={item.block}
                    headingBlock={headingMatchingBlock.block}
                    headingBlockIndex={headingMatchingBlock.originalIndex}
                    ctx={exam}
                  />
                ) : (
                  <ObjectiveBlockView
                    key={`${item.block.type}-${item.originalIndex}`}
                    block={item.block}
                    ctx={exam}
                    index={item.originalIndex}
                  />
                ),
              )}
            </HighlightableArea>
          }
          right={
            <div className="h-full overflow-y-auto bg-white p-4 sm:p-6">
              {questionBlocks.map((item) =>
                item.block.type === "heading_matching_questions" &&
                headingMatchingBlock ? (
                  <HeadingMatchingOptionsBlock
                    key={`${item.block.type}-${item.originalIndex}`}
                    block={item.block}
                    ctx={exam}
                    index={item.originalIndex}
                  />
                ) : (
                  <ObjectiveBlockView
                    key={`${item.block.type}-${item.originalIndex}`}
                    block={item.block}
                    ctx={exam}
                    index={item.originalIndex}
                  />
                ),
              )}
            </div>
          }
          initialLeftPercent={50}
          minLeftPercent={32}
          maxLeftPercent={68}
          isRightScrollable={false}
        />
      );
    }
  }

  return <BlockList blocks={toObjectiveBlockListItems(part.blocks)} exam={exam} />;
}
