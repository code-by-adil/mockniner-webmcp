import { describe, expect, it } from 'vitest'
import { initialSession, type IeltsSession } from '@/domain/session'
import { initialAssessmentSession } from '@/domain/assessmentSession'
import { getPracticeContext } from './practiceContext'
import { writingDocument } from '@/content/writing'
import { readingDocument } from '@/content/objective'
import type { SpeakingSubmission, WritingSubmission, WritingEvaluation, ObjectiveSubmission } from '@/domain/types'

const dates = { startedAt: '2026-09-01T10:00:00Z', submittedAt: '2026-09-01T10:15:00Z' }
const writing: WritingSubmission = { ...dates, attemptId: 'older-writing', contentKey: 'writing', tasks: [
  { task: writingDocument.tasks[0], response: 'Private answer.', wordCount: 2 },
  { task: writingDocument.tasks[1], response: 'Another private answer.', wordCount: 3 },
] }
const criterion = { band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6, feedback: 'Private feedback.', annotations: [] }
const evaluation: WritingEvaluation = { attemptId: writing.attemptId, overallBand: 6, task1: criterion, task2: criterion, summary: 'Private summary.', evaluatedAt: dates.submittedAt }
const speaking: SpeakingSubmission = { ...dates, attemptId: 'speaking-id', contentKey: 'speaking', responses: [] }
const reading: ObjectiveSubmission = { ...dates, attemptId: 'reading-id', contentKey: readingDocument.contentKey, section: 'reading', answers: { 1: 'Private answer.' }, result: { section: 'reading', raw: 1, total: 40, band: 1, answered: 1, correctQuestionIds: [1] } }
const session: IeltsSession = { ...initialSession, currentSection: 'speaking', writingSubmission: { ...writing, attemptId: 'newer-writing' }, speakingSubmission: speaking,
  objectiveSubmissions: { reading }, completedSections: ['reading', 'writing', 'speaking'] }

describe('visible practice identity', () => {
  it('uses the historical Writing review, even when currentSection and retained submissions refer elsewhere', () => {
    const state: IeltsSession = { ...session, view: 'review', review: { kind: 'writing', section: 'writing', submission: writing, evaluation, part: 1, returnTo: 'home' } }
    expect(getPracticeContext(state, initialAssessmentSession)).toEqual({ practice: 'ielts', view: 'review', activeAttempt: null,
      reviewLocation: { kind: 'writing', attemptId: 'older-writing', part: 1, taskNumber: 1, correctionId: undefined },
      submissions: [{ kind: 'writing', attemptId: 'older-writing', contentKey: 'writing', evaluationStatus: 'evaluated' }] })
  })
  it('exposes only the objective review, not hidden Writing or Speaking submissions', () => {
    const state: IeltsSession = { ...session, view: 'review', review: { kind: 'objective', section: 'reading', submission: reading, document: readingDocument, part: 1, returnTo: 'home' } }
    expect(getPracticeContext(state, initialAssessmentSession).submissions).toHaveLength(1)
  })
  it('reports all submitted sections on the combined results screen', () => {
    const context = getPracticeContext({ ...session, view: 'result' }, initialAssessmentSession)
    expect(context.submissions.map(s => s.attemptId)).toEqual(['reading-id', 'newer-writing', 'speaking-id'])
    expect(JSON.stringify(context)).not.toContain('Private')
    expect(context.activeAttempt).toBeNull()
  })
  it('shows only the just-completed section at transition', () => {
    expect(getPracticeContext({ ...session, view: 'transition' }, initialAssessmentSession).submissions.map(s => s.kind)).toEqual(['speaking'])
  })
  it('exposes no retained submission on the home screen', () => {
    expect(getPracticeContext(session, initialAssessmentSession)).toEqual({ practice: null, view: 'home', activeAttempt: null, submissions: [] })
  })
  it('identifies a live attempt without its draft answers or old submissions', () => {
    expect(getPracticeContext({ ...session, view: 'exam', attemptId: 'live-id', writingDrafts: { 1: 'Secret draft', 2: '' } }, initialAssessmentSession))
      .toEqual({ practice: 'ielts', view: 'exam', activeAttempt: { kind: 'speaking', attemptId: 'live-id' }, submissions: [] })
  })
  it('gives the universal screen precedence over a retained native screen', () => {
    expect(getPracticeContext({ ...session, view: 'result' }, { ...initialAssessmentSession, view: 'assessment', attemptId: 'universal-live', packageId: 'quiz' }))
      .toEqual({ practice: 'assessment', view: 'assessment', activeAttempt: { kind: 'assessment', attemptId: 'universal-live', packageId: 'quiz' }, submissions: [] })
  })
})
