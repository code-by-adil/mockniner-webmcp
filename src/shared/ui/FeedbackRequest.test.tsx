// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WritingEvaluationPrompt } from '@/modules/ielts/writing/ui/WritingEvaluationPrompt'
import { SpeakingEvaluationPrompt } from '@/modules/ielts/speaking/ui/SpeakingEvaluationPrompt'
import { AssessmentEvaluationPrompt } from '@/modules/assessment-engine/ui/AssessmentEvaluationPrompt'

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe.each([
  ['Writing', WritingEvaluationPrompt], ['Speaking', SpeakingEvaluationPrompt], ['custom assessment', AssessmentEvaluationPrompt],
] as const)('%s feedback handoff', (_name, Prompt) => {
  it('copies the exact saved attempt and resets confirmation when another attempt opens', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
    for (const attemptId of ids) {
      await act(async () => root.render(<Prompt attemptId={attemptId} />))
      const button = host.querySelector('button')!
      expect(button.textContent).toBe('Copy request')
      const request = host.querySelector('blockquote')!.textContent!
      expect(request).toContain(attemptId)
      expect(request).not.toContain(ids.find(id => id !== attemptId))
      expect(request).not.toContain('latest')
      expect(host.querySelector('h2')!.textContent).toBe('Ask your agent to evaluate')
      expect(host.textContent).toContain('Submitting does not request feedback automatically.')
      await act(async () => button.click())
      expect(copy).toHaveBeenLastCalledWith(request)
      expect(button.textContent).toBe('Copied')
      // Copying does not claim the agent is evaluating or hide the request.
      expect(host.querySelector('blockquote')!.textContent).toBe(request)
      expect(host.querySelector('h2')!.textContent).toBe('Ask your agent to evaluate')
    }
  })
})
