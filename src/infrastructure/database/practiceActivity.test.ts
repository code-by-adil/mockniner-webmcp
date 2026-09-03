import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLocal } from 'sqlocal'
import { writingDocument } from '@/content/writing'
import { satPracticeAssessment } from '@/content/sat'
import { gradeAssessment, type AssessmentEvaluation } from '@/domain/assessment'
import type { WritingEvaluation, SpeakingEvaluation } from '@/domain/types'
import { migrateDatabase } from './migrations'
import { createContentStore, saveAndActivateContent, loadActiveContent } from './contentRepository'
import { saveObjectiveAttempt, saveWritingAttempt, saveWritingEvaluation } from './attemptRepository'
import { saveSpeakingAttempt, saveSpeakingEvaluation } from './speakingRepository'
import { saveAssessmentPackage, saveAssessmentAttempt, saveAssessmentEvaluation, deleteAssessmentPackage } from './assessmentRepository'
import { readPracticeActivity, recordPracticeActivity } from './practiceActivity'

let database: SQLocal
const page = { limit: 25, offset: 0 }
const dates = { startedAt: '2026-09-01T10:00:00.000Z', submittedAt: '2026-09-01T11:00:00.000Z' }
const writingInput = () => ({ attemptId: crypto.randomUUID(), contentKey: writingDocument.contentKey, ...dates,
  tasks: [
    { task: writingDocument.tasks[0], response: 'Private essay one.', wordCount: 3 },
    { task: writingDocument.tasks[1], response: 'Private essay two.', wordCount: 3 },
  ] as Parameters<typeof saveWritingAttempt>[1]['tasks'],
})
const speakingInput = () => ({ attemptId: crypto.randomUUID(), contentKey: 'speaking-example', ...dates,
  recordings: [{ status: 'skipped' as const, promptId: 1, partLabel: 'Part 1', sequence: 0,
    promptText: 'Private prompt', timeLimitSeconds: 30, durationMs: 0, audio: null, transcript: '' }],
})
const objectiveInput = (section: 'reading' | 'listening') => ({
  attemptId: crypto.randomUUID(), contentKey: `sample-${section}`, section, ...dates,
  answers: { 1: 'Private answer' },
  result: { section, raw: 0, total: 40 as const, band: 0, answered: 1, correctQuestionIds: [] },
})
const assessmentInput = () => ({ attemptId: crypto.randomUUID(), assessment: satPracticeAssessment,
  responses: {}, result: gradeAssessment(satPracticeAssessment, {}), ...dates })
const writingFeedback = (attemptId: string): WritingEvaluation => {
  const task = { band: 6, taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 6, grammaticalRange: 6, feedback: 'Private feedback', annotations: [] }
  return { attemptId, overallBand: 6, task1: task, task2: task, summary: 'Private summary', evaluatedAt: dates.submittedAt }
}
const speakingFeedback = (attemptId: string): SpeakingEvaluation => ({ attemptId,
  status: 'insufficient_evidence', summary: 'Private feedback', strengths: [], improvements: ['Record a response.'],
  reason: 'No recording.', evaluatedAt: dates.submittedAt,
})
const assessmentFeedback = (attemptId: string): AssessmentEvaluation => ({ attemptId,
  rubricId: 'writing', overallScore: 1, criteria: [{ criterionId: 'clarity', score: 1, feedback: 'Private feedback', evidence: [] }],
  summary: 'Private summary', strengths: ['Clear'], improvements: ['Detail'], annotations: [], evaluatedAt: dates.submittedAt,
})

beforeAll(() => vi.stubGlobal('Worker', class TestWorker {}))
afterAll(() => vi.unstubAllGlobals())
beforeEach(async () => {
  let connected!: () => void
  const ready = new Promise<void>(resolve => { connected = resolve })
  database = new SQLocal({ databasePath: ':memory:', onInit: sql => [sql`PRAGMA foreign_keys = ON`], onConnect: connected })
  await ready
  await migrateDatabase(database)
})
afterEach(async () => { await database.destroy(true) })

