import type { ReactElement } from "react";
import type { AssessmentEvaluation, AssessmentRubric } from "@/domain/assessment";

export function AssessmentEvaluationPanel({
  evaluation,
  rubric,
  itemLabels,
  onReviewItem,
}: {
  evaluation: AssessmentEvaluation;
  rubric?: AssessmentRubric;
  itemLabels?: Record<string, string>;
  onReviewItem?: (itemId: string) => void;
}): ReactElement {
  const criterionById = new Map(
    rubric?.criteria.map((criterion) => [criterion.id, criterion] as const) ?? [],
  );

  return (
    <section className="mt-8 border-t border-neutral-200 pt-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Agent evaluation</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-neutral-700">{evaluation.summary}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {evaluation.criteria.map((criterion) => (
          <div
            key={criterion.criterionId}
            className="border-l-2 border-neutral-200 py-2 pl-4"
          >
            <div className="font-semibold text-neutral-900">
              {criterionById.get(criterion.criterionId)?.label ?? criterion.criterionId}
              {" · "}
              {criterion.score}
            </div>
            <p className="mt-1 text-sm leading-6 text-neutral-600">{criterion.feedback}</p>
            {criterion.evidence.length ? (
              <ul className="mt-3 space-y-1 text-sm leading-6 text-neutral-600">
                {criterion.evidence.map((evidence) => (
                  <li key={evidence}>“{evidence}”</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-emerald-800">Strengths</h3>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-neutral-600">
            {evaluation.strengths.map((strength) => (
              <li key={strength}>• {strength}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold text-neutral-800">Next improvements</h3>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-neutral-600">
            {evaluation.improvements.map((improvement) => (
              <li key={improvement}>• {improvement}</li>
            ))}
          </ul>
        </div>
      </div>
      {evaluation.annotations.length ? (
        <div className="mt-5 border-t border-neutral-200 pt-5">
          <h3 className="text-sm font-bold">Response annotations</h3>
          <div className="mt-3 space-y-3">
            {evaluation.annotations.map((annotation, index) => (
              <div
                key={`${annotation.itemId}-${index}`}
                className="border-l-2 border-neutral-200 pl-4 text-sm leading-6"
              >
                {onReviewItem ? <button type="button" className="mb-2 min-h-9 text-sm font-semibold underline underline-offset-4" onClick={() => onReviewItem(annotation.itemId)}>{itemLabels?.[annotation.itemId] ?? 'Review response'}</button> : null}
                <blockquote className="text-neutral-700">{annotation.originalText}</blockquote>
                <div className="mt-1 text-neutral-700">
                  Suggestion: {annotation.suggestion}
                </div>
                <div className="mt-1 text-neutral-600">{annotation.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
