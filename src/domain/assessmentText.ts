export function normalizeAssessmentText(value: string, ignorePunctuation = false): string {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return ignorePunctuation ? normalized.replace(/[.,!?;:'"()]/g, "") : normalized;
}

export function assessmentAnswerFitsLimit(answer: string, maximum: number, ignorePunctuation = false): boolean {
  const normalized = normalizeAssessmentText(answer, ignorePunctuation);
  const candidates = [answer.trim().replace(/\s+/g, " "), normalized];
  return candidates.some(candidate => candidate.length <= maximum && candidate.trim().length > 0 &&
    normalizeAssessmentText(candidate, ignorePunctuation) === normalized);
}
