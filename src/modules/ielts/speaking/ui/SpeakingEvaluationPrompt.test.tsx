// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpeakingEvaluationPrompt } from './SpeakingEvaluationPrompt'

const attemptId = '11111111-1111-4111-8111-111111111111'
let root: Root
let host: HTMLDivElement

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<SpeakingEvaluationPrompt attemptId={attemptId} />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals()
})
const button = () => host.querySelector('button')!
const click = () => act(async () => button().click())

describe('copyable Speaking evaluation prompt', () => {
  it('targets the exact attempt and states attachment and evidence boundaries', () => {
    const prompt = host.querySelector('blockquote')!.textContent!
    expect(prompt).toMatch(/^Evaluate my IELTS Speaking interview/)
    expect(prompt.endsWith(`Attempt ID: ${attemptId}`)).toBe(true)
    expect(prompt.split(attemptId)).toHaveLength(2)
    expect(prompt).toContain("this page's WebMCP tools")
    expect(prompt).toContain('attach the structured evaluation to this same attempt')
    expect(prompt).toContain('Do not score pronunciation or infer delivery from text')
    expect(prompt).toContain('blank/skipped answers as missing evidence')
    expect(prompt).toContain('without inventing band scores')
    expect(prompt).not.toContain('latest')
  })
  it('copies exactly the visible prompt and reports success only after the clipboard resolves', async () => {
    let copied!: () => void
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>(resolve => { copied = resolve }))
    await click()
    expect(writeText).toHaveBeenCalledWith(host.querySelector('blockquote')!.textContent)
    expect(button().textContent).toBe('Copying…')
    expect(button().disabled).toBe(true)
    expect(host.querySelector('[role="status"]')!.textContent).toBe('')
    await act(async () => copied())
    expect(button().textContent).toBe('Copied')
    expect(host.querySelector('[role="status"]')!.textContent).toContain('Prompt copied')
    await act(async () => vi.advanceTimersByTimeAsync(2500))
    expect(button().textContent).toBe('Copy prompt')
  })
  it('shows a recoverable error rather than false success when clipboard permission is denied', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError')).mockResolvedValue(undefined)
    await click()
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Select and copy the prompt')
    expect(button().textContent).toBe('Copy prompt')
    await click()
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(button().textContent).toBe('Copied')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
  it('cleans up its confirmation timer when leaving the screen', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await click()
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => root.render(<div>Exited</div>))
    expect(vi.getTimerCount()).toBe(0)
  })
})
