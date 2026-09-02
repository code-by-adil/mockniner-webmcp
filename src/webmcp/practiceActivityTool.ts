import { z } from 'zod'
import { activityPageSchema, type ActivityPage, type PracticeActivityPage } from '@/domain/practiceActivity'
import { getToolExecutionSignal, throwIfCancelled, toolFailure, zodIssues } from './toolResult'

export function createPracticeActivityTool(read: (input: ActivityPage) => Promise<PracticeActivityPage>): WebMCP.ModelContextTool {
  return {
    name: 'get_practice_activity',
    title: 'Read recent practice activity',
    description: 'Read recent saved practice installations, revisions, submissions and feedback with exact IDs, newest first. Use when a reference to recent work is unclear from get_practice_context. Current visible context takes precedence; ask if the target is ambiguous. Events are past changes, not current availability or permission to act. No browsing, draft answers or feedback text. Local to this browser, latest 100 events only, no backfill. Defaults to 5. Use nextOffset to continue.',
    inputSchema: z.toJSONSchema(activityPageSchema, { target: 'draft-07', io: 'input' }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options)
      throwIfCancelled(signal)
      const parsed = activityPageSchema.safeParse(input)
      if (!parsed.success) return toolFailure('INVALID_INPUT', 'Use an optional kind, limit 1 to 25, and offset 0 to 100.', true, zodIssues(parsed.error))
      const data = await read(parsed.data)
      throwIfCancelled(signal)
      return { ok: true, data }
    },
  }
}
