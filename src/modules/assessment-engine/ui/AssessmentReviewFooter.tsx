import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Grid2X2, Minus, X } from 'lucide-react';

export type ReviewQuestion = { id: string; number: number; status: 'Correct' | 'Incorrect' | 'Unanswered' | 'Response saved' };
export type ReviewPart = { id: string; label: string; total: number; questions: ReviewQuestion[] };
const statusClasses = {
  Correct: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Incorrect: 'border-red-200 bg-red-50 text-red-800',
  Unanswered: 'border-neutral-300 bg-white text-neutral-600',
  'Response saved': 'border-neutral-300 bg-neutral-100 text-neutral-700',
};

export function AssessmentReviewFooter({ parts, selectedId, onSelect, onPrevious, onNext, canPrevious, canNext, showAnswers }: {
  parts: ReviewPart[]; selectedId: string; onSelect: (id: string) => void;
  onPrevious: () => void; onNext: () => void; canPrevious: boolean; canNext: boolean; showAnswers: boolean;
}) {
  const footerRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(140);
  const moduleId = useId();
  const part = parts.find(candidate => candidate.questions.some(question => question.id === selectedId))!;
  const selected = part.questions.find(question => question.id === selectedId)!;

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    const measure = () => setHeight(footer.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  function select(id: string) {
    if (detailsRef.current) detailsRef.current.open = false;
    onSelect(id);
  }

  function questionButtons(mobile: boolean) {
    return part.questions.map(question => {
      const Icon = question.status === 'Incorrect' ? X : question.status === 'Unanswered' ? Minus : Check;
      return <button type="button" key={question.id} ref={!mobile && question.id === selectedId ? activeButtonRef : undefined}
        onClick={() => select(question.id)} aria-label={`Question ${question.number}, ${question.status.toLowerCase()}`}
        aria-current={question.id === selectedId ? 'true' : undefined}
        className={`review-question-button relative flex shrink-0 items-center justify-center rounded border text-xs font-semibold tabular-nums ${mobile ? 'h-10 w-10' : 'h-9 w-9'} ${statusClasses[question.status]}`}>
        {question.number}<Icon size={10} aria-hidden="true" className="absolute bottom-0.5 right-0.5" />
      </button>;
    });
  }

  return <>
    <div aria-hidden="true" style={{ height: height + 20 }} />
    <footer ref={footerRef} aria-label="Answer review navigation" className="review-footer fixed inset-x-0 bottom-0 z-40 border-t border-neutral-300 bg-white pb-[env(safe-area-inset-bottom)]"
      onKeyDown={event => {
        if (event.key === 'Escape' && detailsRef.current?.open) {
          detailsRef.current.open = false;
          detailsRef.current.querySelector('summary')?.focus();
          event.stopPropagation();
        }
      }}>
      <div className="mx-auto max-w-[1280px] px-3 py-2 sm:px-8 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
          <div className="min-w-0 basis-full sm:basis-auto">
            <label htmlFor={moduleId} className="sr-only">Review module</label>
            <select id={moduleId} value={part.id} onChange={event => select(parts.find(candidate => candidate.id === event.target.value)!.questions[0].id)}
              className="h-10 w-full min-w-0 max-w-full rounded border border-neutral-200 bg-white px-2 text-sm font-medium text-neutral-800 sm:w-[300px]">
              {parts.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
            </select>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:justify-end sm:gap-5">
            <button type="button" aria-label="Previous" onClick={onPrevious} disabled={!canPrevious} className="inline-flex h-10 items-center justify-center gap-2 rounded border border-neutral-200 px-3 text-sm font-medium disabled:opacity-40"><ArrowLeft size={16} aria-hidden="true" /><span className="hidden sm:inline">Previous</span></button>
            <p className="hidden text-sm tabular-nums text-neutral-600 sm:block">Question {selected.number} of {part.total}</p>
            <details ref={detailsRef} className="sm:hidden">
              <summary className="flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded border border-neutral-200 px-3 text-xs font-medium text-neutral-800">
                <Grid2X2 size={15} aria-hidden="true" />Question {selected.number} of {part.total}
              </summary>
              <nav aria-label="Questions in this module" className="absolute inset-x-0 bottom-full max-h-[60dvh] overflow-y-auto border-t border-neutral-300 bg-white px-4 py-4 shadow-[0_-8px_24px_#0000000d]">
                <p className="mb-4 text-sm font-semibold">{part.label}</p>
                <div className="grid grid-cols-[repeat(auto-fill,40px)] justify-center gap-2">{questionButtons(true)}</div>
                <p className="mt-4 text-xs text-neutral-600">{showAnswers ? '✓ Correct · × Incorrect · − Unanswered' : '✓ Response saved · − Unanswered'}</p>
              </nav>
            </details>
            <button type="button" aria-label="Next" onClick={onNext} disabled={!canNext} className="inline-flex h-10 items-center justify-center gap-2 rounded border border-neutral-200 px-3 text-sm font-medium disabled:opacity-40"><span className="hidden sm:inline">Next</span><ArrowRight size={16} aria-hidden="true" /></button>
          </div>
        </div>
        <nav aria-label="Questions in this module" className="mt-2 hidden overflow-x-auto px-1 py-1 sm:block">
          <div className="flex w-max gap-1.5">{questionButtons(false)}</div>
        </nav>
      </div>
    </footer>
  </>;
}
