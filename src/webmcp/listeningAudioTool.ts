import { z } from 'zod'
import type { ListeningAudioStatus } from '@/application/listeningAudioStatus'
import { getToolExecutionSignal, throwIfCancelled, toolFailure, zodIssues } from './toolResult'

const inputSchema = z.strictObject({ contentKey: z.string().min(1).max(100) })

export function createListeningAudioRetryTool(read: () => ListeningAudioStatus, retry: () => void): WebMCP.ModelContextTool {
  return {
    name: 'retry_ielts_listening_audio', title: 'Retry Listening audio preparation',
    description: 'Restart failed audio preparation for the active Listening contentKey, reusing saved chunks. Read listeningAudio in get_practice_context first. Returns immediately with current status; generation continues locally. Does not restart the test, change answers or start playback. Retry is available only after a generation error.',
    inputSchema: z.toJSONSchema(inputSchema, { target: 'draft-07' }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options))
      const parsed = inputSchema.safeParse(input)
      if (!parsed.success) return toolFailure('INVALID_INPUT', 'Supply the active Listening contentKey from get_practice_context.', true, zodIssues(parsed.error))
      const status = read()
      if (status.contentKey !== parsed.data.contentKey) return toolFailure('LISTENING_CONTENT_CHANGED', 'That Listening set is no longer active. Read get_practice_context before retrying.', true)
      if (!status.canRetry) return toolFailure('AUDIO_RETRY_NOT_AVAILABLE', 'Audio is not in a failed generation state. Read get_practice_context for its current progress.', true)
      retry()
      return { ok: true, data: { listeningAudio: read() }, sideEffect: { type: 'listening_audio_retry_started' } }
    },
  }
}
