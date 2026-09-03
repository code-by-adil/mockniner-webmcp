import { z } from 'zod'
import { reviewLocationSchema } from '@/domain/reviewLocation'
import { navigationSchema, practiceKind, type PracticeNavigationInput } from '@/application/practiceNavigation'
import type { DiscoveryPage } from '@/infrastructure/database/practiceDiscovery'
import { applicationFailure, getToolExecutionSignal, throwIfCancelled, toolFailure, zodIssues } from './toolResult'

const pageSchema = z.strictObject({ kind: practiceKind.optional(), limit: z.number().int().min(1).max(25).default(10), offset: z.number().int().min(0).max(100_000).default(0) })

export function createPracticeTools(deps: {
  readLibrary: (input: DiscoveryPage) => Promise<unknown>
  readHistory: (input: DiscoveryPage) => Promise<unknown>
  navigate: (input: PracticeNavigationInput, options?: { signal?: AbortSignal }) => Promise<unknown>
}): WebMCP.ModelContextTool[] {
  return [
    ...(['library', 'history'] as const).map(kind => ({
      name: `get_practice_${kind}`, title: kind === 'library' ? 'List available practice' : 'Read combined practice history',
      description: kind === 'library' ? 'For a request to practise existing material, use this list and open_practice to begin without generating or researching questions. List practice IDs with duration, item/part counts, declared subject/difficulty, startability and blocking reasons, plus resumable IDs and Listening readiness. Unknown metadata is null; estimates are labeled. Availability is a snapshot, rechecked when starting. Use kind to filter and nextOffset to continue. No questions or keys.'
        : 'List saved IELTS and universal attempts with exact IDs, scores, evaluation status and universal domain results, newest first. Use kind to filter and nextOffset to continue, even when items is empty. Unreadable rows are listed in unavailable and retained for recovery. No essays, transcripts, recordings or answer keys. Open a result or retrieve a submission for feedback.',
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
      description: 'Open library, result, start or resume. result requires kind and attemptId; optional location selects questionId for Reading/Listening, taskNumber/correctionId for Writing, or itemId for assessments. Read IDs from submission/review tools. resume requires kind ielts/assessment and attemptId. start requires kind and packageId for assessments, optional native contentKey. full_ielts starts Listening. Listening opens even while audio prepares, with progress and retry in the exam; its timer pauses while audio is unavailable. Playback begins automatically when ready if permitted by the browser. Preserves drafts; never answers or submits.',
      inputSchema: { type: 'object', properties: {
        action: { type: 'string', enum: ['library', 'result', 'start', 'resume'] },
        kind: { type: 'string', enum: ['ielts', 'listening', 'reading', 'writing', 'speaking', 'assessment', 'full_ielts'] },
        attemptId: { type: 'string', format: 'uuid' }, contentKey: { type: 'string' }, packageId: { type: 'string' },
        location: z.toJSONSchema(reviewLocationSchema, { target: 'draft-07' }),
      }, required: ['action'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options); throwIfCancelled(signal)
        const parsed = navigationSchema.safeParse(input)
        if (!parsed.success) return toolFailure('INVALID_INPUT', 'Choose library, result, start or resume and supply only that action’s required IDs.', true, zodIssues(parsed.error))
        try { const data = await deps.navigate(parsed.data, { signal }); return { ok: true, data, sideEffect: { type: 'practice_navigation' } } }
        catch (error) { return applicationFailure(error) }
      },
    },
  ]
}
