import { z } from 'zod'
import type { PracticeContext } from '@/application/practiceContext'
import { getToolExecutionSignal, throwIfCancelled, toolFailure } from './toolResult'

export function createPracticeContextTool(read: () => PracticeContext): WebMCP.ModelContextTool {
  return {
    name: 'get_practice_context', title: 'Read visible practice context',
    description: 'Read visible practice and attempt IDs, compact progress (part/item position, time remaining and answered counts), and Listening preparation status. Reading/Listening show the visible part’s question IDs, not a single focused question. Speaking includes its local phase and question count. Progress is null outside an active exam. No draft answers, scripts or keys. Readiness is preparation, not playback.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options))
      if (!z.strictObject({}).safeParse(input).success) return toolFailure('INVALID_INPUT', 'Practice context takes no parameters.', true)
      return { ok: true, data: read() }
    },
  }
}
