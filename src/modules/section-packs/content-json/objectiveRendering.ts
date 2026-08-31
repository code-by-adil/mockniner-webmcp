import type {
  ObjectiveCompletionType,
  ObjectiveContentBlock,
} from "@/domain/objectiveContent";

type ObjectiveCompletionLayout = "list" | "table" | "flowchart";

export type ObjectiveBlockListItem = {
  block: ObjectiveContentBlock;
  originalIndex: number;
};

export function toObjectiveBlockListItems(
  blocks: ObjectiveContentBlock[],
): ObjectiveBlockListItem[] {
  return blocks.map((block, originalIndex) => ({ block, originalIndex }));
}

function isPassageBlock(block: ObjectiveContentBlock): boolean {
  return (
    block.type === "passage" || block.type === "text" || block.type === "spacer"
  );
}

export function splitObjectivePartBlocks(blocks: ObjectiveContentBlock[]) {
  const passageBlocks: ObjectiveBlockListItem[] = [];
  const questionBlocks: ObjectiveBlockListItem[] = [];
  let hasSeenQuestion = false;

  blocks.forEach((block, originalIndex) => {
    if (!hasSeenQuestion && isPassageBlock(block)) {
      passageBlocks.push({ block, originalIndex });
    } else {
      hasSeenQuestion = true;
      questionBlocks.push({ block, originalIndex });
    }
  });

  return { passageBlocks, questionBlocks };
}

function defaultCompletionLayout(
  completionType: ObjectiveCompletionType,
): ObjectiveCompletionLayout {
  if (completionType === "table_completion") return "table";
  if (completionType === "flow_chart_completion") return "flowchart";
  return "list";
}

export function normalizeObjectiveCompletionBlock(
  block: Extract<ObjectiveContentBlock, { type: "completion_questions" }>,
) {
  const [
    prefixHeader = "Prompt",
    answerHeader = "Answer",
    suffixHeader = "Notes",
  ] = block.presentation?.columns ?? [];

  return {
    layout:
      block.presentation?.layout ?? defaultCompletionLayout(block.completionType),
    density: block.presentation?.density ?? "comfortable",
    columns: [prefixHeader, answerHeader, suffixHeader] as const,
  };
}
