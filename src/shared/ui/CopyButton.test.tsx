// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton'

describe('CopyButton', () => {
  let root: Root
  let host: HTMLDivElement
  const button = () => host.querySelector('button')!
  const click = () => act(async () => button().click())

  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(<CopyButton text="A selectable request" label="Copy request" />))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reports success only after the clipboard confirms the write', async () => {
    let resolve!: () => void
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>(done => { resolve = done }))
    await click()
    expect(write).toHaveBeenCalledExactlyOnceWith('A selectable request')
    expect(button().disabled).toBe(true)
    expect(button().textContent).toBe('Copying…')
    expect(host.querySelector('[role="status"]')!.textContent).toBe('')
    await act(async () => resolve())
    expect(button().textContent).toBe('Copied')
    expect(host.querySelector('[role="status"]')!.textContent).toBe('Text copied to clipboard.')
  })

  it('allows retry after failure and replaces the prior confirmation timer', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError')).mockResolvedValue(undefined)
    await click()
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Select and copy the text')
    expect(button().textContent).toBe('Copy request')
    await click()
    expect(host.querySelector('[role="alert"]')).toBeNull()
    await act(async () => vi.advanceTimersByTime(2000))
    await click()
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => vi.advanceTimersByTime(500))
    expect(button().textContent).toBe('Copied')
    await act(async () => vi.advanceTimersByTime(2000))
    expect(button().textContent).toBe('Copy request')
  })

  it('clears timers and ignores a clipboard completion after unmount', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await click()
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => root.render(<div>Closed</div>))
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => root.render(<CopyButton text="Another request" />))
    let resolve!: () => void
    write.mockImplementation(() => new Promise<void>(done => { resolve = done }))
    await click()
    await act(async () => root.render(<div>Closed</div>))
    await act(async () => resolve())
    expect(vi.getTimerCount()).toBe(0)
    expect(host.textContent).toBe('Closed')
  })
})
