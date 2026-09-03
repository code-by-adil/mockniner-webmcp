import { z } from 'zod'
import type { PracticeContext } from '@/application/practiceContext'
import { getToolExecutionSignal, throwIfCancelled, toolFailure } from './toolResult'

export function createPracticeContextTool(read: () => PracticeContext): WebMCP.ModelContextTool {
  return {
    name: 'get_practice_context', title: 'Read visible practice context',
    description: 'Read visible practice/attempt IDs, reviewLocation (selected question, task, correction or assessment item), active progress and Listening preparation. Reading/Listening progress includes visible question IDs. Speaking includes phase, preparationStage, error and recoveryAction. Progress is null outside an active exam. No draft answers, scripts or keys. Readiness is preparation, not playback.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options))
      if (!z.strictObject({}).safeParse(input).success) return toolFailure('INVALID_INPUT', 'Practice context takes no parameters.', true)
      return { ok: true, data: read() }
    },
  }
}
