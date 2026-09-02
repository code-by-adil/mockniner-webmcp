import { describe, expect, it, vi } from 'vitest'
import { ActiveAttemptError } from '@/application/commands'
import { readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import { parsePracticeContentDocument } from '@/domain/contentDocument'
import { createPracticeToolDefinitions } from './practiceTools'

function toolOptions() {
  return { signal: new AbortController().signal }
}

describe('practice-set WebMCP tool', () => {
  it('exposes IELTS-specific discovery and installation names', () => {
    const tools = createPracticeToolDefinitions({ installContent: vi.fn() })

    expect(tools.map((tool) => tool.name)).toEqual([
      'get_ielts_authoring_kit',
      'install_ielts_practice_set',
    ])
  })

  it('returns only the requested IELTS section schema on demand', async () => {
    const [tool] = createPracticeToolDefinitions({ installContent: vi.fn() })

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
    const [tool] = createPracticeToolDefinitions({ installContent: vi.fn() })

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
    const tools = createPracticeToolDefinitions({
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
    const tool = createPracticeToolDefinitions({ installContent }).find(
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
    const tool = createPracticeToolDefinitions({
      installContent: async (input) => parsePracticeContentDocument(input),
    }).find((item) => item.name === 'install_ielts_practice_set')!

    await expect(
      tool!.execute(writingDocument, undefined as never),
    ).resolves.toMatchObject({ ok: true, data: { section: 'writing' } })
  })

  it('returns paths for a malformed practice set', async () => {
    const tool = createPracticeToolDefinitions({
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
    const tool = createPracticeToolDefinitions({
      installContent: async () => {
        throw new ActiveAttemptError()
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
