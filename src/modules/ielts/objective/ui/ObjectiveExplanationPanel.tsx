import type { ObjectiveExplanation } from '@/domain/objectiveExplanation';

export function ObjectiveExplanationPanel({ explanation }: { explanation?: ObjectiveExplanation }) {
  if (!explanation) return null;
  return <aside aria-label={`Agent explanation for question ${explanation.questionId}`} className="max-h-44 overflow-y-auto border-b border-blue-200 bg-blue-50/50 px-4 py-3 text-sm sm:px-6">
    <h2 className="font-semibold text-neutral-900">Agent explanation · Question {explanation.questionId}</h2>
    <p className="mt-1 whitespace-pre-wrap leading-6 text-neutral-700">{explanation.explanation}</p>
    <p className="mt-1 text-xs text-neutral-500">Revision {explanation.revision} · Saved with this attempt</p>
  </aside>;
}
