import type { ReactElement } from "react";
import { ArrowLeft, Check, ClipboardCheck } from "lucide-react";
import type { AssessmentEvaluation, AssessmentSubmission } from "@/domain/assessment";
import { AssessmentLabBrand } from "@/shared/ui/global/AssessmentLabBrand";
import { AssessmentAnswerReview } from "./AssessmentAnswerReview";
import { AssessmentEvaluationPanel } from "./AssessmentEvaluationPanel";
import { getAssessmentThemeStyle } from "./assessmentTheme";

export function AssessmentResults({
  submission,
  evaluation,
  onHome,
}: {
  submission: AssessmentSubmission;
  evaluation?: AssessmentEvaluation;
  onHome: () => void;
}): ReactElement {
  const { result, package: assessment } = submission;
  const percentage = result.maximumScore
    ? Math.round(result.rawScore / result.maximumScore * 100)
    : null;
  const evaluationRubric = evaluation
    ? assessment.rubrics.find((rubric) => rubric.id === evaluation.rubricId)
    : undefined;
  const style = getAssessmentThemeStyle(assessment.presentation.accent);
  return (
    <div style={style} className="min-h-screen bg-neutral-100 text-neutral-950">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-8">
          <AssessmentLabBrand />
          <button type="button" onClick={onHome} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"><ArrowLeft size={15} /> Assessment library</button>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-8">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><Check size={14} /> Attempt saved locally</div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{assessment.title}</h1>
          <p className="mt-2 text-sm text-neutral-500">These results use your saved answers.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Objective score</div>
            <div className="mt-2 text-3xl font-extrabold">{result.rawScore}<span className="text-lg font-semibold text-neutral-400">/{result.maximumScore}</span></div>
            <div className="mt-1 text-xs text-neutral-500">{percentage === null ? "No deterministic items" : `${percentage}% correct`}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Answered</div>
            <div className="mt-2 text-3xl font-extrabold">{result.answeredCount}<span className="text-lg font-semibold text-neutral-400">/{result.totalItems}</span></div>
            <div className="mt-1 text-xs text-neutral-500">Across all assessment parts</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Evaluation</div>
            <div className="mt-2 text-2xl font-extrabold">{evaluation ? `${evaluation.overallScore}${evaluationRubric ? `/${evaluationRubric.scale.maximum}` : ""}` : result.awaitingEvaluationCount ? "Pending" : "Not needed"}</div>
            <div className="mt-1 text-xs text-neutral-500">{evaluation ? "Structured feedback attached" : result.awaitingEvaluationCount ? `${result.awaitingEvaluationCount} subjective response${result.awaitingEvaluationCount === 1 ? "" : "s"}` : "All items scored locally"}</div>
          </div>
        </div>

        {assessment.metadata.disclaimer ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            {assessment.metadata.disclaimer}
          </div>
        ) : null}

        {result.domains.length ? (
          <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Performance by domain</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {result.domains.map((domain) => (
                <div key={domain.domain} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-semibold text-neutral-800">{domain.domain}</span>
                    <span className="font-bold tabular-nums">{domain.correct}/{domain.total}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200"><div className="h-full rounded-full bg-[var(--exam-accent)]" style={{ width: `${domain.total ? domain.correct / domain.total * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {evaluation ? (
          <AssessmentEvaluationPanel evaluation={evaluation} rubric={evaluationRubric} />
        ) : result.awaitingEvaluationCount ? (
          <section className="mt-8 flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <ClipboardCheck className="mt-0.5 text-[var(--exam-accent)]" size={20} />
            <div><h2 className="font-bold">Ready for agent evaluation</h2><p className="mt-1 text-sm leading-6 text-neutral-600">Ask your agent to evaluate the latest assessment submission. The tool returns the exact rubric and accepts structured feedback for this immutable attempt.</p></div>
          </section>
        ) : null}

        {assessment.review.mode === "none" ? null : <AssessmentAnswerReview submission={submission} />}
      </main>
    </div>
  );
}
