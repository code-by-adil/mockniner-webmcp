import { useRef, useState } from 'react';
import type { AssessmentEvaluation, AssessmentSubmission } from '@/domain/assessment';
import { ResultAction, ResultBreakdown, ResultScore, ResultsLayout } from '@/shared/ui/results/ResultsLayout';
import { AssessmentAnswerReview, type ReviewFilter } from './AssessmentAnswerReview';
import { AssessmentEvaluationPanel } from './AssessmentEvaluationPanel';
import { getAssessmentThemeStyle } from './assessmentTheme';

export function AssessmentResults(props: { submission: AssessmentSubmission; evaluation?: AssessmentEvaluation; onHome: () => void }) {
  return <AssessmentResultsView key={props.submission.attemptId} {...props} />;
}

function AssessmentResultsView({ submission, evaluation, onHome }: { submission: AssessmentSubmission; evaluation?: AssessmentEvaluation; onHome: () => void }) {
  const [review, setReview] = useState<{ filter: ReviewFilter; itemId?: string } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { result, package: assessment } = submission;
  const rubric = evaluation ? assessment.rubrics.find(entry => entry.id === evaluation.rubricId) : undefined;
  const awaitingFeedback = !evaluation && result.awaitingEvaluationCount > 0;
  const canReview = assessment.review.mode !== 'none';
  const showAnswers = assessment.review.mode === 'answers';
  const reviewLabel = showAnswers ? 'Review answers' : 'Review responses';
  const percentage = result.maximumScore ? Math.round(result.rawScore / result.maximumScore * 100) : null;
  const incorrect = result.itemResults.filter(item => item.answered && item.correct === false).length;
  const unanswered = result.totalItems - result.answeredCount;
  const resultById = new Map(result.itemResults.map(item => [item.itemId, item]));

  function openReview(filter: ReviewFilter = 'all', itemId?: string) {
    setReview({ filter, itemId });
    requestAnimationFrame(() => { contentRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); });
  }
  function closeReview() {
    setReview(null);
    requestAnimationFrame(() => { contentRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); });
  }

  return <ResultsLayout title={assessment.title} onBack={review ? closeReview : onHome} backLabel={review ? 'Back to results' : 'Back to practice'} style={getAssessmentThemeStyle(assessment.presentation.accent)}
    subtitle={review ? `${showAnswers ? 'Answer review' : 'Response review'} · ${result.totalItems} questions` : <><time dateTime={submission.submittedAt}>{new Date(submission.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time> · {assessment.parts.length} parts · {result.totalItems} questions</>}
    footer={assessment.metadata.disclaimer} compactHeading={review !== null}>
    <div ref={contentRef} tabIndex={-1} className="min-w-0 scroll-mt-6 outline-none">
      {review && canReview ? <AssessmentAnswerReview submission={submission} evaluation={evaluation} initialFilter={review.filter} initialItemId={review.itemId} /> : <>
        <div className={`grid min-w-0 gap-8 ${result.domains.length ? 'lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-10' : ''}`}>
          <div className="min-w-0">
            <ResultScore label={percentage !== null ? 'Correct answers' : evaluation ? 'Evaluation score' : 'Submission saved'}
              score={percentage !== null ? result.rawScore : evaluation ? evaluation.overallScore : <span className="text-3xl">{awaitingFeedback ? 'Ready for feedback' : 'Responses saved'}</span>}
              maximum={percentage !== null ? result.maximumScore : rubric?.scale.maximum}
              detail={percentage !== null ? `${percentage}% correct across objective questions` : undefined}
              metrics={[
                { label: 'Answered', value: result.answeredCount },
                { label: 'Unanswered', value: unanswered },
                ...(showAnswers && result.maximumScore > 0 ? [{ label: 'Incorrect', value: incorrect }] : []),
                ...(evaluation && percentage !== null ? [{ label: 'Evaluation score', value: `${evaluation.overallScore}${rubric ? ` / ${rubric.scale.maximum}` : ''}` }] : []),
                ...(awaitingFeedback ? [{ label: 'Awaiting feedback', value: result.awaitingEvaluationCount }] : []),
              ]}
              actions={canReview ? <>
                <ResultAction onClick={() => openReview()}>{reviewLabel}</ResultAction>
                {showAnswers && incorrect > 0 ? <button type="button" onClick={() => openReview('incorrect')} className="min-h-11 px-2 text-sm font-medium text-neutral-700 hover:text-neutral-950">Review mistakes</button> : unanswered > 0 ? <button type="button" onClick={() => openReview('unanswered')} className="min-h-11 px-2 text-sm font-medium text-neutral-700 hover:text-neutral-950">Review unanswered</button> : null}
              </> : undefined} />
            <ResultBreakdown title="Results by part" rows={assessment.parts.map(part => {
              const items = part.items.flatMap(item => resultById.get(item.id) ?? []);
              return { id: part.id, label: [part.groupTitle, part.title].filter(Boolean).join(' · '), detail: `${part.items.length} questions`,
                total: items.length, correct: showAnswers ? items.filter(item => item.correct === true).length : undefined, unanswered: items.filter(item => !item.answered).length,
                unscored: items.filter(item => item.correct === null).length,
                pending: evaluation ? 0 : items.filter(item => item.correct === null).length,
                onReview: canReview ? () => openReview('all', part.items[0].id) : undefined };
            })} />
          </div>
          {result.domains.length ? <aside aria-label="Performance by domain" className="min-w-0 lg:border-l lg:border-neutral-200 lg:pl-7">
            <details className="result-disclosure lg:hidden"><summary>Performance by domain</summary><DomainList submission={submission} /></details>
            <div className="hidden lg:block"><h2 className="mb-5 text-sm font-semibold">Performance by domain</h2><DomainList submission={submission} /></div>
          </aside> : null}
        </div>
        {awaitingFeedback ? <section className="mt-8 border-l-2 border-neutral-300 pl-4">
          <h2 className="text-base font-semibold">Get feedback on your responses</h2><p className="mt-1 text-sm leading-6 text-neutral-600">Ask your agent to evaluate this submission. Your feedback will appear here.</p>
        </section> : null}
        {evaluation ? <AssessmentEvaluationPanel evaluation={evaluation} rubric={rubric}
          itemLabels={Object.fromEntries(assessment.parts.flatMap(part => part.items.map((item, index) => [item.id, `Review ${[part.groupTitle, part.title].filter(Boolean).join(' · ')} · Question ${index + 1}`])))}
          onReviewItem={canReview ? itemId => openReview('all', itemId) : undefined} /> : null}
        {!canReview ? <p className="mt-6 text-sm text-neutral-600">Question review is not available for this assessment.</p> : null}
      </>}
    </div>
  </ResultsLayout>;
}

function DomainList({ submission }: { submission: AssessmentSubmission }) {
  return <dl className="space-y-4 py-3 lg:py-0">{submission.result.domains.map(domain => <div key={domain.domain} className="flex items-start justify-between gap-4 text-sm leading-5">
    <dt className="text-neutral-600 [overflow-wrap:anywhere]">{domain.domain}</dt><dd className="shrink-0 font-medium tabular-nums">{domain.correct}<span className="text-neutral-500"> / {domain.total}</span></dd>
  </div>)}</dl>;
}
