import type { AssessmentContentBlock } from '@/domain/assessment';
import { AssessmentContentBlockView } from './AssessmentContentBlockView';

export function AssessmentReviewContent({ blocks }: { blocks: AssessmentContentBlock[] }) {
  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
    {blocks.map((block, index) => <AssessmentContentBlockView key={index} block={block} variant="review" />)}
  </div>;
}