describe('saved practice activity', () => {
  it('starts empty and neither reads nor repeated migrations add events', async () => {
    await expect(readPracticeActivity(database, page)).resolves.toEqual({ items: [], nextOffset: null })
    await loadActiveContent(database)
    await migrateDatabase(database)
    await expect(readPracticeActivity(database, page)).resolves.toEqual({ items: [], nextOffset: null })
  })

  it('records a native installation once, rejects conflicts, and reads without changing recency', async () => {
    await saveAndActivateContent(database, writingDocument)
    const first = await readPracticeActivity(database, page)
    expect(first.items).toEqual([expect.objectContaining({ type: 'practice_installed', kind: 'writing', title: writingDocument.name,
      contentKey: writingDocument.contentKey, packageId: null, revision: null, attemptId: null, outcome: null })])
    await Promise.all([saveAndActivateContent(database, writingDocument), saveAndActivateContent(database, writingDocument)])
    await expect(saveAndActivateContent(database, { ...writingDocument, name: 'Changed' })).rejects.toThrow('different data')
    await loadActiveContent(database)
    await migrateDatabase(database)
    await expect(readPracticeActivity(database, page)).resolves.toEqual(first)
  })

  it('does not mistake activating bundled native content for installing new practice', async () => {
    const store = createContentStore(database, undefined, [writingDocument])
    await store.saveAndActivate(writingDocument)
    expect((await readPracticeActivity(database, page)).items).toEqual([])
    const custom = { ...writingDocument, contentKey: 'original-custom-writing', name: 'Custom Writing' }
    await store.saveAndActivate(custom)
    await store.saveAndActivate(writingDocument)
    expect((await readPracticeActivity(database, page)).items).toMatchObject([{ type: 'practice_installed', contentKey: custom.contentKey }])
  })

  it('records package revisions, keeps retry timestamps, and retains historical IDs after removal', async () => {
    await saveAssessmentPackage(database, satPracticeAssessment)
    const installed = await database.sql`SELECT installed_at FROM assessment_packages`
    await Promise.all([saveAssessmentPackage(database, satPracticeAssessment), saveAssessmentPackage(database, satPracticeAssessment)])
    expect(await database.sql`SELECT installed_at FROM assessment_packages`).toEqual(installed)
    const updated = { ...satPracticeAssessment, revision: 2, title: 'Revised practice' }
    await saveAssessmentPackage(database, updated)
    await expect(saveAssessmentPackage(database, satPracticeAssessment)).rejects.toThrow('newer revision')
    await expect(saveAssessmentPackage(database, { ...updated, title: 'Conflicting' })).rejects.toThrow('different data')
    const beforeRemoval = await readPracticeActivity(database, page)
    expect(beforeRemoval.items.map(({ type, revision, title }) => ({ type, revision, title }))).toEqual([
      { type: 'practice_updated', revision: 2, title: updated.title },
      { type: 'practice_installed', revision: 1, title: satPracticeAssessment.title },
    ])
    await deleteAssessmentPackage(database, satPracticeAssessment.packageId)
    expect(await readPracticeActivity(database, page)).toEqual(beforeRemoval)
  })

  it.each(['reading', 'listening'] as const)('records %s submissions once without answers or grading data', async section => {
    const input = objectiveInput(section)
    await Promise.all([saveObjectiveAttempt(database, input), saveObjectiveAttempt(database, input)])
    const { items } = await readPracticeActivity(database, page)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'attempt_submitted', kind: section, attemptId: input.attemptId, title: null })
    expect(JSON.stringify(items)).not.toMatch(/Private|answers|correctQuestionIds|band/)
  })

  it('records Writing feedback on an older attempt as the newest change without response or feedback text', async () => {
    await saveAndActivateContent(database, writingDocument)
    const older = writingInput()
    await saveWritingAttempt(database, older)
    const newer = { ...writingInput(), submittedAt: '2026-09-02T11:00:00.000Z' }
    await saveWritingAttempt(database, newer)
    await saveWritingAttempt(database, older)
    await saveWritingEvaluation(database, writingFeedback(older.attemptId))
    await expect(saveWritingEvaluation(database, writingFeedback(older.attemptId))).resolves.toMatchObject({ revision: 1 })
    const { items } = await readPracticeActivity(database, page)
    expect(items).toHaveLength(4)
    expect(items[0]).toMatchObject({ type: 'feedback_attached', attemptId: older.attemptId, outcome: 'evaluated', title: writingDocument.name })
    expect(items[1]).toMatchObject({ type: 'attempt_submitted', attemptId: newer.attemptId })
    expect(JSON.stringify(items)).not.toMatch(/Private|response|taskAchievement|summary/)
    expect(items[0]!.recordedAt).not.toBe(dates.submittedAt)
  })

  it('records Speaking insufficient evidence without invented bands', async () => {
    const input = speakingInput()
    await Promise.all([saveSpeakingAttempt(database, input), saveSpeakingAttempt(database, input)])
    await saveSpeakingEvaluation(database, speakingFeedback(input.attemptId))
    await expect(saveSpeakingEvaluation(database, speakingFeedback(input.attemptId))).rejects.toThrow('already has an evaluation')
    const { items } = await readPracticeActivity(database, page)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ kind: 'speaking', type: 'feedback_attached', attemptId: input.attemptId, outcome: 'insufficient_evidence' })
    expect(JSON.stringify(items)).not.toMatch(/Private|transcript|band|pronunciationNote/)
  })

  it('uses the submitted universal revision for feedback even after the package changes', async () => {
    const input = assessmentInput()
    await Promise.all([saveAssessmentAttempt(database, input), saveAssessmentAttempt(database, input)])
    await saveAssessmentPackage(database, { ...satPracticeAssessment, revision: 2, title: 'Different revision' })
    await saveAssessmentEvaluation(database, assessmentFeedback(input.attemptId))
    await expect(saveAssessmentEvaluation(database, assessmentFeedback(input.attemptId))).resolves.toMatchObject({ revision: 1 })
    const { items } = await readPracticeActivity(database, page)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ type: 'feedback_attached', kind: 'assessment', revision: 1,
      packageId: satPracticeAssessment.packageId, title: satPracticeAssessment.title, attemptId: input.attemptId })
    expect(JSON.stringify(items)).not.toMatch(/Private|responses|scoring|criteria/)
  })

  it('keeps only 100 events, clips titles, and paginates filtered events in insertion order', async () => {
    await database.transaction(async tx => {
      for (let i = 0; i < 105; i++) await recordPracticeActivity(tx, { type: 'practice_installed', kind: i % 2 ? 'reading' : 'writing', contentKey: `practice-${i}`, title: 'x'.repeat(200) })
    })
    const first = await readPracticeActivity(database, { ...page, kind: 'writing', limit: 2 })
    expect(first.items.map(item => item.contentKey)).toEqual(['practice-104', 'practice-102'])
    expect(first.nextOffset).toBe(2)
    expect(first.items[0]?.title).toHaveLength(160)
    const next = await readPracticeActivity(database, { ...page, kind: 'writing', limit: 2, offset: first.nextOffset! })
    expect(next.items.map(item => item.contentKey)).toEqual(['practice-100', 'practice-98'])
    const last = await readPracticeActivity(database, { ...page, offset: 99 })
    expect(last.items).toHaveLength(1)
    expect(last.items[0]?.contentKey).toBe('practice-5')
    expect(last.nextOffset).toBeNull()
    expect((await readPracticeActivity(database, { ...page, kind: 'speaking' })).items).toEqual([])
  })

  it('does not relog an identical installation after its old event is evicted', async () => {
    await saveAndActivateContent(database, writingDocument)
    await database.transaction(async tx => {
      for (let i = 0; i < 100; i++) await recordPracticeActivity(tx, { type: 'practice_installed', kind: 'reading', contentKey: `practice-${i}` })
    })
    const before = await readPracticeActivity(database, page)
    await saveAndActivateContent(database, writingDocument)
    expect(await readPracticeActivity(database, page)).toEqual(before)
  })

  it('rolls back event insertion and retention if the surrounding transaction fails', async () => {
    await saveAndActivateContent(database, writingDocument)
    const before = await readPracticeActivity(database, page)
    await expect(database.transaction(async tx => {
      await recordPracticeActivity(tx, { type: 'practice_installed', kind: 'reading', contentKey: 'failed' })
      throw new Error('later failure')
    })).rejects.toThrow('later failure')
    expect(await readPracticeActivity(database, page)).toEqual(before)
  })

  it.each(['native_install', 'package_install', 'reading_submit', 'writing_submit', 'speaking_submit', 'assessment_submit', 'writing_feedback', 'speaking_feedback', 'assessment_feedback'])(
    'rolls back the business record when activity persistence fails: %s', async operation => {
      const writing = writingInput(), speaking = speakingInput(), assessment = assessmentInput()
      if (operation === 'writing_feedback') await saveWritingAttempt(database, writing)
      if (operation === 'speaking_feedback') await saveSpeakingAttempt(database, speaking)
      if (operation === 'assessment_feedback') await saveAssessmentAttempt(database, assessment)
      const before = await readPracticeActivity(database, page)
      await database.sql`CREATE TRIGGER reject_activity BEFORE INSERT ON practice_activity BEGIN SELECT RAISE(ABORT, 'activity failure'); END`
      const actions: Record<string, () => Promise<unknown>> = {
        native_install: () => saveAndActivateContent(database, writingDocument),
        package_install: () => saveAssessmentPackage(database, satPracticeAssessment),
        reading_submit: () => saveObjectiveAttempt(database, objectiveInput('reading')),
        writing_submit: () => saveWritingAttempt(database, writing),
        speaking_submit: () => saveSpeakingAttempt(database, speaking),
        assessment_submit: () => saveAssessmentAttempt(database, assessment),
        writing_feedback: () => saveWritingEvaluation(database, writingFeedback(writing.attemptId)),
        speaking_feedback: () => saveSpeakingEvaluation(database, speakingFeedback(speaking.attemptId)),
        assessment_feedback: () => saveAssessmentEvaluation(database, assessmentFeedback(assessment.attemptId)),
      }
      await expect(actions[operation]!()).rejects.toThrow('activity failure')
      expect(await readPracticeActivity(database, page)).toEqual(before)
      for (const table of ['content_documents', 'active_content', 'assessment_packages', 'writing_evaluations', 'speaking_evaluations', 'assessment_evaluations']) {
        expect(await database.sql(`SELECT * FROM ${table}`)).toEqual([])
      }
      if (!operation.endsWith('_feedback')) {
        expect(await database.sql`SELECT * FROM attempts`).toEqual([])
        expect(await database.sql`SELECT * FROM assessment_attempts`).toEqual([])
      } else if (operation !== 'assessment_feedback') {
        expect(await database.sql`SELECT status FROM attempts`).toEqual([{ status: 'submitted' }])
      }
    },
  )
})
