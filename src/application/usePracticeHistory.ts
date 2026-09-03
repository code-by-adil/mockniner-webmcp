import { useEffect, useState } from 'react';
import type { AssessmentSession } from '@/domain/assessmentSession';
import type { IeltsSession } from '@/domain/session';
import { readHistoryPage, type HistoryPage } from '@/infrastructure/database/historyRepository';
import { reportHandledError } from '@/shared/reportHandledError';

const PAGE_SIZE = 6;
type HistoryLoad = { status: 'loading' } | { status: 'error' } | { status: 'ready'; page: HistoryPage };

function evaluationKey(evaluation?: { attemptId: string; evaluatedAt: string; revision?: number } | null) {
  return evaluation ? `${evaluation.attemptId}:${evaluation.revision ?? evaluation.evaluatedAt}` : '';
}

// A submission can finish after navigation has returned home or parked its draft.
// Answer edits and timer ticks do not invalidate the saved-attempt list.
export function getPracticeHistoryRevision(native: IeltsSession, assessment: AssessmentSession): string {
  return JSON.stringify([
    native.objectiveSubmissions.listening?.attemptId,
    native.objectiveSubmissions.reading?.attemptId,
    native.writingSubmission?.attemptId,
    native.speakingSubmission?.attemptId,
    native.pausedDrafts.map(draft => [draft.attemptId, draft.completedSections]),
    evaluationKey(native.writingEvaluation),
    evaluationKey(native.speakingEvaluation),
    assessment.attemptId,
    assessment.submission?.attemptId,
    evaluationKey(assessment.evaluation),
  ]);
}

export function usePracticeHistory(revision: string) {
  const [pagination, setPagination] = useState({ revision, offset: 0 });
  const offset = pagination.revision === revision ? pagination.offset : 0;
  const [retryCount, setRetryCount] = useState(0);
  const [loaded, setLoaded] = useState<(HistoryLoad & { requestKey: string }) | null>(null);
  const requestKey = `${revision}:${offset}:${retryCount}`;
  const load: HistoryLoad = loaded?.requestKey === requestKey ? loaded : { status: 'loading' };

  useEffect(() => {
    let cancelled = false;
    void import('@/infrastructure/database/client')
      .then(({ getLocalDatabase }) => getLocalDatabase())
      .then(database => readHistoryPage(database, { limit: PAGE_SIZE, offset }))
      .then(page => { if (!cancelled) setLoaded({ requestKey, status: 'ready', page }); })
      .catch(error => {
        reportHandledError(error, { feature: 'practice-history-load' });
        if (!cancelled) setLoaded({ requestKey, status: 'error' });
      });
    return () => { cancelled = true; };
  }, [offset, requestKey]);

  return {
    ...load,
    pageNumber: offset / PAGE_SIZE + 1,
    hasPrevious: offset > 0,
    previous: () => setPagination({ revision, offset: Math.max(0, offset - PAGE_SIZE) }),
    next: () => {
      if (load.status === 'ready' && load.page.nextOffset !== null) setPagination({ revision, offset: load.page.nextOffset });
    },
    retry: () => setRetryCount(current => current + 1),
  };
}

export type PracticeHistory = ReturnType<typeof usePracticeHistory>;
