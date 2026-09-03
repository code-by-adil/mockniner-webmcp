// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PracticeHistory } from '@/application/usePracticeHistory';
import type { HistoryEntry } from '@/infrastructure/database/historyRepository';
import { RecentAttempts } from './RecentAttempts';

const noOp = () => {};
function history(items: HistoryEntry[], nextOffset: number | null = null): PracticeHistory {
  return { status: 'ready', page: { items, nextOffset, unavailable: [] },
    pageNumber: 1, hasPrevious: false, previous: noOp, next: noOp, retry: noOp };
}
const reading: HistoryEntry = { attemptId: 'reading-attempt', kind: 'reading', title: 'Reading Practice', contentKey: 'reading-v1',
  submittedAt: '2026-09-03T11:00:00.000Z', evaluationStatus: 'not_required', rawScore: 30, maximumScore: 40, band: 7 };
const assessment: HistoryEntry = { attemptId: 'assessment-attempt', kind: 'assessment', title: 'Diagnostic', packageId: 'diagnostic',
  submittedAt: '2026-09-02T11:00:00.000Z', evaluationStatus: 'not_required', rawScore: 2, maximumScore: 3 };

describe('recent attempts', () => {
  it('omits an empty first page without claiming a truncated saved count', () => {
    expect(renderToStaticMarkup(<RecentAttempts history={history([])} onReview={async () => {}} />)).toBe('');
    const html = renderToStaticMarkup(<RecentAttempts history={history([reading], 6)} onReview={async () => {}} />);
    expect(html).toContain('Saved in this browser');
    expect(html).not.toContain('1 attempt saved');
  });

  it('preserves chronological reader order and routes every row with its kind', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    const onReview = vi.fn(async () => {});
    const next = vi.fn();
    try {
      await act(async () => root.render(<RecentAttempts history={{ ...history([reading, assessment], 6), next }} onReview={onReview} />));
      expect([...container.querySelectorAll('[data-attempt-id]')].map(row => row.getAttribute('data-attempt-id')))
        .toEqual(['reading-attempt', 'assessment-attempt']);
      const reviewButtons = container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Review"]');
      await act(async () => { for (const button of reviewButtons) button.click(); });
      expect(onReview.mock.calls).toEqual([['reading-attempt', 'reading'], ['assessment-attempt', 'assessment']]);
      const older = [...container.querySelectorAll('button')].find(button => button.textContent === 'Older attempts')!;
      await act(async () => older.click());
      expect(next).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });

  it('shows rubric scores and pending feedback without a meaningless 0/0 score', () => {
    const html = renderToStaticMarkup(<RecentAttempts history={history([
      { ...assessment, attemptId: 'pending', rawScore: 0, maximumScore: 0, evaluationStatus: 'awaiting_evaluation' },
      { ...assessment, attemptId: 'evaluated', rawScore: 0, maximumScore: 0, evaluationStatus: 'evaluated', evaluationScore: 4, evaluationMaximumScore: 6 },
      { ...reading, attemptId: 'speaking', kind: 'speaking', rawScore: undefined, maximumScore: undefined, band: undefined, evaluationStatus: 'insufficient_evidence' },
    ])} onReview={async () => {}} />);
    expect(html).toContain('Feedback pending');
    expect(html).toContain('Feedback score 4/6');
    expect(html).toContain('Feedback ready · Unscored');
    expect(html).not.toContain('0/0');
  });

  it('keeps navigation available across a page of unreadable rows', () => {
    const html = renderToStaticMarkup(<RecentAttempts history={{ ...history([], 12), pageNumber: 2, hasPrevious: true,
      status: 'ready', page: { items: [], nextOffset: 12, unavailable: [{ attemptId: 'broken', kind: 'assessment', message: 'Invalid stored record.' }] } }} onReview={async () => {}} />);
    expect(html).toContain('1 saved attempt could not be opened');
    expect(html).toContain('Newer attempts');
    expect(html).toContain('Older attempts');
    expect(html).toContain('Page 2');
  });
});
