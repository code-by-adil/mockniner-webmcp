import type React from "react";
import type {
  TestDefinition,
  TestPartDefinition,
  TestPartProps,
} from "../exam/types";
import type {
  ObjectiveCompletionType,
  ObjectiveContentBlock,
  ObjectiveContentDocument,
} from "./types";
import { getObjectiveAnswerKey } from "@/domain/objectiveContent";

export type ObjectiveBlockType = ObjectiveContentBlock["type"];
type ObjectiveCompletionLayout = "list" | "table" | "flowchart";
type ObjectiveCompletionDensity = "comfortable" | "compact";

type ObjectiveCompletionViewModel = {
  layout: ObjectiveCompletionLayout;
  density: ObjectiveCompletionDensity;
  columns: [string, string, string];
};

export type ObjectiveBlockListItem = {
  block: ObjectiveContentBlock;
  originalIndex: number;
};

type ObjectiveSplitPartBlocks = {
  passageBlocks: ObjectiveBlockListItem[];
  questionBlocks: ObjectiveBlockListItem[];
};

type ObjectivePartComponentFactory = (
  part: ObjectiveContentDocument["parts"][number],
  document: ObjectiveContentDocument,
) => React.ComponentType<TestPartProps>;

export function toObjectiveBlockListItems(
  blocks: ObjectiveContentBlock[],
): ObjectiveBlockListItem[] {
  return blocks.map((block, index) => ({ block, originalIndex: index }));
}

function isObjectivePassageBlock(block: ObjectiveContentBlock): boolean {
  return (
    block.type === "passage" || block.type === "text" || block.type === "spacer"
  );
}

export function splitObjectivePartBlocks(
  blocks: ObjectiveContentBlock[],
): ObjectiveSplitPartBlocks {
  const passageBlocks: ObjectiveBlockListItem[] = [];
  const questionBlocks: ObjectiveBlockListItem[] = [];
  let hasSeenQuestionBlock = false;

  blocks.forEach((block, originalIndex) => {
    if (!hasSeenQuestionBlock && isObjectivePassageBlock(block)) {
      passageBlocks.push({ block, originalIndex });
      return;
    }
    hasSeenQuestionBlock = true;
    questionBlocks.push({ block, originalIndex });
  });

  return { passageBlocks, questionBlocks };
}

function getObjectiveCompletionLayout(
  block: Extract<ObjectiveContentBlock, { type: "completion_questions" }>,
): ObjectiveCompletionLayout {
  if (block.presentation?.layout) return block.presentation.layout;
  return getDefaultCompletionLayout(block.completionType);
}

function getDefaultCompletionLayout(
  completionType: ObjectiveCompletionType,
): ObjectiveCompletionLayout {
  if (completionType === "table_completion") return "table";
  if (completionType === "flow_chart_completion") return "flowchart";
  return "list";
}

export function normalizeObjectiveCompletionBlock(
  block: Extract<ObjectiveContentBlock, { type: "completion_questions" }>,
): ObjectiveCompletionViewModel {
  const [
    prefixHeader = "Prompt",
    answerHeader = "Answer",
    suffixHeader = "Notes",
  ] = block.presentation?.columns ?? [];

  return {
    layout: getObjectiveCompletionLayout(block),
    density: block.presentation?.density ?? "comfortable",
    columns: [prefixHeader, answerHeader, suffixHeader],
  };
}

export function createObjectiveTestDefinition(
  document: ObjectiveContentDocument,
  createPartComponent: ObjectivePartComponentFactory,
): TestDefinition {
  const parts: TestPartDefinition[] = document.parts.map((part) => ({
    id: part.id,
    label: part.label,
    instructionRange: part.instructionRange,
    instructionText: part.instructionText,
    Component: createPartComponent(part, document),
  }));

  return {
    id: document.id,
    name: document.name,
    parts,
    answerKey: getObjectiveAnswerKey(document),
    ...(document.listeningAudio
      ? { listeningAudio: { key: document.listeningAudio.key } }
      : {}),
  };
}
