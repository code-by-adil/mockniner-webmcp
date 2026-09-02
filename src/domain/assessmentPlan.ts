import type {
  AssessmentItem,
  AssessmentPackage,
  AssessmentPart,
  AssessmentResource,
  AssessmentTool,
} from "./assessmentContract";

export type CompiledAssessmentItem = AssessmentItem & {
  numberInPart: number;
  layout: "single" | "split";
};

export type CompiledAssessmentPart = Omit<AssessmentPart, "items"> & {
  items: CompiledAssessmentItem[];
  resources: AssessmentResource[];
};

export type AssessmentPlan = {
  source: AssessmentPackage;
  parts: CompiledAssessmentPart[];
};

export function compileAssessment(assessment: AssessmentPackage): AssessmentPlan {
  const resources = new Map(assessment.resources.map((resource) => [resource.id, resource]));
  const parts = assessment.parts.map((part): CompiledAssessmentPart => {
    const resolvedResources = part.tools.flatMap((tool) => {
      if (tool.type !== "reference_document") return [];
      const resource = resources.get(tool.resourceId);
      if (!resource) {
        throw new Error(`Assessment resource ${tool.resourceId} was not found during compilation.`);
      }
      return [resource];
    });
    return {
      ...part,
      resources: resolvedResources,
      items: part.items.map((item, itemIndex) => {
        return {
          ...item,
          numberInPart: itemIndex + 1,
          layout: item.presentation?.layout ?? part.defaultLayout,
        };
      }),
    };
  });
  return { source: assessment, parts };
}

export function findPlanPart(
  plan: AssessmentPlan,
  partId: string | null,
): CompiledAssessmentPart | undefined {
  return plan.parts.find((part) => part.id === partId);
}

export function findPlanItem(
  part: CompiledAssessmentPart,
  itemId: string | null,
): CompiledAssessmentItem | undefined {
  return part.items.find((item) => item.id === itemId);
}

export function partHasTool(
  part: Pick<CompiledAssessmentPart, "tools">,
  type: AssessmentTool["type"],
): boolean {
  return part.tools.some((tool) => tool.type === type);
}
