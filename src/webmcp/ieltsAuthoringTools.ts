import { z } from 'zod'
import type { IeltsCommands } from '@/application/ieltsCommands'
import type { ListeningAudioStatus } from '@/application/listeningAudioStatus'
import {
  getIeltsAuthoringKit,
  IELTS_AUTHORING_SECTIONS,
} from './ieltsAuthoring'
import {
  applicationFailure,
  getToolExecutionSignal,
  toolFailure,
  throwIfCancelled,
  zodIssues,
} from './toolResult'

type IeltsAuthoringToolDependencies = {
  installContent: IeltsCommands['installContent']
  readListeningAudio: () => ListeningAudioStatus
  includeAuthoringExamples?: () => boolean
}

const ieltsAuthoringKitInputSchema = {
  type: 'object',
  properties: {
    section: {
      type: 'string',
      enum: IELTS_AUTHORING_SECTIONS,
      description: 'The native IELTS section to author.',
    },
  },
  required: ['section'],
  additionalProperties: false,
} as const

const ieltsPracticeSetTeachingSchema = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'number', const: 1 },
    contentKey: {
      type: 'string',
      pattern: '^[a-z0-9][a-z0-9._-]*$',
      description: 'Stable ID for this authored IELTS set.',
    },
    section: { type: 'string', enum: IELTS_AUTHORING_SECTIONS },
    name: { type: 'string', description: 'Learner-visible practice name.' },
    audio: {
      type: 'object',
      description: 'Required for Listening. Follow the selected authoring kit.',
    },
    parts: {
      type: 'array',
      description: 'Required for Listening and Reading. Follow the selected authoring kit.',
    },
    tasks: {
      type: 'array',
      description: 'Required for Writing. Follow the selected authoring kit.',
    },
  },
  required: ['schemaVersion', 'contentKey', 'section', 'name'],
  additionalProperties: true,
} as const

function questionCount(section: 'listening' | 'reading' | 'writing'): number {
  return section === 'writing' ? 2 : 40
}

function markAsAgentCreated(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  return { ...input, source: 'agent' }
}

export function createIeltsAuthoringToolDefinitions({
  installContent,
  readListeningAudio,
  includeAuthoringExamples = () => true,
}: IeltsAuthoringToolDependencies): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'get_ielts_authoring_kit',
      title: 'Get native IELTS authoring kit',
      description:
        'Return rules and JSON Schema for native IELTS Listening, Reading, or Writing. Includes a separate complete exampleDocument only when no unfinished practice exists; otherwise returns guidance without examples to protect answer keys. Choose a fresh contentKey for new practice.',
      inputSchema: ieltsAuthoringKitInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options)
        throwIfCancelled(signal)
        const parsed = z.strictObject({
          section: z.enum(IELTS_AUTHORING_SECTIONS),
        }).safeParse(input)
        if (!parsed.success) {
          return toolFailure(
            'INVALID_IELTS_AUTHORING_SECTION',
            'Choose one of the declared native IELTS sections.',
            true,
            zodIssues(parsed.error),
          )
        }
        return { ok: true, data: getIeltsAuthoringKit(parsed.data.section, includeAuthoringExamples()) }
      },
    },
    {
      name: 'install_ielts_practice_set',
      title: 'Install IELTS practice set',
      description:
        'Validate, save and activate a complete native IELTS set built from get_ielts_authoring_kit. Returns the visible name and readiness. Listening audio is prepared asynchronously: active does not mean playable. Read listeningAudio in get_practice_context until readyToPlay, or retry a failed preparation.',
      inputSchema: ieltsPracticeSetTeachingSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options)
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
              ...(document.section === 'listening' ? { listeningAudio: readListeningAudio() } : {}),
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
          return applicationFailure(error)
        }
      },
    },
  ]
}
