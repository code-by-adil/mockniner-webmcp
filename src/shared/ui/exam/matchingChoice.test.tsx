// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchingQuestionSet } from './matchingChoice'

const layout = vi.hoisted(() => ({ compact: false }))
vi.mock('@/hooks/useExamLayout', () => ({ useIsCompactExamLayout: () => layout.compact }))

describe('matching answer slots', () => {
  let host: HTMLDivElement
  let root: Root
  const onAnswerChange = vi.fn()
  const props = {
    groupId: 'matching-test',
    questions: [{ questionId: 1, label: 'First place' }],
    options: ['The library', 'The station'],
    answers: {},
    onAnswerChange,
    getCorrectAnswer: () => 'The library',
    usedAnswers: new Set<string>(),
    optionLabel: (index: number) => String.fromCharCode(65 + index),
  }
  const render = () => act(async () => root.render(<MatchingQuestionSet {...props} />))

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    onAnswerChange.mockClear()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    layout.compact = false
    vi.unstubAllGlobals()
  })

  it('keeps one answer slot when its desktop layout becomes compact', async () => {
    await render()
    const slot = host.querySelector<HTMLDivElement>('#question-1')!
    const slotHost = slot.parentElement!.parentElement!
    expect(slotHost.style.width).toBe('320px')
    layout.compact = true
    await render()
    expect(host.querySelectorAll('#question-1')).toHaveLength(1)
    expect(host.querySelector('#question-1')).toBe(slot)
    expect(slotHost.style.width).toBe('')
    expect(host.textContent).toContain('Tap a row, then choose an option')
  })

  it.each([false, true])('assigns a chosen answer in compact=%s layout', async compact => {
    layout.compact = compact
    await render()
    await act(async () => host.querySelector<HTMLDivElement>('#question-1')!.click())
    const picker = document.querySelector('dialog[open]')!
    expect(picker).not.toBeNull()
    const choice = [...picker.querySelectorAll('button')].find(button => button.textContent === 'A. The library')!
    await act(async () => choice.click())
    expect(onAnswerChange).toHaveBeenCalledExactlyOnceWith(1, 'The library')
    expect(document.querySelector('dialog[open]')).toBeNull()
  })
})
