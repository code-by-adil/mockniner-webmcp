import { describe, expect, it, vi } from 'vitest'
import { ApplicationError } from '@/domain/errors'
import { parsePracticeContentDocument } from '@/domain/contentDocument'
import { parseAssessmentAuthoringPackage } from '@/domain/assessment'
import { getIeltsExample } from '@/content/ieltsExamples'
import { getAssessmentAuthoringKit } from '@/content/assessmentExamples'
import { createIeltsAuthoringToolDefinitions } from './ieltsAuthoringTools'
import { createAssessmentAuthoringToolDefinitions } from './assessmentTools'

const audio = { contentKey: 'example-ielts-listening', source: 'kokoro' as const, phase: 'loading' as const, readyToPlay: false, completedChunks: 0, totalChunks: null, error: null, canRetry: false }
const options = () => ({ signal: new AbortController().signal })
describe('installation hands practice to the learner', () => {
  function native(openPractice = vi.fn(async () => ({ view: 'exam', status: 'audio_preparing' })), installContent = vi.fn(async (input: unknown) => parsePracticeContentDocument(input))) {
    const tools = createIeltsAuthoringToolDefinitions({ openPractice, installContent, readListeningAudio: () => audio })
    return { tool: tools[1]!, openPractice, installContent }
  }
  it('saves the full Listening document, then opens it before audio is ready', async () => {
    const h = native()
    const result = await h.tool.execute(getIeltsExample('listening'), options())
    expect(result).toMatchObject({ ok: true, data: { itemCount: 40, active: true, opened: true, listeningAudio: { readyToPlay: false }, navigation: { status: 'audio_preparing' } }, sideEffect: { visibleView: 'exam' } })
    expect(h.openPractice).toHaveBeenCalledWith({ action: 'start', kind: 'listening', contentKey: audio.contentKey }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(h.installContent.mock.invocationCallOrder[0]).toBeLessThan(h.openPractice.mock.invocationCallOrder[0]!)
  })
  it('honors save-for-later without persisting the tool-only option', async () => {
    const h = native()
    const result = await h.tool.execute({ ...getIeltsExample('listening'), openAfterInstall: false }, options())
    expect(result).toMatchObject({ ok: true, data: { active: true, opened: false, status: 'saved' }, sideEffect: { visibleView: 'home' } })
    expect(h.openPractice).not.toHaveBeenCalled()
    expect(h.installContent.mock.calls[0]![0]).not.toHaveProperty('openAfterInstall')
  })
  it('reports a saved set and an exact recovery action if a draft blocks opening', async () => {
    const h = native(vi.fn(async () => { throw new ApplicationError('ACTIVE_ATTEMPT', 'Resume the unfinished attempt.', true) }))
    expect(await h.tool.execute(getIeltsExample('reading'), options())).toMatchObject({ ok: true, data: { active: true, opened: false, status: 'saved', openingError: { code: 'ACTIVE_ATTEMPT' }, openAction: { action: 'start', kind: 'reading', contentKey: 'example-ielts-reading' } } })
    expect(h.installContent).toHaveBeenCalledOnce()
  })
  it('does not open after cancellation during a committed save and reports that the set remains saved', async () => {
    const controller = new AbortController()
    const h = native(undefined, vi.fn(async (input: unknown) => { controller.abort(); return parsePracticeContentDocument(input) }))
    expect(await h.tool.execute(getIeltsExample('writing'), { signal: controller.signal })).toMatchObject({ ok: true, data: { active: true, opened: false, status: 'saved' } })
    expect(h.openPractice).not.toHaveBeenCalled()
  })
  it('never opens a rejected document', async () => {
    const h = native()
    expect(await h.tool.execute({ section: 'listening', openAfterInstall: true }, options())).toMatchObject({ ok: false, error: { code: 'INVALID_PRACTICE_SET' } })
    expect(h.openPractice).not.toHaveBeenCalled()
  })
  it.each(['sat-style', 'gre-style'] as const)('opens the saved %s package by its exact ID', async template => {
    const openPractice = vi.fn(async () => ({ view: 'exam' }))
    const installAssessment = vi.fn(async (input: unknown) => ({ ...parseAssessmentAuthoringPackage(input), source: 'agent' as const }))
    const tool = createAssessmentAuthoringToolDefinitions({ openPractice, installAssessment })[1]!
    const example = getAssessmentAuthoringKit(template).examplePackage
    const result = await tool.execute(example, options())
    expect(result).toMatchObject({ ok: true, data: { installed: true, opened: true, packageId: example.packageId }, sideEffect: { visibleView: 'assessment' } })
    expect(openPractice).toHaveBeenCalledWith({ action: 'start', kind: 'assessment', packageId: example.packageId }, expect.anything())
  })
  it('returns the complete example without loading the full schema, with schema available on request', async () => {
    const kit = createIeltsAuthoringToolDefinitions({ installContent: vi.fn(), openPractice: vi.fn(), readListeningAudio: () => audio })[0]!
    const result = await kit.execute({ section: 'listening' }, options())
    expect(result).toMatchObject({ ok: true, data: { schemaIncluded: false, exampleDocument: { parts: expect.any(Array) } } })
    expect(result).not.toHaveProperty('data.documentSchema')
    expect(await kit.execute({ section: 'listening', includeSchema: true }, options())).toHaveProperty('data.documentSchema')
  })
})
