import { describe, expect, it, vi } from 'vitest'
import { ApplicationError } from '@/domain/errors'
import { readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { parsePracticeContentDocument } from '@/domain/contentDocument'
import { createIeltsAuthoringToolDefinitions } from './ieltsAuthoringTools'
import { getIeltsAuthoringKit } from './ieltsAuthoring'
import type { ListeningAudioStatus } from '@/application/listeningAudioStatus'

function toolOptions() {
  return { signal: new AbortController().signal }
}

describe('practice-set WebMCP tool', () => {
  it.each(['listening', 'reading', 'writing'] as const)('provides a complete, installable %s example without sharing mutable source content', async section => {
    const kit = getIeltsAuthoringKit(section)
    const example = parsePracticeContentDocument(kit.exampleDocument)
    expect(example.section).toBe(section)
    const status: ListeningAudioStatus = { contentKey: example.contentKey, source: 'kokoro', phase: 'loading', readyToPlay: false, completedChunks: 0, totalChunks: null, error: null, canRetry: false }
    const tools = createIeltsAuthoringToolDefinitions({ readListeningAudio: () => status, installContent: async input => parsePracticeContentDocument(input) })
    await expect(tools[1]!.execute(kit.exampleDocument, toolOptions())).resolves.toMatchObject({ ok: true, data: { section, active: true, name: example.name } })
    if (example.section === 'listening') expect(example.audio).toMatchObject({ type: 'kokoro', parts: expect.any(Array) })
    kit.exampleDocument.name = 'Changed copy'
    expect(getIeltsAuthoringKit(section).exampleDocument.name).toBe(example.name)
  })

  it.each(['loading', 'generating', 'ready', 'error'] as const)('returns the actual %s audio status after Listening installation', async phase => {
    const example = getIeltsAuthoringKit('listening').exampleDocument
    const status: ListeningAudioStatus = { contentKey: example.contentKey, source: 'kokoro', phase, readyToPlay: phase === 'ready',
      completedChunks: phase === 'loading' ? 0 : 2, totalChunks: phase === 'loading' ? null : 10, error: phase === 'error' ? 'Synthetic failure.' : null, canRetry: phase === 'error' }
    const tool = createIeltsAuthoringToolDefinitions({ installContent: async input => parsePracticeContentDocument(input), readListeningAudio: () => status })[1]!
    await expect(tool.execute(example, toolOptions())).resolves.toMatchObject({ ok: true, data: { active: true, listeningAudio: status } })
  })
  it('exposes IELTS-specific discovery and installation names', () => {
    const tools = createIeltsAuthoringToolDefinitions({ installContent: vi.fn(), readListeningAudio: vi.fn() })

    expect(tools.map((tool) => tool.name)).toEqual([
      'get_ielts_authoring_kit',
      'install_ielts_practice_set',
    ])
  })

  it('returns only the requested IELTS section schema on demand', async () => {
    const [tool] = createIeltsAuthoringToolDefinitions({ installContent: vi.fn(), readListeningAudio: vi.fn() })

    const result = await tool!.execute({ section: 'reading' }, toolOptions())

    expect(result).toMatchObject({
      ok: true,
      data: {
        section: 'reading',
        nextAction: expect.stringContaining('install_ielts_practice_set'),
        documentSchema: {
          properties: { section: { const: 'reading' } },
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain('"const":"listening"')
  })

  it('returns actionable paths for an invalid authoring-kit request', async () => {
    const [tool] = createIeltsAuthoringToolDefinitions({ installContent: vi.fn(), readListeningAudio: vi.fn() })

    await expect(
      tool!.execute({ section: 'speaking' }, toolOptions()),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_IELTS_AUTHORING_SECTION',
        retryable: true,
        issues: [{ path: 'section' }],
      },
    })
  })

  it('discovers and installs a complete section through the full runtime parser', async () => {
    const tools = createIeltsAuthoringToolDefinitions({
      readListeningAudio: vi.fn(),
      installContent: async (input) => parsePracticeContentDocument(input),
    })
    const kitTool = tools.find((tool) => tool.name === 'get_ielts_authoring_kit')!
    const installTool = tools.find((tool) => tool.name === 'install_ielts_practice_set')!
    const authoredReading = {
      ...readingDocument,
      contentKey: 'agent-reading-workflow',
      name: 'Agent Reading Workflow',
    }

    await expect(
      kitTool.execute({ section: 'reading' }, toolOptions()),
    ).resolves.toMatchObject({ ok: true, data: { section: 'reading' } })
    await expect(
      installTool.execute(authoredReading, toolOptions()),
    ).resolves.toMatchObject({
      ok: true,
      data: { section: 'reading', itemCount: 40, source: 'agent' },
    })
  })

  it('installs canonical content and returns only visible activation metadata', async () => {
    const replacement = {
      ...writingDocument,
      contentKey: 'agent-writing-v1',
      name: 'Agent-created Writing practice',
    }
    const installed = { ...replacement, source: 'agent' as const }
    const installContent = vi.fn(async () => installed)
    const tool = createIeltsAuthoringToolDefinitions({ installContent, readListeningAudio: vi.fn() }).find(
      (item) => item.name === 'install_ielts_practice_set',
    )!

    const result = await tool!.execute(replacement, toolOptions())

    expect(installContent).toHaveBeenCalledWith({ ...replacement, source: 'agent' })
    expect(result).toEqual({
      ok: true,
      data: {
        contentKey: replacement.contentKey,
        section: 'writing',
        name: replacement.name,
        schemaVersion: 1,
        source: 'agent',
        itemCount: 2,
        active: true,
      },
      sideEffect: {
        type: 'practice_set_installed',
        visibleView: 'home',
      },
    })
    expect(tool!.annotations).toMatchObject({
      readOnlyHint: false,
      untrustedContentHint: true,
    })
    expect(tool.description).toContain('get_ielts_authoring_kit')
    expect(tool.description).not.toContain('install_assessment')
  })

  it('supports native clients that omit callback options', async () => {
    const tool = createIeltsAuthoringToolDefinitions({
      readListeningAudio: vi.fn(),
      installContent: async (input) => parsePracticeContentDocument(input),
    }).find((item) => item.name === 'install_ielts_practice_set')!

    await expect(
      tool!.execute(writingDocument, undefined as never),
    ).resolves.toMatchObject({ ok: true, data: { section: 'writing' } })
  })

  it('returns paths for a malformed practice set', async () => {
    const tool = createIeltsAuthoringToolDefinitions({
      readListeningAudio: vi.fn(),
      installContent: async (input) => parsePracticeContentDocument(input),
    }).find((item) => item.name === 'install_ielts_practice_set')!

    await expect(
      tool!.execute({ section: 'writing', tasks: [] }, toolOptions()),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_PRACTICE_SET',
        retryable: true,
        issues: expect.arrayContaining([
          { path: 'schemaVersion', message: expect.any(String) },
          { path: 'contentKey', message: expect.any(String) },
          { path: 'tasks', message: expect.any(String) },
        ]),
      },
    })
  })

  it('reports an active attempt without replacing learner state', async () => {
    const tool = createIeltsAuthoringToolDefinitions({
      readListeningAudio: vi.fn(),
      installContent: async () => {
        throw new ApplicationError('ACTIVE_ATTEMPT', 'Finish your unfinished IELTS attempt first.', true)
      },
    }).find((item) => item.name === 'install_ielts_practice_set')!

    await expect(
      tool!.execute(writingDocument, toolOptions()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'ACTIVE_ATTEMPT', retryable: true },
    })
  })
})
