import { z } from 'zod'
import type { ExamApplicationCommands } from '@/application/commands'
import type { SpeakingEvaluation, SpeakingSubmission } from '@/domain/types'
import {
  speakingEvaluationInputSchema,
} from '@/domain/speakingEvaluation'
import {
  AgentSpeakingTurnError,
  conductAgentSpeakingTurn,
} from '@/modules/section-packs/speaking/agentSpeakingCoordinator'
import { throwIfCancelled, toolFailure, zodIssues } from './toolResult'

const questionTurnSchema = z.strictObject({
  examinerText: z.string().trim().min(1).max(800),
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  responseTimeSeconds: z.number().int().min(15).max(180),
  finishInterview: z.literal(false),
})

const closingTurnSchema = z.strictObject({
  examinerText: z.string().trim().min(1).max(800),
  finishInterview: z.literal(true),
})

export const agentSpeakingTurnSchema = z.discriminatedUnion(
  'finishInterview',
  [questionTurnSchema, closingTurnSchema],
)

const getSpeakingSubmissionInputSchema = {
  type: 'object',
  properties: {
    attemptId: {
      type: 'string',
      format: 'uuid',
      description: 'Optional Speaking attempt ID. Omit it to read the latest submission.',
    },
  },
  additionalProperties: false,
} as const

type SpeakingToolDependencies = {
  readSpeakingAttempt: (
    attemptId?: string,
  ) => Promise<{
    submission: SpeakingSubmission
    evaluation: SpeakingEvaluation | null
  } | null>
  attachSpeakingEvaluation: ExamApplicationCommands['attachSpeakingEvaluation']
  getCurrentSpeakingAttemptId: () => string | undefined
}

export function createSpeakingToolDefinitions({
  readSpeakingAttempt,
  attachSpeakingEvaluation,
  getCurrentSpeakingAttemptId,
}: SpeakingToolDependencies): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'conduct_speaking_turn',
      title: 'Conduct one IELTS Speaking turn',
      description:
        'Conduct exactly one turn of the visible Agent interview. For a question, provide examinerText, IELTS part 1-3, a response limit, and finishInterview=false; Kokoro speaks it and the call waits until the learner records and approves a transcript. Use the returned transcript to choose the next question. At the end call once with a short closing examinerText and finishInterview=true; this saves the complete attempt. Do not call turns concurrently.',
      inputSchema: z.toJSONSchema(agentSpeakingTurnSchema, { target: 'draft-07' }),
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal)
        const parsed = agentSpeakingTurnSchema.safeParse(input)
        if (!parsed.success) {
          return toolFailure(
            'INVALID_SPEAKING_TURN',
            'The examiner turn does not satisfy the Agent interview contract.',
            true,
            zodIssues(parsed.error),
          )
        }
        try {
          const result = await conductAgentSpeakingTurn(parsed.data, signal)
          throwIfCancelled(signal)
          return {
            ok: true,
            data: result,
            sideEffect: {
              type: result.status === 'answer_received'
                ? 'speaking_answer_captured'
                : 'speaking_interview_submitted',
              visibleView: result.status === 'answer_received'
                ? 'agent_speaking_interview'
                : 'speaking_complete',
            },
          }
        } catch (error) {
          if (error instanceof AgentSpeakingTurnError) {
            return toolFailure(error.code, error.message, true)
          }
          throw error
        }
      },
    },
    {
      name: 'get_speaking_submission',
      title: 'Read IELTS Speaking transcript',
      description:
        'Read an immutable submitted Speaking attempt with every examiner prompt, candidate transcript, duration, part, and attempt identity. Audio stays private in the local browser. Omit attemptId to read the latest attempt.',
      inputSchema: getSpeakingSubmissionInputSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal)
        const parsed = z.object({ attemptId: z.uuid().optional() }).strict().safeParse(input)
        if (!parsed.success) {
          return toolFailure(
            'INVALID_INPUT',
            'The Speaking submission request is invalid.',
            true,
            zodIssues(parsed.error),
          )
        }
        const stored = await readSpeakingAttempt(parsed.data.attemptId)
        throwIfCancelled(signal)
        if (!stored) {
          return toolFailure(
            'SPEAKING_SUBMISSION_NOT_FOUND',
            parsed.data.attemptId
              ? `Speaking attempt ${parsed.data.attemptId} was not found.`
              : 'No submitted Speaking attempt is available yet.',
            true,
          )
        }
        return {
          ok: true,
          data: {
            submission: stored.submission,
            scoringScope: {
              supported: [
                'overall estimated band',
                'fluency and coherence',
                'lexical resource',
                'grammatical range and accuracy',
              ],
              excluded: ['pronunciation: audio is not exposed to the agent'],
            },
            evaluationStatus: stored.evaluation ? 'evaluated' : 'awaiting_evaluation',
            canAttachEvaluation:
              !stored.evaluation &&
              stored.submission.attemptId === getCurrentSpeakingAttemptId(),
          },
        }
      },
    },
    {
      name: 'attach_speaking_evaluation',
      title: 'Attach IELTS Speaking evaluation',
      description:
        'Attach one structured transcript-based IELTS Speaking evaluation to the current immutable attempt. Use whole or half bands from 0 to 9 for overall, fluency/coherence, lexical resource, and grammatical range/accuracy. Do not score pronunciation because the agent receives transcripts, not audio. On success the application opens the Speaking review.',
      inputSchema: z.toJSONSchema(speakingEvaluationInputSchema, { target: 'draft-07' }),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input, { signal }) => {
        throwIfCancelled(signal)
        const parsed = speakingEvaluationInputSchema.safeParse(input)
        if (!parsed.success) {
          return toolFailure(
            'INVALID_EVALUATION',
            'The Speaking evaluation does not satisfy the transcript-based scoring contract.',
            true,
            zodIssues(parsed.error),
          )
        }
        const stored = await readSpeakingAttempt(parsed.data.attemptId)
        throwIfCancelled(signal)
        if (!stored) {
          return toolFailure(
            'SPEAKING_SUBMISSION_NOT_FOUND',
            `Speaking attempt ${parsed.data.attemptId} was not found.`,
            false,
          )
        }
        if (stored.evaluation) {
          return toolFailure(
            'EVALUATION_EXISTS',
            `Speaking attempt ${parsed.data.attemptId} already has an evaluation.`,
            false,
          )
        }
        if (getCurrentSpeakingAttemptId() !== parsed.data.attemptId) {
          return toolFailure(
            'ATTEMPT_NOT_CURRENT',
            `Speaking attempt ${parsed.data.attemptId} is not the current submitted attempt.`,
            false,
          )
        }
        const evaluation = await attachSpeakingEvaluation(parsed.data)
        throwIfCancelled(signal)
        return {
          ok: true,
          data: {
            status: 'attached',
            attemptId: evaluation.attemptId,
            overallBand: evaluation.overallBand,
            evaluatedAt: evaluation.evaluatedAt,
          },
          sideEffect: {
            type: 'speaking_evaluation_attached',
            visibleView: 'speaking_review',
          },
        }
      },
    },
  ]
}
