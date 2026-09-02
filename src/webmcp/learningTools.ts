import { z } from 'zod'
import type { LearningSummary } from '@/domain/learningSummary'
import {
  getToolExecutionSignal,
  toolFailure,
  throwIfCancelled,
  zodIssues,
} from './toolResult'

const learningSummaryInputSchema = z.strictObject({
  recentLimit: z.number().int().min(1).max(10).default(5),
})

const learningSummaryJsonSchema = {
  type: 'object',
  properties: {
    recentLimit: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      default: 5,
      description: 'Maximum recent attempts per scored section. Defaults to 5.',
    },
  },
  additionalProperties: false,
} as const

type LearningToolDependencies = {
  readLearningSummary: (recentLimit: number) => Promise<LearningSummary>
  now?: () => Date
}

export function createLearningToolDefinitions({
  readLearningSummary,
  now = () => new Date(),
}: LearningToolDependencies): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'get_ielts_learning_summary',
      title: 'Read IELTS learning summary',
      description:
        'Read a compact local summary of recent IELTS performance for adapting future practice. Returns scores and criterion averages without essays, recordings, answer keys, or draft answers.',
      inputSchema: learningSummaryJsonSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options)
        throwIfCancelled(signal)
        const parsed = learningSummaryInputSchema.safeParse(input)
        if (!parsed.success) {
          return toolFailure(
            'INVALID_INPUT',
            'The learning summary request is invalid.',
            true,
            zodIssues(parsed.error),
          )
        }
        const summary = await readLearningSummary(parsed.data.recentLimit)
        throwIfCancelled(signal)
        return {
          ok: true,
          data: {
            generatedAt: now().toISOString(),
            recentLimit: parsed.data.recentLimit,
            ...summary,
          },
        }
      },
    },
  ]
}
