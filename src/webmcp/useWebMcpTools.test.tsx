// @vitest-environment happy-dom
import { act } from 'react'
import { defaultSpeakingPlan } from '@/domain/speakingPlan'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebMcpTools, type WebMcpToolOptions } from './useWebMcpTools'

vi.mock('@/shared/reportHandledError', () => ({ reportHandledError: vi.fn() }))

describe('stable page WebMCP registration', () => {
  let root: Root
  let container: HTMLDivElement
  let registered: Map<string, WebMCP.ModelContextTool>
  let register: ReturnType<typeof vi.fn>
  const options = (active: boolean): WebMcpToolOptions => ({
    commands: {} as WebMcpToolOptions['commands'], assessmentCommands: {} as WebMcpToolOptions['assessmentCommands'],
    enabled: true, nativeAuthoringEnabled: active,
    assessmentToolSurface: active ? 'authoring' : 'none', writingToolSurface: 'none', speakingToolSurface: 'none',
  })
  function Harness({ value }: { value: WebMcpToolOptions }) {
    const tools = useWebMcpTools(value)
    return <div>{tools.registrationStatus}</div>
  }
  beforeAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }))
  afterAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }))
  beforeEach(() => {
    registered = new Map()
    register = vi.fn(async (tool: WebMCP.ModelContextTool, config: WebMCP.ModelContextRegisterToolOptions) => {
      registered.set(tool.name, tool)
      config.signal?.addEventListener('abort', () => registered.delete(tool.name))
    })
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: register } })
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove() })
  it('keeps the same catalog through 30 context changes and rejects wrong-state execution', async () => {
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(registered.size).toBe(13)
    const original = [...registered.values()]
    const metadata = JSON.stringify(original.map(({ execute: _execute, ...descriptor }) => descriptor))
    for (let index = 0; index < 30; index++) {
      await act(async () => root.render(<Harness value={options(index % 2 === 0)} />))
      expect([...registered.values()]).toEqual(original)
    }
    expect(register).toHaveBeenCalledTimes(13)
    expect(JSON.stringify([...registered.values()].map(({ execute: _execute, ...descriptor }) => descriptor))).toBe(metadata)
    const callOptions = { signal: new AbortController().signal }
    await expect(registered.get('install_assessment')!.execute({}, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'TOOL_NOT_AVAILABLE' } })
    await expect(registered.get('get_ielts_writing_submission')!.execute({}, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'TOOL_NOT_AVAILABLE' } })
    await expect(registered.get('set_ielts_speaking_interview')!.execute(defaultSpeakingPlan, callOptions)).resolves.toMatchObject({ ok: false, error: { code: 'SPEAKING_NOT_OPEN' } })
    await act(async () => root.render(<Harness value={options(true)} />))
    await expect(registered.get('get_ielts_authoring_kit')!.execute({ section: 'writing' }, callOptions)).resolves.toMatchObject({ ok: true })
    expect(register).toHaveBeenCalledTimes(13)
  })
  it('surfaces registration failure and removes partial registrations', async () => {
    register.mockRejectedValueOnce(new Error('Registration failed'))
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(container.textContent).toBe('error')
    expect(registered.size).toBe(0)
  })
  it('reports WebMCP unavailable without suggesting successful setup', async () => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined })
    await act(async () => root.render(<Harness value={options(true)} />))
    expect(container.textContent).toBe('unavailable')
  })
})
