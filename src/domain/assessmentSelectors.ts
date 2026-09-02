import type {
  AssessmentItem,
  AssessmentPackage,
  AssessmentPart,
  AssessmentResource,
  AssessmentTool,
} from "./assessmentContract";

export function findAssessmentPart(
  assessment: AssessmentPackage,
  partId: string | null,
): AssessmentPart | undefined {
  return assessment.parts.find((part) => part.id === partId);
}

export function findAssessmentItem(
  part: AssessmentPart,
  itemId: string | null,
): AssessmentItem | undefined {
  return part.items.find((item) => item.id === itemId);
}

export function getAssessmentPartResources(
  assessment: AssessmentPackage,
  part: AssessmentPart,
): AssessmentResource[] {
  return part.tools.flatMap((tool) => {
    if (tool.type !== "reference_document") return [];
    const resource = assessment.resources.find((candidate) => candidate.id === tool.resourceId);
    if (!resource) {
      throw new Error(`Assessment resource ${tool.resourceId} was not found.`);
    }
    return [resource];
  });
}

export function getAssessmentItemLayout(
  part: AssessmentPart,
  item: AssessmentItem,
): "single" | "split" {
  return item.presentation?.layout ?? part.defaultLayout;
}

export function assessmentPartHasTool(
  part: Pick<AssessmentPart, "tools">,
  type: AssessmentTool["type"],
): boolean {
  return part.tools.some((tool) => tool.type === type);
}
