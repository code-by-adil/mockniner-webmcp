import { describe, expect, it } from 'vitest'
import { satPracticeAssessment } from '@/content/sat'
import { getAssessmentAuthoringKit } from '@/content/assessmentExamples'
import { parseAssessmentPackage } from './assessmentContract'
import { gradeAssessment } from './assessmentScoring'
import { assessmentSubmissionForAgent, resolveAssessmentReview } from './assessmentReview'

describe('assessment review policy projection', () => {
  it.each(['answers', 'responses', 'none'] as const)('honors %s without modifying the stored snapshot', mode => {
    const assessment = { ...structuredClone(satPracticeAssessment), review: { mode } }
    const firstId = assessment.parts[0]!.items[0]!.id
    const submission = { attemptId: crypto.randomUUID(), packageId: assessment.packageId, package: assessment,
      responses: { [firstId]: 'PRIVATE_RESPONSE' }, result: gradeAssessment(assessment, { [firstId]: 'PRIVATE_RESPONSE' }),
      startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T10:10:00Z' }
    const before = JSON.stringify(submission)
    const projected = assessmentSubmissionForAgent(submission)
    expect(JSON.stringify(submission)).toBe(before)
    expect(projected.result.rawScore).toBe(submission.result.rawScore)
    if (mode === 'answers') {
      expect(projected.package).toEqual(assessment)
      expect(projected.result.itemResults).toEqual(submission.result.itemResults)
    } else {
      expect(JSON.stringify(projected.package)).not.toContain('"scoring"')
      expect(projected.result.itemResults.every(item => !('correct' in item))).toBe(true)
      if (mode === 'none') {
        expect(projected.package.parts).toEqual([])
        expect(projected.responses).toEqual({})
        expect(projected.result.itemResults).toEqual([])
      } else expect(projected.responses).toEqual(submission.responses)
    }
  })
  it('keeps rubric evaluation possible when objective review is disabled', () => {
    const assessment = parseAssessmentPackage({ ...getAssessmentAuthoringKit('writing-with-rubric').examplePackage, source: 'agent', review: { mode: 'none' } })
    const id = assessment.parts[0]!.items[0]!.id
    const responses = { [id]: 'Submitted essay for evaluation.' }
    const projected = assessmentSubmissionForAgent({ attemptId: crypto.randomUUID(), packageId: assessment.packageId, package: assessment,
      responses, result: gradeAssessment(assessment, responses), startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T10:10:00Z' })
    expect(projected.responses).toEqual(responses)
    expect(projected.package.rubric).toEqual(assessment.rubric)
    expect(projected.package.parts[0]!.items[0]!.id).toBe(id)
    expect(projected.result.awaitingEvaluationCount).toBe(1)
  })

  it('resolves filters and selected items from one canonical review policy', () => {
    const assessment = satPracticeAssessment
    const responses = { 'rw-1': 'a', 'rw-2': 'a' }
    const submission = { attemptId: crypto.randomUUID(), packageId: assessment.packageId, package: assessment,
      responses, result: gradeAssessment(assessment, responses), startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T10:10:00Z' }
    expect(resolveAssessmentReview(submission, { filter: 'incorrect' })).toEqual({ filter: 'incorrect', itemId: 'rw-1' })
    expect(resolveAssessmentReview(submission, { filter: 'unanswered' }).itemId).toBe('rw-3')
    expect(() => resolveAssessmentReview(submission, { filter: 'incorrect', itemId: 'rw-2' })).toThrow(/Choose an itemId/)
    expect(resolveAssessmentReview({ ...submission, package: { ...assessment, review: { mode: 'responses' } } }, { filter: 'incorrect' }))
      .toEqual({ filter: 'all', itemId: 'rw-1' })
    expect(() => resolveAssessmentReview({ ...submission, package: { ...assessment, review: { mode: 'none' } } }, { filter: 'all' }))
      .toThrow(/does not allow question review/)
  })
})
