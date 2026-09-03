import { describe, expect, it } from 'vitest'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { satPracticeAssessment } from '@/content/sat'
import { initialSession } from '@/domain/session'
import { assessmentSessionReducer, initialAssessmentSession } from '@/domain/assessmentSession'
import type { PracticeWorkspace } from './practiceNavigation'
import { getPracticeProgress } from './practiceProgress'

function workspace(): PracticeWorkspace {
  return { native: structuredClone(initialSession), assessment: structuredClone(initialAssessmentSession),
    content: { listening: listeningDocument, reading: readingDocument, writing: writingDocument }, assessments: [satPracticeAssessment],
    listeningAudio: { contentKey: listeningDocument.contentKey, source: 'bundled', phase: 'ready', readyToPlay: true, completedChunks: 1, totalChunks: 1, error: null, canRetry: false } }
}
describe('safe live progress', () => {
  it('returns visible part counts and timing without answers or grading', () => {
    const w = workspace(); Object.assign(w.native, { view: 'exam', currentSection: 'reading' })
    w.native.answers.reading = { 1: 'SECRET', 2: '  ', 14: 'OTHER_SECRET' }
    w.native.partBySection.reading = 2
    expect(getPracticeProgress(w)).toMatchObject({ kind: 'reading', part: 2, totalParts: 3, totalItems: 40, answeredCount: 2, partAnsweredCount: 1, secondsRemaining: 3600 })
    expect(JSON.stringify(getPracticeProgress(w))).not.toMatch(/SECRET|correct|answerKey/)
  })
  it('reports Writing word counts, not essay contents', () => {
    const w = workspace(); Object.assign(w.native, { view: 'exam', currentSection: 'writing' })
    w.native.writingDrafts = { 1: 'Private draft text', 2: '' }
    expect(getPracticeProgress(w)).toMatchObject({ wordCounts: { 1: 3, 2: 0 }, answeredCount: 1, totalItems: 2 })
    expect(JSON.stringify(getPracticeProgress(w))).not.toContain('Private')
  })
  it('gives the universal screen priority and preserves untimed null', () => {
    const w = workspace(); const part = satPracticeAssessment.parts[0]!
    Object.assign(w.native, { view: 'exam', currentSection: 'reading' })
    Object.assign(w.assessment, { view: 'assessment', packageSnapshot: satPracticeAssessment, packageId: satPracticeAssessment.packageId, partId: part.id, itemId: part.items[0]!.id, responses: { [part.items[0]!.id]: 'SECRET' } })
    expect(getPracticeProgress(w)).toMatchObject({ kind: 'assessment', itemId: part.items[0]!.id, answeredCount: 1, secondsRemaining: null, timerScope: 'part' })
  })
  it('reads the pinned draft even when the catalog changes or no longer contains it', () => {
    const w = workspace()
    w.assessment = assessmentSessionReducer(w.assessment, {
      type: 'START', assessment: satPracticeAssessment,
      attemptId: '33333333-3333-4333-8333-333333333333',
      startedAt: '2026-09-03T00:00:00Z', nowMs: Date.parse('2026-09-03T00:00:00Z'),
    })
    const pinned = getPracticeProgress(w)
    w.assessments = [{ ...satPracticeAssessment, parts: [] }]
    expect(getPracticeProgress(w)).toEqual(pinned)
    w.assessments = []
    expect(getPracticeProgress(w)).toEqual(pinned)
    expect(pinned).toMatchObject({ kind: 'assessment', totalItems: 12, totalParts: 4 })
  })
  it('exposes no hidden progress in home, result or review views', () => {
    const w = workspace(); expect(getPracticeProgress(w)).toBeNull()
    w.native.view = 'review'; expect(getPracticeProgress(w)).toBeNull()
    w.assessment.view = 'result'; expect(getPracticeProgress(w)).toBeNull()
  })
  it('uses the local Speaking phase and question position', () => {
    const w = workspace(); Object.assign(w.native, { view: 'exam', currentSection: 'speaking' })
    expect(getPracticeProgress(w, { phase: 'recording', currentQuestion: 4, totalQuestions: 10, recordedAnswers: 2, skippedAnswers: 1, secondsRemaining: 22 }))
      .toMatchObject({ kind: 'speaking', phase: 'recording', currentQuestion: 4, secondsRemaining: 22 })
  })
  it('includes Speaking diagnostics in shared practice context', () => {
    const w = workspace(); Object.assign(w.native, { view: 'exam', currentSection: 'speaking' })
    const diagnostics = { preparationStage: null, error: 'Permission dismissed', recoveryAction: 'Check microphone access and retry.' }
    expect(getPracticeProgress(w, { ...diagnostics, phase: 'setup', currentQuestion: 1, totalQuestions: 10, recordedAnswers: 0, skippedAnswers: 0 }))
      .toMatchObject({ kind: 'speaking', ...diagnostics })
  })
})
