import { describe, expect, it, vi } from 'vitest'
import { writingDocument } from '@/content/writing'
import { satPracticeAssessment } from '@/content/sat'
import { gradeAssessment, type AssessmentSubmission } from '@/domain/assessment'
import type { SpeakingSubmission, WritingSubmission } from '@/domain/types'
import { createAssessmentToolDefinitions } from './assessmentTools'
import { createWritingToolDefinitions } from './writingTools'
import { createSpeakingToolDefinitions } from './speakingTools'

const olderId = '11111111-1111-4111-8111-111111111111'
const newerId = '22222222-2222-4222-8222-222222222222'
const dates = { startedAt: '2026-09-01T10:00:00Z', submittedAt: '2026-09-01T10:15:00Z' }
const writing: WritingSubmission = { ...dates, attemptId: olderId, contentKey: 'writing', tasks: [
  { task: writingDocument.tasks[0], response: 'Older first answer.', wordCount: 3 },
  { task: writingDocument.tasks[1], response: 'Older second answer.', wordCount: 3 },
] }
const speaking: SpeakingSubmission = { ...dates, attemptId: olderId, contentKey: 'speaking', responses: [] }
const assessment: AssessmentSubmission = { ...dates, attemptId: olderId, packageId: satPracticeAssessment.packageId,
  package: satPracticeAssessment, responses: {}, result: gradeAssessment(satPracticeAssessment, {}) }

function harness(kind: 'assessment' | 'writing' | 'speaking') {
  let visible: string | undefined = olderId
  const source = kind === 'assessment' ? assessment : kind === 'writing' ? writing : speaking
  const read = vi.fn(async (id?: string) => ({ submission: { ...source, attemptId: id ?? newerId }, evaluation: null }))
  const getVisibleId = () => visible
  // Each factory gets its correctly typed repository interface. The shared fake
  // only changes identity, matching the repository's latest-on-undefined rule.
  const tools = kind === 'assessment' ? createAssessmentToolDefinitions({ attachEvaluation: vi.fn(),
    readAssessmentAttempt: async id => await read(id) as { submission: AssessmentSubmission; evaluation: null }, getCurrentAttemptId: getVisibleId })
    : kind === 'writing' ? createWritingToolDefinitions({ attachWritingEvaluation: vi.fn(),
      readWritingAttempt: async id => await read(id) as { submission: WritingSubmission; evaluation: null }, getCurrentWritingAttemptId: getVisibleId })
      : createSpeakingToolDefinitions({ attachSpeakingEvaluation: vi.fn(),
        readSpeakingAttempt: async id => await read(id) as { submission: SpeakingSubmission; evaluation: null }, getCurrentSpeakingAttemptId: getVisibleId })
  const tool = tools.find(tool => tool.name.endsWith('_submission'))!
  return { read, setVisible: (id?: string) => { visible = id },
    call: (input: Record<string, unknown>, signal = new AbortController().signal) => tool.execute(input, { signal }) }
}

describe.each(['assessment', 'writing', 'speaking'] as const)('%s submission identity', kind => {
  it('defaults to the visible older attempt rather than the newest saved attempt', async () => {
    const h = harness(kind)
    await expect(h.call({})).resolves.toMatchObject({ ok: true, data: {
      submission: { attemptId: olderId }, selection: { mode: 'visible', isVisible: true }, evaluation: null,
    } })
    expect(h.read).toHaveBeenCalledWith(olderId)
  })
  it('reads latest only when explicitly requested and marks it as not visible', async () => {
    const h = harness(kind)
    await expect(h.call({ latest: true })).resolves.toMatchObject({ ok: true, data: {
      submission: { attemptId: newerId }, selection: { mode: 'latest', isVisible: false }, canAttachEvaluation: false,
    } })
    expect(h.read).toHaveBeenCalledWith(undefined)
  })
  it('uses an explicit ID without changing the default visible selection', async () => {
    const h = harness(kind)
    await expect(h.call({ attemptId: newerId })).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: newerId }, selection: { mode: 'id', isVisible: false } } })
    await expect(h.call({})).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: olderId } } })
  })
  it('does not silently read latest when no submission is visible', async () => {
    const h = harness(kind); h.setVisible(undefined)
    await expect(h.call({})).resolves.toMatchObject({ ok: false, error: { code: 'NO_VISIBLE_SUBMISSION' } })
    expect(h.read).not.toHaveBeenCalled()
  })
  it.each([{ latest: true, attemptId: olderId }, { attemptId: 'wrong-id' }, { latest: false }, { unexpected: 1 }])('rejects ambiguous or invalid input %j', async input => {
    const h = harness(kind)
    await expect(h.call(input)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(h.read).not.toHaveBeenCalled()
  })
  it('rejects a default read if the user switches attempts during storage access', async () => {
    const h = harness(kind)
    const pending = h.call({}); h.setVisible(newerId)
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'VISIBLE_ATTEMPT_CHANGED' } })
  })
  it('keeps an explicit read pinned through navigation', async () => {
    const h = harness(kind)
    const pending = h.call({ attemptId: olderId }); h.setVisible(newerId)
    await expect(pending).resolves.toMatchObject({ ok: true, data: { submission: { attemptId: olderId }, selection: { isVisible: false }, canAttachEvaluation: false } })
  })
  it('rejects a storage identity mismatch', async () => {
    const h = harness(kind)
    const wrong = await h.read(newerId)
    h.read.mockResolvedValueOnce(wrong)
    await expect(h.call({})).resolves.toMatchObject({ ok: false, error: { code: 'SUBMISSION_ID_MISMATCH' } })
  })
  it('still honours cancellation after the read', async () => {
    const h = harness(kind); const controller = new AbortController()
    const pending = h.call({}, controller.signal); controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
