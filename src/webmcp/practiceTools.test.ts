import { describe, expect, it, vi } from 'vitest'
import { ActiveAttemptError } from '@/application/commands'
import { writingDocument } from '@/content/writing'
import { parsePracticeContentDocument } from '@/domain/contentDocument'
import { createPracticeToolDefinitions } from './practiceTools'

function toolOptions() {
  return { signal: new AbortController().signal }
}

describe('practice-set WebMCP tool', () => {
  it('installs canonical content and returns only visible activation metadata', async () => {
    const replacement = {
      ...writingDocument,
      contentKey: 'agent-writing-v1',
      name: 'Agent-created Writing practice',
    }
    const installed = { ...replacement, source: 'agent' as const }
    const installContent = vi.fn(async () => installed)
    const [tool] = createPracticeToolDefinitions({ installContent })

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
    expect(tool!.annotations).toMatchObject({ readOnlyHint: false })
  })

  it('returns paths for a malformed practice set', async () => {
    const [tool] = createPracticeToolDefinitions({
      installContent: async (input) => parsePracticeContentDocument(input),
    })

    await expect(
      tool!.execute({ section: 'writing', tasks: [] }, toolOptions()),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_PRACTICE_SET',
        retryable: true,
        issues: expect.any(Array),
      },
    })
  })

  it('reports an active attempt without replacing learner state', async () => {
    const [tool] = createPracticeToolDefinitions({
      installContent: async () => {
        throw new ActiveAttemptError()
      },
    })

    await expect(
      tool!.execute(writingDocument, toolOptions()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'ACTIVE_ATTEMPT', retryable: true },
    })
  })
})
