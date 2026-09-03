import type { ReactElement } from 'react';
import { BookOpen, FileText, Headphones, Mic, Shapes } from 'lucide-react';
import type { PracticeHistory } from '@/application/usePracticeHistory';
import type { HistoryEntry, HistoryKind } from '@/infrastructure/database/historyRepository';

const icons = { listening: Headphones, reading: BookOpen, writing: FileText, speaking: Mic, assessment: Shapes };

function resultLabel(attempt: HistoryEntry): string {
  if (attempt.evaluationStatus === 'insufficient_evidence') return 'Feedback ready · Unscored';
  const scores: string[] = [];
  if (attempt.band !== undefined) scores.push(`Band ${attempt.band}`);
  if (attempt.maximumScore && attempt.rawScore !== undefined) {
    scores.push(`${attempt.rawScore}/${attempt.maximumScore}`);
  }
  if (attempt.evaluationScore !== undefined) {
    scores.push(`Feedback score ${attempt.evaluationScore}/${attempt.evaluationMaximumScore}`);
  } else if (attempt.evaluationStatus === 'awaiting_evaluation') {
    scores.push('Ask your agent for feedback');
  }
  return scores.join(' · ') || 'Completed';
}

export function RecentAttempts({ history, onReview }: {
  history: PracticeHistory;
  onReview: (attemptId: string, kind: HistoryKind) => Promise<void>;
}): ReactElement {
  const isEmpty = history.status === 'ready' && !history.page.items.length && !history.page.unavailable.length && !history.hasPrevious && history.page.nextOffset === null;

  return (
    <section id="practice-history" className="scroll-mt-20 space-y-4" aria-labelledby="recent-attempts-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200/80 pb-3">
        <div>
          <h2 id="recent-attempts-title" className="text-lg font-semibold tracking-tight">Practice history</h2>
          <p className="mt-1 text-sm text-neutral-600">Completed attempts, results, and feedback.</p>
        </div>
        <span className="text-xs text-neutral-600">Saved in this browser</span>
      </div>
      {history.status === 'loading' ? (
        <p role="status" className="text-sm text-neutral-500">Loading saved attempts...</p>
      ) : history.status === 'error' ? (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm text-neutral-600">
          <p>Saved attempts could not be loaded.</p>
          <button type="button" onClick={history.retry} className="font-semibold underline">Try again</button>
        </div>
      ) : isEmpty ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-5 text-sm text-neutral-600">
          No completed attempts yet. Submit a test to see your results here.
        </p>
      ) : (
        <>
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white text-xs shadow-2xs">
            {history.page.items.map(attempt => {
              const Icon = icons[attempt.kind];
              return (
                <div key={attempt.attemptId} data-attempt-id={attempt.attemptId} data-section={attempt.kind} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                    <Icon size={16} className="shrink-0 text-neutral-400" />
                    <div className="min-w-0">
                      <span className="break-words font-semibold text-neutral-800">{attempt.title}</span>
                      <time dateTime={attempt.submittedAt} className="mt-1 block text-xs text-neutral-600">
                        {new Date(attempt.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </time>
                    </div>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-3">
                    <span className="font-bold text-neutral-900">{resultLabel(attempt)}</span>
                    <button type="button" onClick={() => void onReview(attempt.attemptId, attempt.kind)} aria-label={`Review results for ${attempt.title}`} className="min-h-10 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Review results</button>
                  </div>
                </div>
              );
            })}
          </div>
          {history.page.unavailable.length > 0 ? (
            <p className="text-xs text-neutral-500">
              {history.page.unavailable.length} saved {history.page.unavailable.length === 1 ? 'attempt could' : 'attempts could'} not be opened. Export a backup from Local data to keep the saved records.
            </p>
          ) : null}
          {history.hasPrevious || history.page.nextOffset !== null ? (
            <nav aria-label="Attempt history pages" className="flex items-center justify-end gap-3 text-xs text-neutral-600">
              <button type="button" disabled={!history.hasPrevious} onClick={history.previous} className="rounded border border-neutral-200 px-3 py-1.5 font-medium hover:bg-neutral-50 disabled:opacity-40">Newer attempts</button>
              <span>Page {history.pageNumber}</span>
              <button type="button" disabled={history.page.nextOffset === null} onClick={history.next} className="rounded border border-neutral-200 px-3 py-1.5 font-medium hover:bg-neutral-50 disabled:opacity-40">Older attempts</button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
