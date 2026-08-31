import React from "react";
import {
  splitObjectivePartBlocks,
  toObjectiveBlockListItems,
  type ObjectiveBlockListItem,
  type ObjectiveContentBlock,
  type ObjectiveContentDocument,
  type TestPartProps,
} from "@ielts/shared";
import { HighlightableArea } from "@/shared/ui/exam/HighlightableArea";
import { ResizableSplitPane } from "@/shared/ui/exam/ResizableSplitPane";
import { ObjectiveWebBlock } from "./blocks";
import {
  HeadingMatchingOptionsBlock,
  HeadingMatchingPassageBlock,
} from "./blocks/MatchingQuestionsBlock";

type ObjectivePartViewProps = TestPartProps & {
  part: ObjectiveContentDocument["parts"][number];
  section: ObjectiveContentDocument["section"];
};

function BlockList({
  blocks,
  exam,
  className = "",
}: {
  blocks: ObjectiveBlockListItem[];
  exam: TestPartProps;
  className?: string;
}) {
  return (
    <div className={className}>
      {exam.headerContent}
      {blocks.map((item) => (
        <ObjectiveWebBlock
          key={`${item.block.type}-${item.originalIndex}`}
          block={item.block}
          ctx={exam}
          index={item.originalIndex}
        />
      ))}
      {exam.footerContent}
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
                  <ObjectiveWebBlock
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
              {exam.headerContent}
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
                  <ObjectiveWebBlock
                    key={`${item.block.type}-${item.originalIndex}`}
                    block={item.block}
                    ctx={exam}
                    index={item.originalIndex}
                  />
                ),
              )}
              {exam.footerContent}
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
