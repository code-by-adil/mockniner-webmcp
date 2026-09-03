import { z } from 'zod'
import type { PracticeContext } from '@/application/practiceContext'
import { getToolExecutionSignal, throwIfCancelled, toolFailure } from './toolResult'

export function createPracticeContextTool(read: () => PracticeContext): WebMCP.ModelContextTool {
  return {
    name: 'get_practice_context', title: 'Read practice context and available actions',
    description: 'Start here to read visible attempt IDs, reviewLocation, progress and capabilities: available tools, conditional input requirements, blocked tools with reasons/recovery, and authoringExamplesIncluded. Availability is a live snapshot, rechecked on execution; valid IDs and payloads are still required. Listening/Speaking progress includes preparation, errors and recovery. Progress is null outside an exam. No draft answers, scripts or keys. Audio readiness is preparation, not playback.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options))
      if (!z.strictObject({}).safeParse(input).success) return toolFailure('INVALID_INPUT', 'Practice context takes no parameters.', true)
      return { ok: true, data: read() }
    },
  }
}
