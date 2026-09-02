import { z } from "zod";
import { assessmentAuthoringPackageSchema } from "@/domain/assessmentContract";
import { assessmentEvaluationInputSchema } from "@/domain/assessmentEvaluation";

// WebMCP uses this compact shape to teach agents the package contract. Domain
// parsers still enforce every omitted bound and return the repairable paths.
const agentSchemaOmittedKeywords = new Set([
  "default",
  "exclusiveMinimum",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "pattern",
]);

function compactAgentSchema(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => compactAgentSchema(entry, parentKey));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) =>
        parentKey === "properties" ||
        parentKey === "definitions" ||
        !agentSchemaOmittedKeywords.has(key))
      .map(([key, entry]) => [key, compactAgentSchema(entry, key)]),
  );
}

export function getAssessmentPackageJsonSchema() {
  const schema = z.toJSONSchema(assessmentAuthoringPackageSchema, {
    target: "draft-07",
    io: "input",
  });
  return compactAgentSchema(schema) as typeof schema;
}

export function getAssessmentEvaluationJsonSchema() {
  return z.toJSONSchema(assessmentEvaluationInputSchema, { target: "draft-07" });
}
