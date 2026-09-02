import { describe, expect, it } from 'vitest'
import { speakingEvaluationInputSchema } from './speakingEvaluation'
import { parseStoredSpeakingEvaluation } from './attemptValidation'

const base = { attemptId: '33333333-3333-4333-8333-333333333333', summary: 'More speaking evidence is needed.', strengths: [], improvements: ['Record several developed answers.'] }
describe('Speaking scored and insufficient-evidence outcomes', () => {
  it('accepts feedback with an explicit reason and no manufactured strengths or scores', () => {
    const input = { ...base, status: 'insufficient_evidence', reason: 'All questions were skipped.' }
    expect(speakingEvaluationInputSchema.parse(input)).toEqual(input)
    expect(parseStoredSpeakingEvaluation(JSON.stringify({ ...input, evaluatedAt: '2026-09-03T10:00:00Z' }))).toMatchObject(input)
  })
  it.each(['overallBand', 'fluencyCoherence', 'lexicalResource', 'grammaticalRangeAccuracy', 'pronunciation'])('rejects %s on an insufficient-evidence outcome', field => {
    expect(speakingEvaluationInputSchema.safeParse({ ...base, status: 'insufficient_evidence', reason: 'No usable transcript.', [field]: 0 }).success).toBe(false)
  })
  it('requires a reason and retains legacy scored evaluations without a migration', () => {
    expect(speakingEvaluationInputSchema.safeParse({ ...base, status: 'insufficient_evidence' }).success).toBe(false)
    const old = { ...base, strengths: ['Clear examples.'], overallBand: 6, fluencyCoherence: 6, lexicalResource: 6, grammaticalRangeAccuracy: 6, evaluatedAt: '2026-09-03T10:00:00Z' }
    expect(parseStoredSpeakingEvaluation(JSON.stringify(old))).toEqual(old)
    expect(speakingEvaluationInputSchema.safeParse({ ...base, status: 'scored' }).success).toBe(false)
  })
})
