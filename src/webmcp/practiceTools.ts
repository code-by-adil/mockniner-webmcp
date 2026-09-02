import { z } from 'zod'
import { navigationSchema, practiceKind, type PracticeNavigationInput } from '@/application/practiceNavigation'
import type { DiscoveryPage } from '@/infrastructure/database/practiceDiscovery'
import { applicationFailure, getToolExecutionSignal, throwIfCancelled, toolFailure, zodIssues } from './toolResult'

const pageSchema = z.strictObject({ kind: practiceKind.optional(), limit: z.number().int().min(1).max(25).default(10), offset: z.number().int().min(0).max(100_000).default(0) })

export function createPracticeTools(deps: {
  readLibrary: (input: DiscoveryPage) => Promise<unknown>
  readHistory: (input: DiscoveryPage) => Promise<unknown>
  navigate: (input: PracticeNavigationInput) => Promise<unknown>
}): WebMCP.ModelContextTool[] {
  return [
    ...(['library', 'history'] as const).map(kind => ({
      name: `get_practice_${kind}`, title: kind === 'library' ? 'List available practice' : 'Read combined practice history',
      description: kind === 'library' ? 'List practice IDs with duration, item/part counts, declared subject/difficulty, startability and blocking reasons, plus resumable IDs and Listening readiness. Unknown metadata is null; estimates are labeled. Availability is a snapshot, rechecked when starting. Use kind to filter and nextOffset to continue. No questions or keys.'
        : 'List saved IELTS and universal attempts with exact IDs, scores, evaluation status and universal domain results, newest first. Available on every page. Use kind to filter and nextOffset to continue. Contains no essays, transcripts, recordings or answer keys. Open a result or explicitly retrieve a submission for feedback.',
      inputSchema: z.toJSONSchema(pageSchema, { target: 'draft-07', io: 'input' }), annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input: Record<string, unknown>, options: WebMCP.ToolExecuteCallbackOptions) => {
        const signal = getToolExecutionSignal(options); throwIfCancelled(signal)
        const parsed = pageSchema.safeParse(input)
        if (!parsed.success) return toolFailure('INVALID_INPUT', 'Use an optional kind, limit 1–25, and a non-negative offset.', true, zodIssues(parsed.error))
        const data = await (kind === 'library' ? deps.readLibrary : deps.readHistory)(parsed.data)
        throwIfCancelled(signal)
        return { ok: true, data }
      },
    })),
    {
      name: 'open_practice', title: 'Open practice or a saved result',
      description: 'Open the library, an exact saved result, start installed practice, or resume an unfinished attempt. result requires kind and attemptId; resume requires kind (ielts/assessment) and attemptId; start requires kind and packageId for assessments, optional contentKey for native sets. full_ielts starts Listening first. Never answers or submits. Existing drafts are preserved; starting over or leaving live Speaking requires the learner.',
      inputSchema: { type: 'object', properties: {
        action: { type: 'string', enum: ['library', 'result', 'start', 'resume'] },
        kind: { type: 'string', enum: ['ielts', 'listening', 'reading', 'writing', 'speaking', 'assessment', 'full_ielts'] },
        attemptId: { type: 'string', format: 'uuid' }, contentKey: { type: 'string' }, packageId: { type: 'string' },
      }, required: ['action'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options); throwIfCancelled(signal)
        const parsed = navigationSchema.safeParse(input)
        if (!parsed.success) return toolFailure('INVALID_INPUT', 'Choose library, result, start or resume and supply only that action’s required IDs.', true, zodIssues(parsed.error))
        try { const data = await deps.navigate(parsed.data); return { ok: true, data, sideEffect: { type: 'practice_navigation' } } }
        catch (error) { return applicationFailure(error) }
      },
    },
  ]
}
