import { z } from 'zod';
import type { AssessmentPackage } from './assessmentContract';
import type { AssessmentEvaluation } from './assessmentEvaluation';
import type { AssessmentSubmission } from './assessmentSubmission';
import { assessmentSubmissionForAgent } from './assessmentReview';
import { ApplicationError } from './errors';

const id = z.string().min(1).max(100);
export const assessmentReadFields = {
  view: z.enum(['full', 'summary']).default('full').describe('summary returns part/item IDs and totals without question text or responses. full returns content, optionally limited by partId or itemId.'),
  partId: id.optional().describe('Read only this part. If itemId is also supplied, it must belong to this part.'),
  itemId: id.optional().describe('Read only this item and its required part context, resources and rubric.'),
};
export type AssessmentReadScope = { view: 'full' | 'summary'; partId?: string; itemId?: string };

/** Slice the original snapshot before returning it; never grade a partial package. */
export function selectAssessmentContent(assessment: AssessmentPackage, scope: AssessmentReadScope, permittedItemIds?: Set<string>) {
  const parts = assessment.parts.filter(part => !scope.partId || part.id === scope.partId)
    .map(part => ({ ...part, items: part.items.filter(item =>
      (!scope.itemId || item.id === scope.itemId) && (!permittedItemIds || permittedItemIds.has(item.id))) }))
    .filter(part => part.items.length > 0);
  if ((scope.partId || scope.itemId) && !parts.length) {
    throw new ApplicationError('ASSESSMENT_SCOPE_NOT_FOUND', 'No readable part/item matches. Use view summary to discover permitted IDs; an item must belong to the requested part.', true);
  }
  const resourceIds = new Set(parts.flatMap(part => part.tools.flatMap(tool => tool.type === 'reference_document' ? [tool.resourceId] : [])));
  const hasAgentItems = parts.some(part => part.items.some(item => item.scoring.type === 'agent'));
  return { ...assessment, parts,
    resources: assessment.resources.filter(resource => resourceIds.has(resource.id)),
    rubric: hasAgentItems ? assessment.rubric : undefined };
}

export function assessmentOutline(assessment: AssessmentPackage) {
  return { packageId: assessment.packageId, revision: assessment.revision, title: assessment.title, review: assessment.review,
    parts: assessment.parts.map(part => ({ id: part.id, title: part.title, groupTitle: part.groupTitle,
      itemCount: part.items.length, itemIds: part.items.map(item => item.id) })) };
}

export function readAssessmentSubmission(stored: { submission: AssessmentSubmission; evaluation: AssessmentEvaluation | null }, scope: AssessmentReadScope) {
  const { submission, evaluation } = stored;
  const focused = Boolean(scope.partId || scope.itemId);
  const complete = scope.view === 'full' && !focused;
  if (complete) return { submission: assessmentSubmissionForAgent(submission), evaluation,
    scope: { view: 'full' as const, partial: false, resultTotals: 'assessment', evaluation: 'complete' } };

  const permitted = new Set(submission.package.parts.flatMap(part => part.items
    .filter(item => submission.package.review.mode !== 'none' || item.scoring.type === 'agent').map(item => item.id)));
  const content = selectAssessmentContent(submission.package, scope, permitted);
  const selectedIds = new Set(content.parts.flatMap(part => part.items.map(item => item.id)));
  const { itemResults, ...totals } = submission.result;
  const evaluationSummary = evaluation ? { attemptId: evaluation.attemptId,
    overallScore: evaluation.overallScore, revision: evaluation.revision, evaluatedAt: evaluation.evaluatedAt } : null;
  const resultScope = { ...scope, partial: true, resultTotals: 'assessment',
    evaluation: scope.view === 'summary' ? 'summary' : 'selected_annotations' };
  if (scope.view === 'summary') return {
    scope: resultScope, evaluation: evaluationSummary,
    submission: { attemptId: submission.attemptId, packageId: submission.packageId,
      startedAt: submission.startedAt, submittedAt: submission.submittedAt,
      package: assessmentOutline(content), result: totals },
  };
  return {
    scope: resultScope,
    evaluation: evaluation && evaluationSummary ? { ...evaluationSummary,
      annotations: evaluation.annotations.filter(annotation => selectedIds.has(annotation.itemId)) } : null,
    submission: assessmentSubmissionForAgent({ ...submission, package: content,
      responses: Object.fromEntries(Object.entries(submission.responses).filter(([id]) => selectedIds.has(id))),
      result: { ...totals, itemResults: itemResults.filter(result => selectedIds.has(result.itemId)) } }),
  };
}
