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
    scores.push('Feedback pending');
  }
  return scores.join(' · ') || 'Completed';
}

export function RecentAttempts({ history, onReview }: {
  history: PracticeHistory;
  onReview: (attemptId: string, kind: HistoryKind) => Promise<void>;
}): ReactElement | null {
  if (history.status === 'ready' && !history.page.items.length && !history.page.unavailable.length && !history.hasPrevious && history.page.nextOffset === null) return null;

  return (
    <section className="space-y-4" aria-labelledby="recent-attempts-title">
      <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2.5">
        <h2 id="recent-attempts-title" className="text-xs font-bold uppercase tracking-wider text-neutral-500">Recent attempts</h2>
        <span className="text-xs text-neutral-400">Saved in this browser</span>
      </div>
      {history.status === 'loading' ? (
        <p role="status" className="text-sm text-neutral-500">Loading saved attempts...</p>
      ) : history.status === 'error' ? (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm text-neutral-600">
          <p>Saved attempts could not be loaded.</p>
          <button type="button" onClick={history.retry} className="font-semibold underline">Try again</button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white text-xs shadow-2xs">
            {history.page.items.map(attempt => {
              const Icon = icons[attempt.kind];
              return (
                <div key={attempt.attemptId} data-attempt-id={attempt.attemptId} data-section={attempt.kind} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon size={16} className="shrink-0 text-neutral-400" />
                    <div>
                      <span className="font-semibold text-neutral-800">{attempt.title}</span>
                      <time dateTime={attempt.submittedAt} className="ml-2 text-[11px] text-neutral-400">
                        {new Date(attempt.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </time>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2.5">
                    <span className="font-bold text-neutral-900">{resultLabel(attempt)}</span>
                    <button type="button" onClick={() => void onReview(attempt.attemptId, attempt.kind)} aria-label={`Review ${attempt.title}`} className="rounded border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50">Review</button>
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
