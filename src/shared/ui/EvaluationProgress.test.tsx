// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EvaluationActivityProvider } from '@/application/EvaluationActivity'
import { useEvaluationActivity, EVALUATION_WAIT_MS, type EvaluationActivityActions } from '@/application/evaluationActivityContext'
import { EvaluationProgress } from './EvaluationProgress'
import { WritingEvaluationPrompt } from '@/modules/ielts/writing/ui/WritingEvaluationPrompt'
let root: Root, host: HTMLDivElement, actions: EvaluationActivityActions
const id = '11111111-1111-4111-8111-111111111111'
function Harness() {
  const state = useEvaluationActivity()!
  useLayoutEffect(() => { actions = state }, [state])
  return <><WritingEvaluationPrompt attemptId={id} /><EvaluationProgress /></>
}
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<EvaluationActivityProvider><Harness /></EvaluationActivityProvider>))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('evaluation progress', () => {
  it('starts only on an agent acknowledgement, replaces the request, and clears only for matching feedback', async () => {
    expect(host.textContent).toContain('Ask your agent to evaluate')
    expect(host.querySelector('[aria-label="Evaluation progress"]')).toBeNull()
    await act(async () => actions.begin('writing', id))
    expect(host.textContent).toContain('Evaluating your writing')
    expect(host.textContent).not.toContain('Ask your agent to evaluate')
    await act(async () => actions.finish('speaking', id))
    expect(host.textContent).toContain('Evaluating your writing')
    await act(async () => actions.finish('writing', id))
    expect(host.querySelector('[aria-label="Evaluation progress"]')).toBeNull()
  })
  it('stops spinning after five minutes, including repeated begin calls, and accepts late completion', async () => {
    await act(async () => actions.begin('writing', id))
    await act(async () => vi.advanceTimersByTimeAsync(EVALUATION_WAIT_MS - 1000))
    await act(async () => actions.begin('writing', id))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(host.textContent).toContain('Still waiting for feedback')
    expect(host.textContent).toContain('Copy follow-up request')
    expect(host.querySelector('.motion-safe\\:animate-spin')).toBeNull()
    await act(async () => actions.finish('writing', id))
    expect(host.querySelector('[aria-label="Evaluation progress"]')).toBeNull()
  })
  it('shows recovery after a failed save and allows a fresh evaluation', async () => {
    await act(async () => actions.begin('writing', id))
    await act(async () => actions.fail('writing', id))
    expect(host.textContent).toContain('Feedback could not be saved')
    await act(async () => actions.begin('writing', id))
    expect(host.textContent).toContain('Evaluating your writing')
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Dismiss evaluation notice"]')!.click())
    expect(host.textContent).toContain('Ask your agent to evaluate')
  })
  it('does not restore a phantom job when the page remounts', async () => {
    await act(async () => actions.begin('writing', id))
    await act(async () => root.render(<EvaluationActivityProvider key="reload"><Harness /></EvaluationActivityProvider>))
    expect(host.querySelector('[aria-label="Evaluation progress"]')).toBeNull()
    expect(host.textContent).toContain('Ask your agent to evaluate')
  })
})
