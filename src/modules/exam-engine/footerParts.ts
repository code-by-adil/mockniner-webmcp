import {
  getObjectiveBlockQuestionIds,
  type ObjectiveContentDocument,
} from "@/domain/objectiveContent";

export interface ObjectiveFooterPart {
  part: number;
  questionNumbers: number[];
}

export function buildObjectiveFooterParts(
  document: ObjectiveContentDocument,
): ObjectiveFooterPart[] {
  return document.parts.map((part) => ({
    part: part.id,
    questionNumbers: part.blocks.flatMap(getObjectiveBlockQuestionIds),
  }));
}
