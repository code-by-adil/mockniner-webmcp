import { initialAudioPreparation, type AudioPreparation } from '@/infrastructure/media/audioAssets'
import { getToolExecutionSignal, throwIfCancelled, toolFailure } from './toolResult'

export function createAudioPreparationTool(read: () => AudioPreparation | null, start: () => void): WebMCP.ModelContextTool {
  return {
    name: 'prepare_practice_audio', title: 'Prepare practice voices',
    description: 'Call immediately when the user requests new IELTS Listening or a Speaking interview, before authoring. Starts the one-time voice download in the page with visible progress; returns immediately so you can create the practice while it downloads. Safe to repeat; reuses verified files and retries failures. Read audioPreparation in get_practice_context for progress. Downloaded voices do not mean exam audio is generated. Install practice normally; Listening opens automatically and generates audio there. No web research is needed for supported exams.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options))
      if (Object.keys(input).length) return toolFailure('INVALID_INPUT', 'This tool takes no parameters.', true)
      start()
      return { ok: true, data: { audioPreparation: read() ?? initialAudioPreparation(), next: 'Continue authoring now. Install the practice when ready; the page owns audio preparation and playback.' }, sideEffect: { type: 'audio_preparation_started' } }
    },
  }
}
