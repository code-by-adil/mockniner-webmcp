import { z } from "zod";
import type {
  AssessmentItem,
  AssessmentPackage,
  CandidateAssessmentPackage,
} from "./assessmentContract";

export type AssessmentResponse = string | string[] | Record<string, string>;
export type AssessmentResponseMap = Record<string, AssessmentResponse>;

const assessmentResponseSchema = z.union([
  z.string(), z.array(z.string()), z.record(z.string(), z.string()),
]);
export const assessmentResponseMapSchema: z.ZodType<AssessmentResponseMap> =
  z.record(z.string(), assessmentResponseSchema);

type AssessmentItemResult = {
  itemId: string;
  partId: string;
  domain?: string;
  answered: boolean;
  correct: boolean | null;
};
export type AssessmentResult = {
  rawScore: number;
  maximumScore: number;
  answeredCount: number;
  totalItems: number;
  awaitingEvaluationCount: number;
  itemResults: AssessmentItemResult[];
  domains: Array<{ domain: string; correct: number; total: number }>;
};

export const assessmentResultSchema: z.ZodType<AssessmentResult> = z.strictObject({
  rawScore: z.number().int().nonnegative(),
  maximumScore: z.number().int().nonnegative(),
  answeredCount: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  awaitingEvaluationCount: z.number().int().nonnegative(),
  itemResults: z.array(z.strictObject({
    itemId: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/),
    partId: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/),
    domain: z.string().optional(),
    answered: z.boolean(),
    correct: z.boolean().nullable(),
  })),
  domains: z.array(z.strictObject({
    domain: z.string().min(1), correct: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })),
});

