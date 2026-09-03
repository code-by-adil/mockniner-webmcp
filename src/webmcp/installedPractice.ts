import { z } from 'zod'
import type { PracticeNavigationInput } from '@/application/practiceNavigation'
import { ApplicationError } from '@/domain/errors'

export type OpenInstalledPractice = (input: PracticeNavigationInput, options: { signal: AbortSignal }) => Promise<unknown>
export const openAfterInstallSchema = { type: 'boolean', default: true,
  description: 'Open the saved practice now. Set false only when the user asks to save it for later.' } as const

export function readInstallRequest(input: unknown) {
  const { openAfterInstall, ...document } = z.looseObject({ openAfterInstall: z.boolean().default(true) }).parse(input)
  return { openAfterInstall, document }
}

// Saving has already committed. A failed or cancelled opening must not invite
// the agent to reinstall the same content or claim that saving failed.
export async function openInstalledPractice(open: OpenInstalledPractice, input: PracticeNavigationInput, requested: boolean, signal: AbortSignal) {
  if (!requested) return { status: 'saved' as const, opened: false, nextAction: 'Saved for later as requested. Use open_practice to begin.', openAction: input }
  if (signal.aborted) return { status: 'saved' as const, opened: false, nextAction: 'Saved before cancellation. Opening was cancelled; use open_practice to begin.', openAction: input }
  try {
    const navigation = await open(input, { signal })
    return { status: 'opened' as const, opened: true, navigation, nextAction: 'Practice is open. Hand control to the learner to answer and submit.' }
  } catch (error) {
    return { status: 'saved' as const, opened: false, openAction: input,
      nextAction: 'Practice was saved but could not open. Resolve openingError, then call open_practice with openAction. Do not reinstall.',
      openingError: { code: error instanceof ApplicationError ? error.code : signal.aborted ? 'OPEN_CANCELLED' : 'OPEN_FAILED',
        message: error instanceof Error ? error.message : 'Could not open the saved practice.' } }
  }
}
