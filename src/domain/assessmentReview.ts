import { stripAssessmentAnswers } from './assessmentScoring'
import type { AssessmentSubmission } from './assessmentSubmission'

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