function normalizeText(value: string, ignorePunctuation = false): string {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return ignorePunctuation ? normalized.replace(/[.,!?;:'"()]/g, "") : normalized;
}

function parseNumber(value: string): number | null {
  const normalized = value.trim();
  const fraction = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
      ? numerator / denominator
      : null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function hasAssessmentResponse(value: AssessmentResponse | undefined): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && Object.values(value).some((entry) => entry.trim()));
}

export type AssessmentResponseGuidance = {
  instruction: string;
  issue?: string;
};

function selectionInstruction(minimum?: number, maximum?: number): string {
  if (minimum !== undefined && maximum !== undefined && minimum === maximum) {
    return `Choose exactly ${minimum} ${minimum === 1 ? "answer" : "answers"}.`;
  }
  if (minimum !== undefined && maximum !== undefined) {
    return `Choose ${minimum} to ${maximum} answers.`;
  }
  if (minimum !== undefined) return `Choose at least ${minimum} answers.`;
  if (maximum !== undefined) return `Choose up to ${maximum} answers.`;
  return "Select all that apply.";
}

function wordInstruction(minimum?: number, maximum?: number): string {
  if (minimum !== undefined && maximum !== undefined) {
    return `Write ${minimum} to ${maximum} words.`;
  }
  if (minimum !== undefined) return `Write at least ${minimum} words.`;
  if (maximum !== undefined) return `Write no more than ${maximum} words.`;
  return "Write your response.";
}

export function getAssessmentResponseGuidance(
  item: AssessmentItem,
  response: AssessmentResponse | undefined,
): AssessmentResponseGuidance {
  const interaction = item.interaction;
  if (interaction.type === "single_choice") return { instruction: "Choose one answer." };
  if (interaction.type === "multiple_choice") {
    const count = Array.isArray(response) ? response.length : 0;
    const { minimumSelections: minimum, maximumSelections: maximum } = interaction;
    return {
      instruction: selectionInstruction(minimum, maximum),
      ...(minimum !== undefined && count < minimum
        ? { issue: `Select ${minimum - count} more ${minimum - count === 1 ? "answer" : "answers"}.` }
        : maximum !== undefined && count > maximum
          ? { issue: `Remove ${count - maximum} ${count - maximum === 1 ? "answer" : "answers"}.` }
          : {}),
    };
  }
  if (interaction.type === "text_entry") {
    const length = typeof response === "string" ? response.length : 0;
    return {
      instruction: interaction.maximumCharacters
        ? `Enter no more than ${interaction.maximumCharacters} characters.`
        : "Enter a short answer.",
      ...(interaction.maximumCharacters && length > interaction.maximumCharacters
        ? { issue: `Remove ${length - interaction.maximumCharacters} characters.` }
        : {}),
    };
  }
  if (interaction.type === "numeric_entry") {
    return { instruction: "Enter an integer, decimal, or fraction." };
  }
  if (interaction.type === "extended_text") {
    const value = typeof response === "string" ? response.trim() : "";
    const count = value ? value.split(/\s+/).length : 0;
    const { minimumWords: minimum, maximumWords: maximum } = interaction;
    return {
      instruction: wordInstruction(minimum, maximum),
      ...(minimum !== undefined && count < minimum
        ? { issue: `Write ${minimum - count} more ${minimum - count === 1 ? "word" : "words"}.` }
        : maximum !== undefined && count > maximum
          ? { issue: `Remove ${count - maximum} ${count - maximum === 1 ? "word" : "words"}.` }
          : {}),
    };
  }
  if (interaction.type === "grouped_choice") {
    const completed = response && !Array.isArray(response) && typeof response === "object"
      ? interaction.groups.filter((group) => Boolean(response[group.id])).length
      : 0;
    const remaining = interaction.groups.length - completed;
    return {
      instruction: "Choose one answer for each group.",
      ...(remaining > 0
        ? { issue: `Complete ${remaining} more ${remaining === 1 ? "group" : "groups"}.` }
        : {}),
    };
  }
  const completed = response && !Array.isArray(response) && typeof response === "object"
    ? interaction.prompts.filter((prompt) => Boolean(response[prompt.id])).length
    : 0;
  return {
    instruction: "Choose one match for every prompt.",
    ...(completed < interaction.prompts.length
      ? { issue: `Complete ${interaction.prompts.length - completed} more ${interaction.prompts.length - completed === 1 ? "match" : "matches"}.` }
      : {}),
  };
}

function scoreItem(item: AssessmentItem, response: AssessmentResponse | undefined): boolean | null {
  if (item.scoring.type === "agent") return null;
  if (!hasAssessmentResponse(response)) return false;
  switch (item.scoring.type) {
    case "exact":
      return typeof response === "string" && normalizeText(response) === normalizeText(item.scoring.answer);
    case "aliases":
      if (typeof response !== "string") return false;
      return item.scoring.answers.some((answer) =>
        normalizeText(response, item.scoring.type === "aliases" && item.scoring.ignorePunctuation) ===
          normalizeText(answer, item.scoring.type === "aliases" && item.scoring.ignorePunctuation));
    case "set":
      return Array.isArray(response) && response.length === item.scoring.answers.length &&
        item.scoring.answers.every((answer) => response.includes(answer));
    case "numeric": {
      if (typeof response !== "string") return false;
      const numeric = parseNumber(response);
      return numeric !== null && Math.abs(numeric - item.scoring.answer) <= (item.scoring.tolerance ?? 0);
    }
    case "mapping":
      return Boolean(
        response && !Array.isArray(response) && typeof response === "object" &&
        Object.keys(item.scoring.answers).length === Object.keys(response).length &&
        Object.entries(item.scoring.answers).every(([key, answer]) => response[key] === answer),
      );
  }
}

export function gradeAssessment(
  assessment: AssessmentPackage,
  responses: AssessmentResponseMap,
): AssessmentResult {
  const itemResults: AssessmentItemResult[] = assessment.parts.flatMap((part) =>
    part.items.map((item) => {
      const response = responses[item.id];
      return {
        itemId: item.id,
        partId: part.id,
        ...(item.domain ? { domain: item.domain } : {}),
        answered: hasAssessmentResponse(response),
        correct: scoreItem(item, response),
      };
    }));
  const deterministic = itemResults.filter((result) => result.correct !== null);
  const domainMap = new Map<string, { correct: number; total: number }>();
  deterministic.forEach((result) => {
    if (!result.domain) return;
    const current = domainMap.get(result.domain) ?? { correct: 0, total: 0 };
    current.total += 1;
    if (result.correct) current.correct += 1;
    domainMap.set(result.domain, current);
  });
  return {
    rawScore: deterministic.filter((result) => result.correct).length,
    maximumScore: deterministic.length,
    answeredCount: itemResults.filter((result) => result.answered).length,
    totalItems: itemResults.length,
    awaitingEvaluationCount: itemResults.filter((result) => result.correct === null && result.answered).length,
    itemResults,
    domains: [...domainMap.entries()].map(([domain, result]) => ({ domain, ...result })),
  };
}

export function getAssessmentItemCount(assessment: AssessmentPackage): number {
  return assessment.parts.reduce((total, part) => total + part.items.length, 0);
}

export function getAssessmentDurationSeconds(assessment: AssessmentPackage): number {
  return assessment.parts.reduce((total, part) => total + (part.durationSeconds ?? 0), 0);
}

export function stripAssessmentAnswers(assessment: AssessmentPackage): CandidateAssessmentPackage {
  return {
    ...assessment,
    parts: assessment.parts.map((part) => ({
      ...part,
      items: part.items.map(({ scoring: _scoring, ...item }) => item),
    })),
  };
}
