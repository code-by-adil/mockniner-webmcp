import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assessmentEvaluationInputSchema } from "@/domain/assessmentEvaluation";
import {
  getAssessmentEvaluationJsonSchema,
  getAssessmentPackageJsonSchema,
} from "./assessmentSchemas";

describe("assessment WebMCP schemas", () => {
  it("uses references to keep the authoring schema compact without removing fields", () => {
    const schema = getAssessmentPackageJsonSchema();
    const serialized = JSON.stringify(schema);

    expect(schema.definitions).toHaveProperty("AssessmentInteraction");
    expect(schema.definitions).toHaveProperty("AssessmentContentBlock");
    expect(schema.definitions).toHaveProperty("AssessmentRubric.properties.scale.properties.minimum");
    expect(schema.definitions).toHaveProperty("AssessmentRubric.properties.scale.properties.maximum");
    expect(serialized).toContain('"$ref"');
    expect(serialized.length).toBeLessThan(11_000);
    expect(schema.properties).not.toHaveProperty("source");
  });

  it("publishes the authoritative evaluation input schema without compaction", () => {
    expect(getAssessmentEvaluationJsonSchema()).toEqual(
      z.toJSONSchema(assessmentEvaluationInputSchema, { target: "draft-07" }),
    );
  });
});
