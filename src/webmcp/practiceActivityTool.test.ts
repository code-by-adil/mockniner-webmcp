import { describe, expect, it, vi } from 'vitest'
import { createPracticeActivityTool } from './practiceActivityTool'

const options = () => ({ signal: new AbortController().signal })

describe('recent activity tool', () => {
  it('is read-only, marks titles untrusted, and defaults to five events', async () => {
    const read = vi.fn().mockResolvedValue({ items: [], nextOffset: null })
    const tool = createPracticeActivityTool(read)
    expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true })
    expect(tool.description).toContain('ask if the target is ambiguous')
    expect(tool.inputSchema).toMatchObject({ additionalProperties: false })
    await expect(tool.execute({}, options())).resolves.toEqual({ ok: true, data: { items: [], nextOffset: null } })
    expect(read).toHaveBeenCalledWith({ limit: 5, offset: 0 })
  })

  it('accepts a kind and pagination and tolerates absent native callback options', async () => {
    const read = vi.fn().mockResolvedValue({ items: [], nextOffset: null })
    await createPracticeActivityTool(read).execute({ kind: 'writing', limit: 25, offset: 5 }, undefined as never)
    expect(read).toHaveBeenCalledWith({ kind: 'writing', limit: 25, offset: 5 })
  })

  it.each([{ limit: 0 }, { limit: 26 }, { limit: 1.5 }, { limit: '5' }, { offset: -1 }, { offset: 101 }, { kind: 'gre' }, { type: 'page_load' }, { event: 'fake' }])(
    'rejects invalid input without reading: %j', async input => {
      const read = vi.fn()
      await expect(createPracticeActivityTool(read).execute(input, options())).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', retryable: true } })
      expect(read).not.toHaveBeenCalled()
    },
  )

  it('honors cancellation before and after the read', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    const read = vi.fn()
    await expect(createPracticeActivityTool(read).execute({}, { signal: controller.signal })).rejects.toThrow('cancelled')
    expect(read).not.toHaveBeenCalled()
    const duringRead = new AbortController()
    read.mockImplementation(async () => { duringRead.abort(new Error('cancelled')); return { items: [], nextOffset: null } })
    await expect(createPracticeActivityTool(read).execute({}, { signal: duringRead.signal })).rejects.toThrow('cancelled')
  })

  it('does not report an empty feed when persistence fails', async () => {
    await expect(createPracticeActivityTool(async () => { throw new Error('storage unavailable') }).execute({}, options())).rejects.toThrow('storage unavailable')
  })
})
