import { useEffect, useId, useRef } from 'react';
import { Check, Minus, X } from 'lucide-react';
import type { AssessmentEvaluation, AssessmentResult, AssessmentSubmission } from '@/domain/assessment';
import { getAssessmentPartResources } from '@/domain/assessmentSelectors';
import { AssessmentReviewContent } from './AssessmentReviewContent';
import { AssessmentReviewAnswer } from './AssessmentReviewAnswer';
import { AssessmentReviewFooter, type ReviewPart, type ReviewQuestion } from './AssessmentReviewFooter';
import { matchesAssessmentReviewFilter, permittedAssessmentReviewFilter, type AssessmentReviewFilter, type AssessmentReviewSelection } from '@/domain/assessmentReview';

type ItemResult = AssessmentResult['itemResults'][number];

function statusFor(result: ItemResult, showAnswers: boolean): { label: ReviewQuestion['status']; Icon: typeof Check; classes: string } {
  if (!result.answered) return { label: 'Unanswered', Icon: Minus, classes: 'border-neutral-300 bg-white text-neutral-600' };
  if (!showAnswers || result.correct === null) return { label: 'Response saved', Icon: Check, classes: 'border-neutral-300 bg-neutral-100 text-neutral-700' };
  return result.correct
    ? { label: 'Correct', Icon: Check, classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
    : { label: 'Incorrect', Icon: X, classes: 'border-red-200 bg-red-50 text-red-800' };
}

export function AssessmentAnswerReview({ submission, evaluation, selection, onSelectionChange }: {
  submission: AssessmentSubmission; evaluation?: AssessmentEvaluation;
  selection: AssessmentReviewSelection; onSelectionChange: (selection: AssessmentReviewSelection) => void;
}) {
  const { filter, itemId: selectedId } = selection;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const showAnswers = submission.package.review.mode === 'answers';
  const selectedFilter = permittedAssessmentReviewFilter(submission.package.review.mode, filter);
  const byId = new Map(submission.result.itemResults.map(result => [result.itemId, result]));
  const entries = submission.package.parts.flatMap(part => part.items.map((item, index) => ({ part, item, number: index + 1 }))).flatMap(({ part, item, number }) => {
    const result = byId.get(item.id);
    return result ? [{ part, item, result, number }] : [];
  });
  const visible = entries.filter(entry => matchesAssessmentReviewFilter(entry.result, selectedFilter));
  const active = visible.find(entry => entry.item.id === selectedId) ?? visible[0];
  const activeIndex = active ? visible.indexOf(active) : -1;
  const activeId = active?.item.id;
  const filters: { id: AssessmentReviewFilter; label: string }[] = [
    { id: 'all', label: 'All' }, ...(showAnswers ? [{ id: 'incorrect' as const, label: 'Incorrect' }] : []), { id: 'unanswered', label: 'Unanswered' },
  ];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeId, selection]);

  function selectQuestion(id: string) {
    onSelectionChange({ filter: selectedFilter, itemId: id });
    if (id === activeId) headingRef.current?.focus({ preventScroll: true });
  }

  const navigationParts: ReviewPart[] = submission.package.parts.flatMap(part => {
    const questions = visible.filter(entry => entry.part.id === part.id).map(entry => ({
      id: entry.item.id, number: entry.number, status: statusFor(entry.result, showAnswers).label,
    }));
    return questions.length ? [{ id: part.id, label: [part.groupTitle, part.title].filter(Boolean).join(' · '), total: part.items.length, questions }] : [];
  });

  if (submission.package.review.mode === 'none') return null;
  const resources = active ? getAssessmentPartResources(submission.package, active.part) : [];
  const annotations = evaluation?.annotations.filter(annotation => annotation.itemId === activeId) ?? [];
  const activeStatus = active ? statusFor(active.result, showAnswers) : null;

  return <section aria-label={showAnswers ? 'Answer review' : 'Response review'}>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-neutral-200">
      <div role="group" aria-label="Filter questions" className="flex flex-wrap gap-4 sm:gap-6">
        {filters.map(option => <button type="button" key={option.id} aria-pressed={option.id === selectedFilter}
          onClick={() => onSelectionChange({ filter: option.id })}
          className={`min-h-12 border-b-2 text-sm ${option.id === selectedFilter ? 'border-neutral-900 font-semibold text-neutral-950' : 'border-transparent text-neutral-600 hover:text-neutral-950'}`}>
          {option.label}<span className="ml-2 text-xs tabular-nums text-neutral-500">{entries.filter(entry => matchesAssessmentReviewFilter(entry.result, option.id)).length}</span>
        </button>)}
      </div>
      <p role="status" className={`${visible.length ? 'sr-only sm:not-sr-only' : 'pb-3'} text-sm text-neutral-600 sm:pb-0`}>{visible.length ? `${visible.length} of ${entries.length} ${entries.length === 1 ? 'question' : 'questions'}` : selectedFilter === 'incorrect' ? 'No incorrect answers.' : 'No unanswered questions.'}</p>
    </div>
    <div className="min-w-0">
        {active && activeStatus ? <article key={activeId} aria-label={`Question ${active.number}`} data-item-id={activeId}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs leading-5 text-neutral-600">{[active.part.groupTitle, active.part.title].filter(Boolean).join(' · ')}</p>
              <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">Question {active.number}<span className="ml-2 text-sm font-normal text-neutral-500">of {active.part.items.length}</span></h2>
              {active.item.domain ? <p className="mt-1 text-sm text-neutral-600">{active.item.domain}</p> : null}
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${activeStatus.classes}`}><activeStatus.Icon size={13} aria-hidden="true" />{activeStatus.label}</span>
          </div>
          {active.part.description || resources.length ? <details className="result-disclosure mb-5 border-b border-neutral-200 pb-1">
            <summary>{resources.length ? 'Instructions and references' : 'Part instructions'}</summary>
            {active.part.description ? <p className="pb-3 text-sm leading-6 text-neutral-700">{active.part.description}</p> : null}
            {resources.map(resource => <details key={resource.id} className="result-disclosure pb-3">
              <summary>{resource.title}</summary><AssessmentReviewContent blocks={resource.content} />
            </details>)}
          </details> : null}
          <div className={`grid min-w-0 gap-7 ${active.item.stimulus.length ? 'lg:grid-cols-2 lg:gap-10' : 'max-w-3xl'}`}>
            {active.item.stimulus.length ? <section aria-label={active.item.presentation?.stimulusLabel ?? 'Question material'} className="min-w-0 border-b border-neutral-200 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-10">
              {active.item.presentation?.stimulusLabel ? <h3 className="mb-3 text-sm font-medium text-neutral-600">{active.item.presentation.stimulusLabel}</h3> : null}
              <AssessmentReviewContent blocks={active.item.stimulus} />
            </section> : null}
            <div className="min-w-0 space-y-6">
              <AssessmentReviewContent blocks={active.item.prompt} />
              <AssessmentReviewAnswer item={active.item} response={submission.responses[active.item.id]} showAnswers={showAnswers} correct={active.result.correct} />
              {active.item.scoring.type === 'agent' && !evaluation ? <p className="border-t border-neutral-200 pt-4 text-sm leading-6 text-neutral-600">Awaiting feedback. Ask your agent to evaluate this submission.</p> : null}
              {annotations.length ? <section className="border-t border-neutral-200 pt-5" aria-label="Feedback on this response">
                <h3 className="mb-4 text-sm font-semibold">Feedback on this response</h3>
                <div className="space-y-5">{annotations.map((annotation, index) => <div key={index} className="text-sm leading-6">
                  <blockquote className="mb-2 border-l-2 border-neutral-300 pl-3 text-neutral-700">{annotation.originalText}</blockquote>
                  <p className="font-medium">{annotation.suggestion}</p><p className="mt-1 text-neutral-600">{annotation.explanation}</p>
                </div>)}</div>
              </section> : null}
            </div>
          </div>
        </article> : <div className="py-12 text-center text-sm text-neutral-600">Choose another filter to continue your review.</div>}
    </div>
    {active ? <AssessmentReviewFooter parts={navigationParts} selectedId={active.item.id} onSelect={selectQuestion}
      onPrevious={() => selectQuestion(visible[activeIndex - 1].item.id)} onNext={() => selectQuestion(visible[activeIndex + 1].item.id)}
      canPrevious={activeIndex > 0} canNext={activeIndex < visible.length - 1} showAnswers={showAnswers} /> : null}

  </section>;
}
