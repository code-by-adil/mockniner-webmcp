import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ObjectiveContentDocument } from '@/domain/objectiveContent';
import type { ObjectiveSubmission } from '@/domain/types';
import { buildObjectiveFooterParts } from '@/modules/ielts/exam/footerParts';
import { ObjectivePartView } from '@/modules/ielts/objective/ui/ObjectivePartView';
import { AssessmentLabBrand } from '@/shared/ui/global/AssessmentLabBrand';
import { scrollIntoViewNearest } from '@/shared/ui/exam/scrollIntoViewNearest';
import { ObjectiveExplanationPanel } from '@/modules/ielts/objective/ui/ObjectiveExplanationPanel';
import type { ObjectiveExplanation } from '@/domain/objectiveExplanation';
import { findObjectiveQuestion } from '@/shared/ui/exam/findObjectiveQuestion';

const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40';

export function ReadingAttemptReview({ document: content, submission, currentPart, onPartChange, onExit, backLabel, selectedQuestionId, onQuestionSelect, explanations = [], focusRequest }: {
  document: ObjectiveContentDocument;
  submission: ObjectiveSubmission;
  currentPart: number;
  onPartChange: (part: number) => void;
  onExit: () => void;
  backLabel: string;
  selectedQuestionId?: number | null;
  onQuestionSelect: (questionId: number) => void;
  explanations?: ObjectiveExplanation[];
  focusRequest?: object;
}) {
  const { result, answers } = submission;
  const rootRef = useRef<HTMLDivElement>(null);
  const selection = selectedQuestionId ?? null;
  const parts = useMemo(() => buildObjectiveFooterParts(content), [content]);
  const questions = useMemo(() => parts.flatMap(part => part.questionNumbers.map(question => ({ question, part: part.part }))), [parts]);
  const correct = new Set(result.correctQuestionIds);
  const mistakes = questions.filter(({ question }) => !correct.has(question));
  const part = content.parts.find(part => part.id === currentPart)!;
  const partQuestions = parts.find(part => part.part === currentPart)!.questionNumbers;
  const selected = selection && partQuestions.includes(selection) ? selection : null;
  const unanswered = result.total - result.answered;
  const incorrect = result.answered - result.raw;

  function status(question: number) {
    return correct.has(question) ? 'Correct' : answers[question]?.trim() ? 'Incorrect' : 'Unanswered';
  }

  function jumpMistake(direction: 'previous' | 'next') {
    const anchor = selected ?? (direction === 'next' ? partQuestions[0]! - 1 : partQuestions[0]!);
    const target = direction === 'next'
      ? mistakes.find(entry => entry.question > anchor) ?? mistakes[0]
      : mistakes.findLast(entry => entry.question < anchor) ?? mistakes.at(-1);
    if (target) onQuestionSelect(target.question);
  }

  useEffect(() => {
    if (!selection || !partQuestions.includes(selection)) return;
    const question = selection;
    const node = rootRef.current ? findObjectiveQuestion(rootRef.current, question) : null;
    if (!node) return;
    const target = node instanceof HTMLInputElement && node.disabled ? node.parentElement! : node;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    void scrollIntoViewNearest(target, { block: 'center', behavior: 'auto' });
    target.classList.add('target-highlight');
    return () => target.classList.remove('target-highlight');
  }, [selection, partQuestions, focusRequest]);

  return <div ref={rootRef} className="flex h-dvh min-w-0 flex-col overflow-hidden bg-white text-neutral-900">
    <header className="shrink-0 border-b border-neutral-200 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <AssessmentLabBrand />
        <button type="button" onClick={onExit} className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2">
          <ArrowLeft size={16} aria-hidden="true" />{backLabel}
        </button>
      </div>
    </header>
    <section aria-label="Reading review summary" className="shrink-0 border-b border-neutral-200 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
        <h1 className="text-lg font-semibold">Reading review</h1>
        <p className="text-sm text-neutral-700"><strong className="font-semibold text-neutral-950">{result.raw}/{result.total} correct</strong><span className="mx-2" aria-hidden="true">·</span>Estimated band {result.band.toFixed(1)}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs text-neutral-600">{incorrect} incorrect · {unanswered} unanswered</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Previous mistake" disabled={!mistakes.length} onClick={() => jumpMistake('previous')} className={buttonClass}><ArrowLeft size={14} aria-hidden="true" /><span>Previous<span className="hidden sm:inline"> mistake</span></span></button>
          <button type="button" aria-label="Next mistake" disabled={!mistakes.length} onClick={() => jumpMistake('next')} className={buttonClass}><span>Next<span className="hidden sm:inline"> mistake</span></span><ArrowRight size={14} aria-hidden="true" /></button>
        </div>
      </div>
      <p role="status" className="mt-2 text-xs text-neutral-600">{selected ? `Question ${selected} · ${status(selected)}` : mistakes.length ? 'Review incorrect and unanswered questions.' : 'All answers correct.'}</p>
    </section>
    <ObjectiveExplanationPanel explanation={explanations.find(entry => entry.questionId === selected)} />
    <main aria-label="Saved Reading answers" className="relative min-h-0 flex-1">
      <ObjectivePartView part={part} section="reading" answers={answers} onAnswerChange={() => undefined} isReviewMode />
    </main>
    <footer className="shrink-0 border-t border-neutral-200 bg-white px-3 py-2 sm:px-6">
      <nav aria-label="Reading passages" className="mb-2 flex gap-2">
        {parts.map(part => <button key={part.part} type="button" onClick={() => onPartChange(part.part)} aria-current={currentPart === part.part ? 'page' : undefined} className={`${buttonClass} ${currentPart === part.part ? 'border-neutral-900 bg-neutral-100 text-neutral-950' : ''}`}>Passage {part.part}</button>)}
      </nav>
      <nav aria-label="Review questions" className="flex gap-1.5 overflow-x-auto pb-1">
        {partQuestions.map(question => <button key={question} type="button" aria-label={`Question ${question}, ${status(question).toLowerCase()}`} aria-current={selected === question ? 'true' : undefined} onClick={() => onQuestionSelect(question)} className={`h-9 w-9 shrink-0 rounded border text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${correct.has(question) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : answers[question]?.trim() ? 'border-red-300 bg-red-50 text-red-800' : 'border-neutral-300 bg-white text-neutral-700'} ${selected === question ? 'ring-2 ring-neutral-800 ring-inset' : ''}`}>{question}</button>)}
      </nav>
    </footer>
  </div>;
}
