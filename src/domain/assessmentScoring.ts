import type {
  AssessmentItem,
  AssessmentItemResult,
  AssessmentPackage,
  AssessmentResponse,
  AssessmentResponseMap,
  AssessmentResult,
  CandidateAssessmentPackage,
} from "./assessmentContract";

function normalizeText(value: string, ignorePunctuation = false): string {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return ignorePunctuation ? normalized.replace(/[.,!?;:'"()]/g, "") : normalized;
}

export function hasAssessmentResponse(value: AssessmentResponse | undefined): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && Object.values(value).some((entry) => entry.trim()));
}

function scoreItem(item: AssessmentItem, response: AssessmentResponse | undefined): boolean | null {
  if (item.scoring.type === "agent") return null;
  if (!hasAssessmentResponse(response)) return false;
  switch (item.scoring.type) {
    case "exact":
      return typeof response === "string" &&
        normalizeText(response) === normalizeText(item.scoring.answer);
    case "aliases":
      if (typeof response !== "string") return false;
      return item.scoring.answers.some((answer) =>
        normalizeText(response, item.scoring.type === "aliases" && item.scoring.ignorePunctuation) ===
          normalizeText(answer, item.scoring.type === "aliases" && item.scoring.ignorePunctuation)
      );
    case "set":
      return Array.isArray(response) &&
        response.length === item.scoring.answers.length &&
        item.scoring.answers.every((answer) => response.includes(answer));
    case "numeric": {
      if (typeof response !== "string") return false;
      const numeric = Number(response.trim());
      return Number.isFinite(numeric) &&
        Math.abs(numeric - item.scoring.answer) <= (item.scoring.tolerance ?? 0);
    }
    case "mapping":
      return Boolean(
        response &&
        !Array.isArray(response) &&
        typeof response === "object" &&
        Object.entries(item.scoring.answers).every(([key, answer]) => response[key] === answer),
      );
  }
}

export function gradeAssessment(
  assessment: AssessmentPackage,
  responses: AssessmentResponseMap,
): AssessmentResult {
  const itemResults: AssessmentItemResult[] = [];
  assessment.sections.forEach((section) => {
    section.modules.forEach((module) => {
      module.items.forEach((item) => {
        const response = responses[item.id];
        itemResults.push({
          itemId: item.id,
          sectionId: section.id,
          moduleId: module.id,
          ...(item.domain ? { domain: item.domain } : {}),
          answered: hasAssessmentResponse(response),
          correct: scoreItem(item, response),
        });
      });
    });
  });

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
    awaitingEvaluationCount: itemResults.filter(
      (result) => result.correct === null && result.answered,
    ).length,
    itemResults,
    domains: [...domainMap.entries()].map(([domain, result]) => ({ domain, ...result })),
  };
}

export function getAssessmentItemCount(assessment: AssessmentPackage): number {
  return assessment.sections.reduce(
    (total, section) => total + section.modules.reduce(
      (sectionTotal, module) => sectionTotal + module.items.length,
      0,
    ),
    0,
  );
}

export function getAssessmentDurationSeconds(assessment: AssessmentPackage): number {
  return assessment.sections.reduce(
    (total, section) => total + section.modules.reduce(
      (sectionTotal, module) => sectionTotal + (module.durationSeconds ?? 0),
      0,
    ),
    0,
  );
}

export function stripAssessmentAnswers(assessment: AssessmentPackage): CandidateAssessmentPackage {
  return {
    ...assessment,
    sections: assessment.sections.map((section) => ({
      ...section,
      modules: section.modules.map((module) => ({
        ...module,
        items: module.items.map(({ scoring: _scoring, ...item }) => item),
      })),
    })),
  };
}

