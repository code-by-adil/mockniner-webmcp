import type { ObjectiveSubmission } from '@/domain/types';
import { getObjectiveBlockQuestionIds, type ObjectiveContentDocument } from '@/domain/objectiveContent';
import { ResultAction, ResultBreakdown, ResultScore, ResultsLayout } from '@/shared/ui/results/ResultsLayout';

export function ObjectiveResults({ submission, document, onHome, onReview }: { submission: ObjectiveSubmission; document?: ObjectiveContentDocument; onHome: () => void; onReview: () => void }) {
  const { result, answers } = submission;
  const content = document?.contentKey === submission.contentKey ? document : undefined;
  const correctIds = new Set(result.correctQuestionIds);
  return <ResultsLayout title={content?.name ?? `IELTS ${result.section === 'reading' ? 'Reading' : 'Listening'} results`} subtitle="Practice results" onBack={onHome}>
    <ResultScore label="IELTS band" score={result.band} maximum={9} detail={`${result.raw} of ${result.total} correct · ${Math.round(result.raw / result.total * 100)}% correct`}
      metrics={[{ label: 'Correct answers', value: `${result.raw} / ${result.total}` }, { label: 'Answered', value: result.answered }, { label: 'Incorrect', value: result.answered - result.raw }, { label: 'Unanswered', value: result.total - result.answered }]}
      actions={<ResultAction onClick={onReview}>Review answers</ResultAction>} />
    {content ? <ResultBreakdown title="Results by part" rows={content.parts.map(part => {
      const ids = part.blocks.flatMap(getObjectiveBlockQuestionIds);
      return { id: String(part.id), label: part.label, detail: `${ids.length} questions`, total: ids.length,
        correct: ids.filter(id => correctIds.has(id)).length, unanswered: ids.filter(id => !answers[id]?.trim()).length };
    })} /> : null}
  </ResultsLayout>;
}
