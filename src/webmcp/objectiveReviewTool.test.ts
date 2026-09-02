import { describe, expect, it, vi } from 'vitest'
import { listeningDocument, readingDocument } from '@/content/objective'
import { gradeObjectiveDocument } from '@/domain/objectiveScoring'
import { createObjectiveReviewTool } from './objectiveReviewTool'

const id = '33333333-3333-4333-8333-333333333333'
function setup(section: 'reading' | 'listening' = 'reading') {
  const document = section === 'reading' ? readingDocument : listeningDocument
  const answers = { 1: 'Learner response', 14: 'Another response' }
  const submission = { attemptId: id, contentKey: document.contentKey, section, answers,
    result: gradeObjectiveDocument(document, answers), startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T10:10:00Z' }
  const deps = { readAttempt: vi.fn(async () => submission), loadContent: vi.fn(async () => document), visibleId: vi.fn((): string | undefined => id) }
  return { ...deps, submission, document, tool: createObjectiveReviewTool(deps) }
}
const options = () => ({ signal: new AbortController().signal })

describe('submitted objective review', () => {
  it.each(['reading', 'listening'] as const)('returns only the selected %s part with saved correctness', async section => {
    const h = setup(section)
    const result = await h.tool.execute({ section, part: 2 }, options())
    expect(result).toMatchObject({ ok: true, data: { attemptId: id, part: h.document.parts[1],
      selection: { mode: 'visible', isVisible: true }, questions: expect.arrayContaining([{ questionId: 14, response: 'Another response', correct: false }]) } })
    expect(result).not.toHaveProperty('data.audio')
    expect(JSON.stringify(result)).not.toContain('Learner response')
  })
  it('never falls back to history while a draft or home screen is visible', async () => {
    const h = setup(); h.visibleId.mockReturnValue(undefined)
    expect(await h.tool.execute({ section: 'reading' }, options())).toMatchObject({ ok: false, error: { code: 'NO_VISIBLE_SUBMISSION' } })
    expect(h.readAttempt).not.toHaveBeenCalled()
  })
  it('supports explicit history and latest scoped to the requested section', async () => {
    const h = setup(); h.visibleId.mockReturnValue(undefined)
    expect(await h.tool.execute({ section: 'reading', latest: true }, options())).toMatchObject({ ok: true, data: { selection: { mode: 'latest', isVisible: false } } })
    expect(h.readAttempt).toHaveBeenCalledWith(undefined, 'reading')
    await h.tool.execute({ section: 'reading', attemptId: id }, options())
    expect(h.readAttempt).toHaveBeenCalledWith(id, 'reading')
  })
  it('fails closed on content/section mismatch and invalid part', async () => {
    const h = setup()
    expect(await h.tool.execute({ section: 'reading', part: 4 }, options())).toMatchObject({ ok: false, error: { code: 'PART_NOT_FOUND' } })
    h.loadContent.mockResolvedValue({ ...readingDocument, contentKey: 'wrong' })
    expect(await h.tool.execute({ section: 'reading' }, options())).toMatchObject({ ok: false, error: { code: 'REVIEW_CONTENT_MISMATCH' } })
  })
  it('detects navigation during content loading', async () => {
    const h = setup()
    h.loadContent.mockImplementation(async () => { h.visibleId.mockReturnValue(undefined); return readingDocument })
    expect(await h.tool.execute({ section: 'reading' }, options())).toMatchObject({ ok: false, error: { code: 'VISIBLE_ATTEMPT_CHANGED' } })
  })
  it('rejects ambiguous selection and aborted calls before storage access', async () => {
    const h = setup()
    expect(await h.tool.execute({ section: 'reading', attemptId: id, latest: true }, options())).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    const controller = new AbortController(); controller.abort()
    await expect(h.tool.execute({ section: 'reading' }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.readAttempt).not.toHaveBeenCalled()
  })
})
