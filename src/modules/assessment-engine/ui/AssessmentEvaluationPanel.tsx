import type { ReactElement } from "react";
import { Sparkles } from "lucide-react";
import type { AssessmentEvaluation, AssessmentRubric } from "@/domain/assessment";

export function AssessmentEvaluationPanel({
  evaluation,
  rubric,
}: {
  evaluation: AssessmentEvaluation;
  rubric?: AssessmentRubric;
}): ReactElement {
  const criterionById = new Map(
    rubric?.criteria.map((criterion) => [criterion.id, criterion] as const) ?? [],
  );

  return (
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-[var(--exam-accent)]" />
        <h2 className="text-lg font-bold">Agent evaluation</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-neutral-700">{evaluation.summary}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {evaluation.criteria.map((criterion) => (
          <div
            key={criterion.criterionId}
            className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
          >
            <div className="font-semibold text-neutral-900">
              {criterionById.get(criterion.criterionId)?.label ?? criterion.criterionId}
              {" · "}
              {criterion.score}
            </div>
            <p className="mt-1 text-sm leading-6 text-neutral-600">{criterion.feedback}</p>
            {criterion.evidence.length ? (
              <ul className="mt-3 space-y-1 text-xs leading-5 text-neutral-500">
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
          <h3 className="text-sm font-bold text-amber-800">Next improvements</h3>
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
                className="rounded-xl border border-neutral-200 p-4 text-sm"
              >
                <div className="font-semibold text-neutral-800">
                  {annotation.itemId}: “{annotation.originalText}”
                </div>
                <div className="mt-1 text-neutral-700">
                  Suggestion: {annotation.suggestion}
                </div>
                <div className="mt-1 text-neutral-500">{annotation.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
