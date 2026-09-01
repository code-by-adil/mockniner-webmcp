import { z } from 'zod'
import {
  ActiveAttemptError,
  type ExamApplicationCommands,
} from '@/application/commands'
import { getPracticeContentJsonSchema } from '@/domain/contentDocument'
import { KOKORO_LISTENING_AUTHORING_GUIDANCE } from '@/domain/objectiveContent'
import { toolFailure, throwIfCancelled, zodIssues } from './toolResult'

type PracticeToolDependencies = {
  installContent: ExamApplicationCommands['installContent']
}

function questionCount(section: 'listening' | 'reading' | 'writing'): number {
  return section === 'writing' ? 2 : 40
}

function markAsAgentCreated(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  return { ...input, source: 'agent' }
}

export function createPracticeToolDefinitions({
  installContent,
}: PracticeToolDependencies): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'install_practice_set',
      title: 'Install IELTS practice set',
      description:
        `Validate, save, and activate one complete IELTS Listening, Reading, or Writing practice set. The set becomes visible on the practice home screen. Do not call while the learner has an active attempt. ${KOKORO_LISTENING_AUTHORING_GUIDANCE}`,
      inputSchema: getPracticeContentJsonSchema(),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal)
        try {
          const document = await installContent(markAsAgentCreated(input))
          throwIfCancelled(signal)
          return {
            ok: true,
            data: {
              contentKey: document.contentKey,
              section: document.section,
              name: document.name,
              schemaVersion: document.schemaVersion,
              source: document.source,
              itemCount: questionCount(document.section),
              active: true,
            },
            sideEffect: {
              type: 'practice_set_installed',
              visibleView: 'home',
            },
          }
        } catch (error) {
          if (error instanceof z.ZodError) {
            return toolFailure(
              'INVALID_PRACTICE_SET',
              'The practice set does not satisfy the IELTS content contract.',
              true,
              zodIssues(error),
            )
          }
          if (error instanceof ActiveAttemptError) {
            return toolFailure(error.code, error.message, true)
          }
          if (
            error instanceof Error &&
            error.message.includes('is already installed with different data')
          ) {
            return toolFailure('CONTENT_KEY_CONFLICT', error.message, true)
          }
          throw error
        }
      },
    },
  ]
}
