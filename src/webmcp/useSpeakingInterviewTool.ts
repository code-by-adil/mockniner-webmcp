import { useEffect } from 'react'
import type { AgentSpeakingTurnHandler } from '@/application/speakingInterview'
import { reportHandledError } from '@/shared/reportHandledError'
import { createSpeakingInterviewToolDefinition } from './speakingTools'

export function useSpeakingInterviewTool(
  conductTurn: AgentSpeakingTurnHandler,
): void {
  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext) return

    const controller = new AbortController()
    void modelContext.registerTool(
      createSpeakingInterviewToolDefinition(conductTurn),
      { signal: controller.signal },
    ).catch((error) => {
      if (!controller.signal.aborted) {
        reportHandledError(error, { feature: 'speaking-interview-tool' })
      }
    })

    return () => controller.abort()
  }, [conductTurn])
}
