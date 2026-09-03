import { stripAssessmentAnswers } from './assessmentScoring'
import type { AssessmentSubmission } from './assessmentSubmission'
import { ApplicationError } from './errors'

export type AssessmentReviewSelection = { filter: 'all' | 'incorrect' | 'unanswered'; itemId?: string }

export function resolveAssessmentReview(submission: AssessmentSubmission, selection: AssessmentReviewSelection): AssessmentReviewSelection {
  if (submission.package.review.mode === 'none') throw new ApplicationError('REVIEW_UNAVAILABLE', 'The saved assessment does not allow question review.', true)
  const filter = selection.filter === 'incorrect' && submission.package.review.mode !== 'answers' ? 'all' : selection.filter
  const items = submission.result.itemResults.filter(result => filter === 'incorrect' ? result.answered && result.correct === false : filter === 'unanswered' ? !result.answered : true)
  if (selection.itemId && !items.some(item => item.itemId === selection.itemId)) throw new ApplicationError('REVIEW_LOCATION_NOT_FOUND', 'Choose an itemId from this submitted assessment and review filter.', true)
  return { filter, itemId: selection.itemId ?? items[0]?.itemId }
}

// Project the immutable snapshot, never the currently installed package.
// Rubric-scored responses remain available for evaluation even when objective
// review is disabled; they have no deterministic answer key to disclose.
export function assessmentSubmissionForAgent(submission: AssessmentSubmission) {
  const mode = submission.package.review.mode
  const agentItems = new Set(submission.package.parts.flatMap(part =>
    part.items.filter(item => item.scoring.type === 'agent').map(item => item.id)))
  const candidatePackage = stripAssessmentAnswers(submission.package)
  return {
    ...submission,
    package: mode === 'answers' ? submission.package : mode === 'responses' ? candidatePackage : {
      ...candidatePackage,
      parts: candidatePackage.parts.map(part => ({ ...part, items: part.items.filter(item => agentItems.has(item.id)) }))
        .filter(part => part.items.length > 0),
    },
    responses: mode !== 'none' ? submission.responses
      : Object.fromEntries(Object.entries(submission.responses).filter(([id]) => agentItems.has(id))),
    result: {
      ...submission.result,
      itemResults: mode === 'answers' ? submission.result.itemResults
        : mode === 'responses' ? submission.result.itemResults.map(({ correct: _correct, ...result }) => result) : [],
    },
  }
}
