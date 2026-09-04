// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restorePendingBackup } from '@/infrastructure/localBackup'
import { WorkspaceGate } from './WorkspaceStorage'

vi.mock('@/infrastructure/localBackup', () => ({
  RESTORE_PENDING_KEY: 'workspace-gate-test-restore',
  restorePendingBackup: vi.fn(async () => {}),
}))

type LockRequest = { signal: AbortSignal; acquire: () => Promise<void> }
let requests: LockRequest[]
let root: Root
let host: HTMLDivElement
let originalLocks: PropertyDescriptor | undefined
const request = vi.fn((_name: string, options: { signal: AbortSignal }, acquire: () => Promise<void>) => {
  requests.push({ signal: options.signal, acquire })
  return new Promise<void>((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
})
const render = () => act(async () => root.render(<WorkspaceGate><p>Saved practice is open</p></WorkspaceGate>))

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.clearAllMocks()
  requests = []
  originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
  vi.useRealTimers(); vi.unstubAllGlobals()
})

describe('workspace waiting screen', () => {
  it('shows a neutral opening message before a lock delay is confirmed', async () => {
    await render()
    expect(host.querySelector('header [aria-label="MockNiner"]')).not.toBeNull()
    expect(host.querySelector('h1')?.textContent).toBe('Opening your practice...')
    expect(host.textContent).toContain('Loading your saved practice.')
    expect(host.textContent).not.toContain('other MockNiner tab')
    expect(host.querySelector('button')).toBeNull()
    expect(restorePendingBackup).not.toHaveBeenCalled()
  })

  it('shows one instruction and a retry action without opening storage or practice', async () => {
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(host.querySelector('h1')?.textContent).toBe('Already open in another tab')
    expect(host.querySelector('main p')?.textContent).toBe('Close the other MockNiner tab to continue here.')
    expect(host.querySelector('button')?.textContent).toBe('Try again')
    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull()
    expect(host.textContent).not.toContain('Local data')
    expect(host.textContent).not.toContain('Saved practice is open')
    expect(restorePendingBackup).not.toHaveBeenCalled()
  })

  it('retries without taking ownership from the other tab', async () => {
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    const first = requests[0]
    await act(async () => host.querySelector('button')!.click())
    expect(first.signal.aborted).toBe(true)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenLastCalledWith('ielts-workspace-writer', { signal: requests[1].signal }, expect.any(Function))
    expect(host.querySelector('h1')?.textContent).toBe('Opening your practice...')
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(host.querySelector('h1')?.textContent).toBe('Already open in another tab')
    expect(restorePendingBackup).not.toHaveBeenCalled()
  })

  it('opens saved practice when the queued request acquires the lock', async () => {
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    let held: Promise<void> | undefined
    await act(async () => { held = requests[0].acquire() })
    expect(restorePendingBackup).toHaveBeenCalledOnce()
    expect(host.textContent).toBe('Saved practice is open')
    expect(host.querySelector('button')).toBeNull()
    await act(async () => root.render(null))
    await held
    expect(requests[0].signal.aborted).toBe(true)
  })

  it('explains unsupported browsers without a misleading retry action', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    await render()
    expect(host.querySelector('h1')?.textContent).toBe('This browser does not support saved practice')
    expect(host.textContent).toContain('Your saved data has not changed.')
    expect(host.querySelector('button')).toBeNull()
    expect(request).not.toHaveBeenCalled()
    expect(restorePendingBackup).not.toHaveBeenCalled()
  })
})
