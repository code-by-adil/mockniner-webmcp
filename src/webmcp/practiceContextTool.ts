import { z } from 'zod'
import type { PracticeContext } from '@/application/practiceContext'
import { getToolExecutionSignal, throwIfCancelled, toolFailure } from './toolResult'

export function createPracticeContextTool(read: () => PracticeContext): WebMCP.ModelContextTool {
  return {
    name: 'get_practice_context', title: 'Read visible practice context',
    description: 'Identify the visible practice, active attempt and submitted attempt IDs. Also returns listeningAudio: active contentKey, loading/generating/ready/error phase, readyToPlay, chunk progress, error and canRetry. Readiness describes preparation, not actual playback. No draft answers, scripts or answer keys. Submission readers default to the visible IDs.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options))
      if (!z.strictObject({}).safeParse(input).success) return toolFailure('INVALID_INPUT', 'Practice context takes no parameters.', true)
      return { ok: true, data: read() }
    },
  }
}
