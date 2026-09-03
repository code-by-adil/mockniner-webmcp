import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readingDocument } from '@/content/objective';
import { gradeObjectiveDocument } from '@/domain/objectiveScoring';
import type { ObjectiveSubmission } from '@/domain/types';
import { ObjectiveResults } from './ObjectiveResults';

const submission: ObjectiveSubmission = { attemptId: '11111111-1111-4111-8111-111111111111', contentKey: readingDocument.contentKey, section: 'reading', answers: { 1: 'wrong' }, result: gradeObjectiveDocument(readingDocument, { 1: 'wrong' }), startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T11:00:00Z' };
const noop = () => undefined;
describe('native IELTS shared results overview', () => {
  it('uses the submitted score and content with a clear review action', () => {
    const before = JSON.stringify(submission);
    const html = renderToStaticMarkup(<ObjectiveResults submission={submission} document={readingDocument} onHome={noop} onReview={noop} />);
    expect(html).toContain(readingDocument.name); expect(html).toContain('IELTS band');
    expect(html).toContain('0 of 40 correct'); expect(html).toContain('Results by part');
    expect(html).toContain('Review answers'); expect(html).not.toContain('Time Left');
    expect(JSON.stringify(submission)).toBe(before);
  });
  it('does not show part results from content belonging to another submission', () => {
    const html = renderToStaticMarkup(<ObjectiveResults submission={{ ...submission, contentKey: 'different-key' }} document={readingDocument} onHome={noop} onReview={noop} />);
    expect(html).toContain('IELTS Reading results'); expect(html).not.toContain('Results by part');
    expect(html).not.toContain(readingDocument.name);
  });
});
