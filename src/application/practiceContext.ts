import { getAssessmentEvaluationStatus } from '@/domain/assessment'
import type { AssessmentSession } from '@/domain/assessmentSession'
import type { IeltsSession } from '@/domain/session'
import type { SectionKey } from '@/domain/types'

export type VisibleSubmission = {
  kind: SectionKey | 'assessment'
  attemptId: string
  contentKey?: string
  packageId?: string
  evaluationStatus: 'evaluated' | 'awaiting_evaluation' | 'not_required'
}

export type PracticeContext = {
  practice: 'ielts' | 'assessment' | null
  view: IeltsSession['view'] | AssessmentSession['view']
  activeAttempt: { kind: VisibleSubmission['kind']; attemptId: string; packageId?: string } | null
  submissions: VisibleSubmission[]
}

// Derive identity from the same view precedence used by App. Never fall back to
// retained session submissions when history or another practice owns the screen.
export function getPracticeContext(native: IeltsSession, assessment: AssessmentSession): PracticeContext {
  if (assessment.view !== 'home') {
    const submission = assessment.view === 'result' ? assessment.submission : null
    return {
      practice: 'assessment', view: assessment.view,
      activeAttempt: assessment.view === 'assessment' && assessment.attemptId
        ? { kind: 'assessment', attemptId: assessment.attemptId, packageId: assessment.packageId! } : null,
      submissions: submission ? [{ kind: 'assessment', attemptId: submission.attemptId,
        packageId: submission.packageId, evaluationStatus: getAssessmentEvaluationStatus(submission.result, assessment.evaluation) }] : [],
    }
  }
  if (native.view === 'home') return { practice: null, view: 'home', activeAttempt: null, submissions: [] }
  const context: PracticeContext = { practice: 'ielts', view: native.view, activeAttempt: null, submissions: [] }
  if (native.view === 'review') {
    const review = native.review
    if (review) context.submissions.push({ kind: review.section, attemptId: review.submission.attemptId,
      contentKey: review.submission.contentKey, evaluationStatus: review.kind === 'objective' ? 'not_required' : review.evaluation ? 'evaluated' : 'awaiting_evaluation' })
    return context
  }
  if (native.view === 'exam') {
    if (native.currentSection && native.attemptId) context.activeAttempt = { kind: native.currentSection, attemptId: native.attemptId }
    return context
  }
  const sections = native.view === 'result' ? native.completedSections : [native.currentSection]
  for (const kind of sections) {
    if (!kind) continue
    const submission = kind === 'writing' ? native.writingSubmission : kind === 'speaking' ? native.speakingSubmission : native.objectiveSubmissions[kind]
    if (!submission) continue
    const evaluation = kind === 'writing' ? native.writingEvaluation : kind === 'speaking' ? native.speakingEvaluation : null
    context.submissions.push({ kind, attemptId: submission.attemptId, contentKey: submission.contentKey,
      evaluationStatus: kind === 'writing' || kind === 'speaking' ? evaluation ? 'evaluated' : 'awaiting_evaluation' : 'not_required' })
  }
  return context
}
