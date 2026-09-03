import { describe, expect, it } from 'vitest';
import { satFullLengthAssessment } from '@/content/satFullLength';
import { getAssessmentAuthoringKit } from '@/content/assessmentExamples';
import { parseAssessmentPackage, type AssessmentPackage } from './assessmentContract';
import { gradeAssessment } from './assessmentScoring';
import type { AssessmentEvaluation } from './assessmentEvaluation';
import { readAssessmentSubmission } from './assessmentRead';

function stored(assessment: AssessmentPackage, responses: Record<string, string> = {}) {
  return { submission: { attemptId: crypto.randomUUID(), packageId: assessment.packageId, package: assessment, responses,
    result: gradeAssessment(assessment, responses), startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T11:00:00Z' }, evaluation: null };
}

describe('focused assessment reads', () => {
  it('reads a 98-item submission by summary, part or item while retaining aggregate scores', () => {
    const assessment = satFullLengthAssessment;
    const [first, second] = assessment.parts[0].items;
    const record = stored(assessment, { [first.id]: 'FIRST_RESPONSE', [second.id]: 'SECOND_RESPONSE' });
    const before = JSON.stringify(record);
    const full = readAssessmentSubmission(record, { view: 'full' });
    const summary = readAssessmentSubmission(record, { view: 'summary' });
    expect(summary.submission.package.parts).toHaveLength(4);
    expect(summary.submission.package.parts[0]).toMatchObject({ itemCount: 27, itemIds: assessment.parts[0].items.map(item => item.id) });
    expect(summary.submission).not.toHaveProperty('responses');
    expect(summary.submission.result).not.toHaveProperty('itemResults');
    expect(JSON.stringify(summary)).not.toContain('FIRST_RESPONSE');
    const part = readAssessmentSubmission(record, { view: 'full', partId: assessment.parts[0].id });
    expect(part.submission.package.parts).toHaveLength(1);
    expect(part.submission.package.parts[0]).toHaveProperty('items', assessment.parts[0].items);
    expect(part.submission.package).toHaveProperty('resources', []);
    const item = readAssessmentSubmission(record, { view: 'full', itemId: first.id });
    expect(item.submission.package.parts[0]).toHaveProperty('items', [first]);
    expect(item.submission).toHaveProperty('responses', { [first.id]: 'FIRST_RESPONSE' });
    expect(item.submission.result).toHaveProperty('itemResults', [record.submission.result.itemResults[0]]);
    expect(item.submission.result.totalItems).toBe(98);
    expect(item.scope).toMatchObject({ partial: true, resultTotals: 'assessment' });
    expect(JSON.stringify(item)).not.toContain('SECOND_RESPONSE');
    expect(JSON.stringify(item).length).toBeLessThan(JSON.stringify(full).length / 10);
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(full).length / 10);
    const math = readAssessmentSubmission(record, { view: 'full', itemId: assessment.parts[2].items[0].id });
    expect(math.submission.package).toHaveProperty('resources', assessment.resources);
    expect(JSON.stringify(record)).toBe(before);
  });

  it.each(['answers', 'responses', 'none'] as const)('preserves %s policy for filtered and summary reads', mode => {
    const assessment = { ...satFullLengthAssessment, review: { mode } };
    const first = assessment.parts[0].items[0];
    const record = stored(assessment, { [first.id]: 'PRIVATE_RESPONSE' });
    const summary = readAssessmentSubmission(record, { view: 'summary' });
    if (mode === 'none') {
      expect(summary.submission.package.parts).toEqual([]);
      expect(JSON.stringify(summary)).not.toContain(first.id);
      expect(() => readAssessmentSubmission(record, { view: 'full', itemId: first.id })).toThrow('No readable part/item');
      expect(() => readAssessmentSubmission(record, { view: 'summary', partId: assessment.parts[0].id })).toThrow('No readable part/item');
    } else {
      const focused = readAssessmentSubmission(record, { view: 'full', itemId: first.id });
      expect(focused.submission).toHaveProperty('responses', { [first.id]: 'PRIVATE_RESPONSE' });
      if (mode === 'answers') expect(focused.submission.package.parts[0]).toHaveProperty('items.0.scoring', first.scoring);
      if (mode === 'responses') {
        expect(JSON.stringify(focused)).not.toContain('"scoring"');
        expect(focused.submission.result).not.toHaveProperty('itemResults.0.correct');
      }
    }
  });

  it('includes only selected annotations and rubric context, including under none review', () => {
    const base = parseAssessmentPackage({ ...getAssessmentAuthoringKit('writing-with-rubric').examplePackage, source: 'agent' });
    const assessment = parseAssessmentPackage({ ...base, review: { mode: 'none' }, parts: [base.parts[0], {
      ...base.parts[0], id: 'second-part', items: [{ ...base.parts[0].items[0], id: 'second-essay' }],
    }, satFullLengthAssessment.parts[0]] });
    const first = assessment.parts[0].items[0];
    const record = stored(assessment, { [first.id]: 'First essay.', 'second-essay': 'Other essay.' });
    const evaluation: AssessmentEvaluation = { attemptId: record.submission.attemptId, rubricId: base.rubrics[0].id,
      overallScore: 3, summary: 'UNSCOPED_SUMMARY', strengths: ['UNSCOPED_STRENGTH'], improvements: ['UNSCOPED_IMPROVEMENT'],
      criteria: [{ criterionId: 'claim', score: 3, feedback: 'UNSCOPED_FEEDBACK', evidence: ['Other essay.'] }],
      evaluatedAt: '2026-09-03T11:01:00Z', revision: 2,
      annotations: [first.id, 'second-essay'].map(itemId => ({ itemId, originalText: itemId, suggestion: `Suggestion ${itemId}`, explanation: `Explanation ${itemId}` })) };
    const focused = readAssessmentSubmission({ ...record, evaluation }, { view: 'full', itemId: first.id });
    expect(focused.submission.package).toHaveProperty('rubrics', base.rubrics);
    expect(focused.submission).toHaveProperty('responses', { [first.id]: 'First essay.' });
    expect(focused.evaluation).toHaveProperty('annotations', [evaluation.annotations[0]]);
    expect(focused.evaluation).toMatchObject({ revision: 2, overallScore: 3 });
    expect(JSON.stringify(focused)).not.toContain('Other essay.');
    expect(JSON.stringify(focused)).not.toContain('UNSCOPED_');
    const summary = readAssessmentSubmission({ ...record, evaluation }, { view: 'summary' });
    expect(summary.evaluation).not.toHaveProperty('annotations');
    expect(summary.submission.package.parts).toHaveLength(2);
  });

  it('rejects unknown IDs and an item from a different part', () => {
    const record = stored(satFullLengthAssessment);
    for (const scope of [{ partId: 'missing' }, { itemId: 'missing' }, { partId: record.submission.package.parts[0].id, itemId: record.submission.package.parts[1].items[0].id }]) {
      expect(() => readAssessmentSubmission(record, { view: 'full', ...scope })).toThrow('No readable part/item');
    }
  });
});
