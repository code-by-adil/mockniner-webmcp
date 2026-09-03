// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writingDocument } from '@/content/writing'
import { PendingWritingReview } from './PendingWritingReview'

let root: Root
let host: HTMLDivElement
const submission = {
  attemptId: '11111111-1111-4111-8111-111111111111', contentKey: writingDocument.contentKey,
  startedAt: '2026-09-03T10:00:00Z', submittedAt: '2026-09-03T11:00:00Z',
  tasks: [
    { task: writingDocument.tasks[0], response: '<script>alert(1)</script>\n\nSaved report.', wordCount: 3 },
    { task: writingDocument.tasks[1], response: '', wordCount: 0 },
  ] as import('@/domain/types').WritingSubmission['tasks'],
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<PendingWritingReview submission={submission} onExit={() => undefined} />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const copyButton = () => [...host.querySelectorAll('button')].find(button => /Copy|Copied/.test(button.textContent ?? ''))!

describe('pending Writing submission', () => {
  it('focuses the requested task before feedback exists', async () => {
    for (const selectedTask of [2, 1]) {
      await act(async () => root.render(<PendingWritingReview submission={submission} selectedTask={selectedTask} focusRequest={{ selectedTask }} onExit={() => undefined} />))
      expect(document.activeElement?.getAttribute('aria-labelledby')).toBe(`submitted-writing-task-${selectedTask}`)
    }
  })
  it('renders saved text literally and provides an empty-response state', () => {
    expect(host.querySelector('script')).toBeNull()
    expect(host.textContent).toContain('<script>alert(1)</script>\n\nSaved report.')
    expect(host.textContent).toContain('No response submitted.')
    expect(host.querySelector('textarea, input, [contenteditable]')).toBeNull()
  })
  it('copies the visible request and reports success after the clipboard resolves', async () => {
    let resolve!: () => void
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>(done => { resolve = done }))
    await act(async () => copyButton().click())
    expect(copy).toHaveBeenCalledWith(host.querySelector('blockquote')!.textContent)
    expect(copyButton().disabled).toBe(true)
    expect(host.querySelector('[role="status"]')!.textContent).toBe('')
    await act(async () => resolve())
    expect(copyButton().textContent).toContain('Copied')
    expect(host.querySelector('[role="status"]')!.textContent).toContain('Request copied')
  })
  it('keeps the request selectable after a copy failure and allows retry', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Denied')).mockResolvedValue(undefined)
    await act(async () => copyButton().click())
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Select and copy')
    expect(host.querySelector('blockquote')!.textContent).not.toContain(submission.attemptId)
    await act(async () => copyButton().click())
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(copyButton().textContent).toContain('Copied')
    await act(async () => root.render(<PendingWritingReview submission={{ ...submission, attemptId: '22222222-2222-4222-8222-222222222222' }} onExit={() => undefined} />))
    expect(copyButton().textContent).toContain('Copy request')
  })
})
