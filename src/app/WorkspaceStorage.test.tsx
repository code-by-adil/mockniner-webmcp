// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draftSaves } from '@/infrastructure/saveCoordinator'
import { storageHealth } from '@/infrastructure/storageHealth'
import { StorageButton, StorageStatus } from './WorkspaceStorage'

vi.mock('@/infrastructure/localBackup', () => ({ hasArchivedDrafts: async () => false }))

let root: Root
let host: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  draftSaves.clearError()
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<StorageStatus><StorageButton /></StorageStatus>))
})
afterEach(async () => {
  await act(async () => root.unmount())
  await draftSaves.flush()
  draftSaves.clearError()
  host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals()
})
const button = () => host.querySelector('button')!
const dialog = () => host.querySelector('dialog')!

describe('quiet header storage status', () => {
  it('keeps its label, accessible name and appearance stable across repeated autosaves', async () => {
    const initialMarkup = button().outerHTML
    const save = vi.fn(async () => {})
    for (let checkpoint = 0; checkpoint < 3; checkpoint++) {
      await act(async () => draftSaves.enqueue('ielts', save))
      expect(draftSaves.getSnapshot().pending).toBe(true)
      expect(button().outerHTML).toBe(initialMarkup)
      await act(async () => { await vi.advanceTimersByTimeAsync(250) })
      expect(draftSaves.getSnapshot().pending).toBe(false)
      expect(button().outerHTML).toBe(initialMarkup)
    }
    expect(save).toHaveBeenCalledTimes(3)
    expect(button().getAttribute('aria-label')).toBe('Local data')
  })

  it('keeps detailed pending status and unload protection while the header stays quiet', async () => {
    await act(async () => draftSaves.enqueue('ielts', async () => {}))
    const unloading = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unloading)
    expect(unloading.defaultPrevented).toBe(true)
    await act(async () => button().click())
    expect(dialog().open).toBe(true)
    expect(dialog().textContent).toContain('Saving your latest changes. Keep this tab open.')
    expect(button().textContent).toBe('Local data')
    await act(async () => draftSaves.flush())
    expect(dialog().textContent).toContain('Changes are saved in this browser, on this device.')
    const savedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(savedUnload)
    expect(savedUnload.defaultPrevented).toBe(false)
  })

  it('shows real save failures immediately and clears the warning only after retry succeeds', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Storage is full.')).mockResolvedValue(undefined)
    await act(async () => {
      draftSaves.enqueue('ielts', save)
      await expect(draftSaves.flush()).rejects.toThrow('Storage is full.')
    })
    expect(button().getAttribute('aria-label')).toBe('Changes not saved')
    expect(button().className).toContain('border-amber-300')
    await act(async () => button().click())
    expect(dialog().textContent).toContain('Storage is full.')
    const retry = [...dialog().querySelectorAll('button')].find(item => item.textContent === 'Retry saving')!
    await act(async () => { retry.click(); await draftSaves.flush() })
    expect(save).toHaveBeenCalledTimes(2)
    expect(button().getAttribute('aria-label')).toBe('Local data')
    expect(button().className).not.toContain('border-amber-300')
    expect(dialog().textContent).not.toContain('Retry saving')
  })

  it('does not hide a recovery notice behind routine saving', async () => {
    vi.spyOn(storageHealth, 'getSnapshot').mockReturnValue(['An older saved attempt needs recovery.'])
    await act(async () => root.render(<StorageStatus><StorageButton /></StorageStatus>))
    await act(async () => draftSaves.enqueue('ielts', async () => {}))
    expect(button().getAttribute('aria-label')).toBe('Local data · recovery notice')
    expect(button().className).toContain('border-amber-300')
    await act(async () => draftSaves.flush())
    expect(button().getAttribute('aria-label')).toBe('Local data · recovery notice')
  })
})
