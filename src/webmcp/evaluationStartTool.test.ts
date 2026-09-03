import { describe, it, expect, vi } from 'vitest'
import { createEvaluationStartTool } from './evaluationStartTool'
import { createWritingToolDefinitions } from './writingTools'
import { createAssessmentToolDefinitions } from './assessmentTools'
import type { WritingSubmission } from '@/domain/types'
import { writingDocument } from '@/content/writing'
import { getAssessmentAuthoringKit } from '@/content/assessmentExamples'
import { gradeAssessment, parseAssessmentPackage } from '@/domain/assessment'
import { ApplicationError } from '@/domain/errors'

const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const submission: WritingSubmission = { attemptId: id, contentKey: writingDocument.contentKey, startedAt: '', submittedAt: '',
  tasks: [{ task: writingDocument.tasks[0], response: 'Chart response.', wordCount: 2 }, { task: writingDocument.tasks[1], response: 'Essay response.', wordCount: 2 }] }
function harness() {
  let visible: string | undefined
  const abort = new AbortController()
  const read = vi.fn(async (_id?: string) => ({ submission, evaluation: null }))
  const tools = createWritingToolDefinitions({ readWritingAttempt: read, getCurrentWritingAttemptId: () => visible, attachWritingEvaluation: vi.fn() })
  const begin = vi.fn()
  const navigate = vi.fn(async () => { visible = id })
  const tool = createEvaluationStartTool({ tools, begin, navigate })
  return { tool, read, begin, navigate, abort, setVisible: (value?: string) => { visible = value }, options: { signal: abort.signal } }
}

describe('beginning evaluation', () => {
  it('opens the exact historical attempt and returns its responses, guide and save contract with progress', async () => {
    const h = harness()
    const result = await h.tool.execute({ kind: 'writing', attemptId: id }, h.options)
    expect(h.navigate).toHaveBeenCalledWith({ action: 'result', kind: 'writing', attemptId: id }, h.options)
    expect(h.begin).toHaveBeenCalledWith('writing', id)
    expect(result).toMatchObject({ ok: true, data: { submission, selection: { isVisible: true }, canAttachEvaluation: true,
      activityStatus: 'evaluating', attachTool: 'attach_ielts_writing_evaluation', evaluationGuidance: { criteria: { taskAchievement: expect.any(String) } },
      evaluationSchema: { properties: { task1: expect.any(Object), task2: expect.any(Object) } } } })
  })
  it('does not choose the newest submission implicitly or start progress for missing work', async () => {
    const h = harness()
    expect(await h.tool.execute({ kind: 'writing' }, h.options)).toMatchObject({ ok: false, error: { code: 'NO_VISIBLE_SUBMISSION' } })
    expect(h.read).not.toHaveBeenCalled()
    expect(h.navigate).not.toHaveBeenCalled()
    expect(h.begin).not.toHaveBeenCalled()
  })
  it('resolves an explicit latest selection once and pins opening to that ID', async () => {
    const h = harness()
    expect(await h.tool.execute({ kind: 'writing', latest: true }, h.options)).toMatchObject({ ok: true })
    expect(h.read.mock.calls.map(call => call[0])).toEqual([undefined, id])
    expect(h.begin).toHaveBeenCalledWith('writing', id)
  })
  it('does not signal evaluation when navigation is blocked', async () => {
    const h = harness()
    h.navigate.mockRejectedValue(new ApplicationError('SPEAKING_IN_PROGRESS', 'Finish the interview.'))
    expect(await h.tool.execute({ kind: 'writing', attemptId: id }, h.options)).toMatchObject({ ok: false, error: { code: 'SPEAKING_IN_PROGRESS' } })
    expect(h.begin).not.toHaveBeenCalled()
  })
  it('rechecks the visible attempt after navigation', async () => {
    const h = harness()
    h.navigate.mockImplementation(async () => { h.setVisible(other) })
    expect(await h.tool.execute({ kind: 'writing', attemptId: id }, h.options)).toMatchObject({ ok: false, error: { code: 'EVALUATION_NOT_AVAILABLE' } })
    expect(h.begin).not.toHaveBeenCalled()
  })
  it('does not publish progress after cancellation during the read', async () => {
    const h = harness()
    h.read.mockImplementation(async () => { h.abort.abort(); return { submission, evaluation: null } })
    await expect(h.tool.execute({ kind: 'writing', attemptId: id }, h.options)).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.navigate).not.toHaveBeenCalled()
    expect(h.begin).not.toHaveBeenCalled()
  })
  it('rejects conflicting selectors before reading', async () => {
    const h = harness()
    expect(await h.tool.execute({ kind: 'writing', attemptId: id, latest: true }, h.options)).toMatchObject({ ok: false })
    expect(h.read).not.toHaveBeenCalled()
  })
  it('preserves restricted assessment review while returning rubric responses', async () => {
    const assessment = parseAssessmentPackage({ ...getAssessmentAuthoringKit('writing-with-rubric').examplePackage, source: 'agent', review: { mode: 'none' } })
    const responses = { 'public-library-essay': 'Libraries should remain accessible.' }
    const saved = { attemptId: id, packageId: assessment.packageId, package: assessment, responses, result: gradeAssessment(assessment, responses), startedAt: '', submittedAt: '' }
    const tools = createAssessmentToolDefinitions({ readAssessmentAttempt: async () => ({ submission: saved, evaluation: null }), getCurrentAttemptId: () => id, attachEvaluation: vi.fn() })
    const begin = vi.fn()
    const tool = createEvaluationStartTool({ tools, begin, navigate: vi.fn() })
    expect(await tool.execute({ kind: 'assessment' }, { signal: new AbortController().signal })).toMatchObject({ ok: true, data: { submission: { responses, package: { rubric: assessment.rubric } }, attachTool: 'attach_assessment_evaluation' } })
    expect(begin).toHaveBeenCalledWith('assessment', id)
  })
  it('does not start an agent evaluation for an objective-only assessment', async () => {
    const assessment = parseAssessmentPackage({ ...getAssessmentAuthoringKit('minimal-objective').examplePackage, source: 'agent' })
    const saved = { attemptId: id, packageId: assessment.packageId, package: assessment, responses: {}, result: gradeAssessment(assessment, {}), startedAt: '', submittedAt: '' }
    const tools = createAssessmentToolDefinitions({ readAssessmentAttempt: async () => ({ submission: saved, evaluation: null }), getCurrentAttemptId: () => id, attachEvaluation: vi.fn() })
    const begin = vi.fn(), navigate = vi.fn()
    expect(await createEvaluationStartTool({ tools, begin, navigate }).execute({ kind: 'assessment' }, { signal: new AbortController().signal })).toMatchObject({ ok: false, error: { code: 'EVALUATION_NOT_REQUIRED' } })
    expect(navigate).not.toHaveBeenCalled()
    expect(begin).not.toHaveBeenCalled()
  })
})
