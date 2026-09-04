import { openAfterInstallSchema, readInstallRequest, openInstalledPractice, type OpenInstalledPractice } from './installedPractice'
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
  openPractice: OpenInstalledPractice
  installContent: IeltsCommands['installContent']
  readListeningAudio: () => ListeningAudioStatus
  includeAuthoringExamples?: () => boolean
}

const ieltsAuthoringKitInputSchema = {
  type: 'object',
  properties: {
    includeSchema: { type: 'boolean', default: false, description: 'Include the full JSON Schema when using a format beyond the complete example. Usually unnecessary.' },
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
    openAfterInstall: openAfterInstallSchema,
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
  openPractice,
  readListeningAudio,
  includeAuthoringExamples = () => true,
}: IeltsAuthoringToolDependencies): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'get_ielts_authoring_kit',
      title: 'Get native IELTS authoring kit',
      description:
        'For new IELTS questions, create Listening, Academic Reading or Academic Writing from a complete original example and exam-owner format facts. For a general practice request, check get_practice_library first for saved tests and unfinished work. For Listening, call prepare_practice_audio before authoring so voices download while you work. Listening has all 40 questions and a full four-part spoken script; Reading has 40 questions and three substantial passages; Writing has both tasks. Use this kit directly for routine practice, without web research or Kokoro API research. Includes workflow instructions; install_ielts_practice_set opens practice by default. Full JSON Schema is opt-in with includeSchema:true. Examples are hidden during unfinished practice.',
      inputSchema: ieltsAuthoringKitInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options)
        throwIfCancelled(signal)
        const parsed = z.strictObject({
          section: z.enum(IELTS_AUTHORING_SECTIONS),
          includeSchema: z.boolean().default(false),
        }).safeParse(input)
        if (!parsed.success) {
          return toolFailure(
            'INVALID_IELTS_AUTHORING_SECTION',
            'Choose one of the declared native IELTS sections.',
            true,
            zodIssues(parsed.error),
          )
        }
        return { ok: true, data: getIeltsAuthoringKit(parsed.data.section, includeAuthoringExamples(), parsed.data.includeSchema) }
      },
    },
    {
      name: 'install_ielts_practice_set',
      title: 'Install IELTS practice set',
      description:
        'Save and open a complete native IELTS set from get_ielts_authoring_kit in one call. Defaults to opening immediately, including Listening while audio prepares in the exam. Its timer pauses while audio is unavailable. Playback begins automatically when ready, subject to browser permission. Set openAfterInstall:false only for a save-for-later request. Check opened and any openingError; never claim saved practice is open unless opened is true. The learner answers and submits.',
      inputSchema: ieltsPracticeSetTeachingSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, options) => {
        const signal = getToolExecutionSignal(options)
        throwIfCancelled(signal)
        try {
          const request = readInstallRequest(input)
          const document = await installContent(markAsAgentCreated(request.document))
          const opening = await openInstalledPractice(openPractice, { action: 'start', kind: document.section, contentKey: document.contentKey }, request.openAfterInstall, signal)
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
              ...opening,
              ...(document.section === 'listening' ? { listeningAudio: readListeningAudio() } : {}),
            },
            sideEffect: {
              type: 'practice_set_installed',
              visibleView: opening.opened ? 'exam' : 'home',
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
