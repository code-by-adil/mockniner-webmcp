// @vitest-environment happy-dom

import { act, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompleteSpeakingAttemptInput } from '@/application/attemptWriter'
import type { SpeakingSubmission } from '@/domain/types'
import { AgentSpeakingMode } from './AgentSpeakingMode'

const media = vi.hoisted(() => ({
  prepare: vi.fn(async () => undefined),
  speak: vi.fn(async () => undefined),
  dispose: vi.fn(),
  startRecording: vi.fn(async () => undefined),
  stopRecording: vi.fn(),
  cancelRecording: vi.fn(async () => undefined),
  canvasRef: { current: null as HTMLCanvasElement | null },
}))

vi.mock('@/infrastructure/media/kokoroSpeakingPlayer', () => ({
  KokoroSpeakingPlayer: class {
    prepare = media.prepare
    speak = media.speak
    dispose = media.dispose
  },
}))

vi.mock('../useSpeakingRecorder', () => ({
  supportsSpeechTranscription: () => true,
  useSpeakingRecorder: () => ({
    canvasRef: media.canvasRef,
    start: media.startRecording,
    stop: media.stopRecording,
    cancel: media.cancelRecording,
  }),
}))

const submission: SpeakingSubmission = {
  attemptId: '33333333-3333-4333-8333-333333333333',
  contentKey: 'agent-speaking-interview-v1',
  responses: [
    {
      recordingId: 'recording-1',
      promptId: 1,
      partLabel: 'Part 1',
      sequence: 0,
      promptText: 'Tell me about your hometown.',
      timeLimitSeconds: 45,
      durationMs: 21_000,
      transcript: 'My hometown is a busy coastal city.',
    },
  ],
  startedAt: '2026-09-02T10:00:00.000Z',
  submittedAt: '2026-09-02T10:05:00.000Z',
}

type RouteProps = {
  onComplete: (input: CompleteSpeakingAttemptInput) => Promise<SpeakingSubmission>
}

function SpeakingRoute({ onComplete }: RouteProps) {
  const [route, setRoute] = useState<'choose' | 'interview' | 'complete'>('choose')

  if (route === 'choose') {
    return <button onClick={() => setRoute('interview')}>Open Agent interview</button>
  }
  if (route === 'complete') return <div>Speaking complete</div>

  return (
    <AgentSpeakingMode
      onComplete={async (input) => {
        const result = await onComplete(input)
        flushSync(() => setRoute('complete'))
        return result
      }}
    />
  )
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label) || candidate.getAttribute('aria-label') === label,
  )
  if (!button) throw new Error(`Button not found: ${label}`)
  return button
}

async function click(container: HTMLElement, label: string): Promise<void> {
  await act(async () => {
    findButton(container, label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('Agent Speaking WebMCP lifecycle', () => {
  let container: HTMLDivElement
  let root: Root
  let tools: Map<string, WebMCP.ModelContextTool>

  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  afterAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    media.stopRecording.mockResolvedValue({
      audio: new Blob(['recorded audio'], { type: 'audio/webm' }),
      durationMs: 21_000.4,
      transcript: 'My hometown is a busy coastal city.',
    })
    tools = new Map()
    const modelContext = {
      registerTool: vi.fn(async (
        tool: WebMCP.ModelContextTool,
        options?: WebMCP.ModelContextRegisterToolOptions,
      ) => {
        tools.set(tool.name, tool)
        options?.signal?.addEventListener('abort', () => {
          if (tools.get(tool.name) === tool) tools.delete(tool.name)
        }, { once: true })
      }),
    } as unknown as WebMCP.ModelContext
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: modelContext,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('exists only in Agent interview and resolves the final result after route cleanup', async () => {
    const onComplete = vi.fn(async () => submission)
    await act(async () => root.render(<SpeakingRoute onComplete={onComplete} />))

    expect(tools.has('conduct_speaking_turn')).toBe(false)
    await click(container, 'Open Agent interview')
    const tool = tools.get('conduct_speaking_turn')
    expect(tool).toBeDefined()

    await click(container, 'Enable microphone and audio')
    let questionResult!: Promise<unknown>
    await act(async () => {
      questionResult = Promise.resolve(tool!.execute(
        {
          examinerText: 'Tell me about your hometown.',
          part: 1,
          responseTimeSeconds: 45,
          finishInterview: false,
        },
        { signal: new AbortController().signal },
      ))
      void questionResult.catch(() => undefined)
      await Promise.resolve()
    })
    await click(container, 'Start recording')
    await click(container, 'Stop recording')
    await click(container, 'Send response')

    await expect(questionResult).resolves.toMatchObject({
      ok: true,
      data: {
        status: 'answer_received',
        transcript: 'My hometown is a busy coastal city.',
        durationMs: 21_000,
      },
    })

    let finalResult: unknown
    await act(async () => {
      finalResult = await tool!.execute(
        {
          examinerText: 'Thank you. That is the end of the Speaking test.',
          finishInterview: true,
        },
        { signal: new AbortController().signal },
      )
    })

    expect(finalResult).toMatchObject({
      ok: true,
      data: {
        status: 'interview_completed',
        submission: { attemptId: submission.attemptId },
      },
      sideEffect: {
        type: 'speaking_interview_submitted',
        visibleView: 'speaking_complete',
      },
    })
    expect(container.textContent).toContain('Speaking complete')
    expect(tools.has('conduct_speaking_turn')).toBe(false)
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      contentKey: 'agent-speaking-interview-v1',
      recordings: [expect.objectContaining({
        promptText: 'Tell me about your hometown.',
        transcript: 'My hometown is a busy coastal city.',
      })],
    }))
  })

  it('cancels an active question while leaving the mounted interview available', async () => {
    await act(async () => root.render(
      <SpeakingRoute onComplete={async () => submission} />,
    ))
    await click(container, 'Open Agent interview')
    await click(container, 'Enable microphone and audio')
    const tool = tools.get('conduct_speaking_turn')!
    const controller = new AbortController()
    let turn!: Promise<unknown>
    await act(async () => {
      turn = Promise.resolve(tool.execute(
        {
          examinerText: 'What do you enjoy about your hometown?',
          part: 1,
          responseTimeSeconds: 45,
          finishInterview: false,
        },
        { signal: controller.signal },
      ))
      await Promise.resolve()
    })
    const settled = turn.catch((error: unknown) => error)
    await act(async () => {
      controller.abort()
      await settled
    })

    const error = await settled
    expect(error).toBeInstanceOf(DOMException)
    expect((error as DOMException).name).toBe('AbortError')
    expect(media.cancelRecording).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('Ready. Give the prompt below')
    expect(tools.has('conduct_speaking_turn')).toBe(true)
  })
})
