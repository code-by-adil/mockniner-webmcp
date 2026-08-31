import { useEffect, useRef } from 'react'
import type { ExamApplicationCommands } from '@/application/commands'
import { reportWebHandledProductFailure } from '@/shared/observability/report-error'
import { createLearningToolDefinitions } from './learningTools'
import { createPracticeToolDefinitions } from './practiceTools'
import { createWritingToolDefinitions } from './writingTools'

type WebMcpToolOptions = {
  commands: ExamApplicationCommands
  currentWritingAttemptId?: string
  enabled: boolean
}

export function useWebMcpTools({
  commands,
  currentWritingAttemptId,
  enabled,
}: WebMcpToolOptions): void {
  const installContentRef = useRef(commands.installContent)
  const attachWritingEvaluationRef = useRef(commands.attachWritingEvaluation)
  const currentWritingAttemptIdRef = useRef(currentWritingAttemptId)

  useEffect(() => {
    installContentRef.current = commands.installContent
    attachWritingEvaluationRef.current = commands.attachWritingEvaluation
    currentWritingAttemptIdRef.current = currentWritingAttemptId
  }, [commands.installContent, commands.attachWritingEvaluation, currentWritingAttemptId])

  useEffect(() => {
    if (!enabled) return
    const modelContext = document.modelContext
    if (!modelContext) return

    const controller = new AbortController()
    const register = async () => {
      const readWritingAttempt = async (attemptId?: string) => {
        const [{ getLocalDatabase }, repository] = await Promise.all([
          import('@/infrastructure/database/client'),
          import('@/infrastructure/database/attemptRepository'),
        ])
        return repository.readWritingAttempt(await getLocalDatabase(), attemptId)
      }
      const tools = [
        ...createPracticeToolDefinitions({
          installContent: (input) => installContentRef.current(input),
        }),
        ...createLearningToolDefinitions({
          readLearningSummary: async (recentLimit) => {
            const [{ getLocalDatabase }, repository] = await Promise.all([
              import('@/infrastructure/database/client'),
              import('@/infrastructure/database/attemptRepository'),
            ])
            return repository.readLearningSummary(
              await getLocalDatabase(),
              recentLimit,
            )
          },
        }),
        ...createWritingToolDefinitions({
          readWritingAttempt,
          attachWritingEvaluation: (input) =>
            attachWritingEvaluationRef.current(input),
          getCurrentWritingAttemptId: () => currentWritingAttemptIdRef.current,
        }),
      ]
      await Promise.all(
        tools.map((tool) =>
          modelContext.registerTool(tool, { signal: controller.signal }),
        ),
      )
    }

    void register().catch((error) => {
      if (!controller.signal.aborted) {
        reportWebHandledProductFailure(error, { feature: 'webmcp-tools' })
      }
    })

    return () => controller.abort()
  }, [enabled])
}
