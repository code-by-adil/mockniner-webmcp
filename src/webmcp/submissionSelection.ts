import { z } from 'zod'
import { throwIfCancelled, toolFailure, zodIssues } from './toolResult'

const requestSchema = z.strictObject({ attemptId: z.uuid().optional(), latest: z.literal(true).optional() })
  .refine(input => !(input.attemptId && input.latest), { message: 'Use attemptId or latest, not both.' })

export const submissionSelectionSchema = {
  type: 'object',
  properties: {
    attemptId: { type: 'string', format: 'uuid', description: 'Read this exact submitted attempt. Omit both fields to read the visible submission.' },
    latest: { type: 'boolean', const: true, description: 'Explicitly read the newest saved submission of this type. Use instead of attemptId.' },
  },
  additionalProperties: false,
} as const

export async function readSelectedSubmission<T extends { submission: { attemptId: string } }>(
  input: unknown,
  read: (id?: string) => Promise<T | null>,
  getVisibleId: () => string | undefined,
  signal: AbortSignal | undefined,
) {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return toolFailure('INVALID_INPUT', 'Use no parameters for the visible submission, attemptId for an exact attempt, or latest: true.', true, zodIssues(parsed.error))
  const mode = parsed.data.attemptId ? 'id' : parsed.data.latest ? 'latest' : 'visible'
  const visibleAtStart = getVisibleId()
  const requestedId = mode === 'latest' ? undefined : parsed.data.attemptId ?? visibleAtStart
  if (mode === 'visible' && !requestedId) return toolFailure('NO_VISIBLE_SUBMISSION', 'No submission of this type is visible. Use get_practice_context to identify the open practice, or explicitly request latest: true or an attemptId.', true)
  const stored = await read(requestedId)
  throwIfCancelled(signal)
  const visibleNow = getVisibleId()
  if (mode === 'visible' && visibleNow !== visibleAtStart) return toolFailure('VISIBLE_ATTEMPT_CHANGED', 'The visible attempt changed while reading. Read the page context and retry, or request the original attemptId explicitly.', true)
  if (stored && requestedId && stored.submission.attemptId !== requestedId) return toolFailure('SUBMISSION_ID_MISMATCH', 'Storage returned a different attempt than requested. No submission was returned.', false)
  return { ok: true as const, stored, requestedId, selection: { mode, isVisible: Boolean(stored && stored.submission.attemptId === visibleNow) } }
}
