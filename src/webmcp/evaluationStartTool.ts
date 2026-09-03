import { z } from 'zod'
import type { EvaluationKind } from '@/application/evaluationActivityContext'
import type { PracticeNavigationInput } from '@/application/practiceNavigation'
import { applicationFailure, getToolExecutionSignal, throwIfCancelled, toolFailure, zodIssues } from './toolResult'

export const evaluationTools = {
  writing: { read: 'get_ielts_writing_submission', attach: 'attach_ielts_writing_evaluation' },
  speaking: { read: 'get_ielts_speaking_submission', attach: 'attach_ielts_speaking_evaluation' },
  assessment: { read: 'get_assessment_submission', attach: 'attach_assessment_evaluation' },
} as const
const inputSchema = z.strictObject({ kind: z.enum(['writing', 'speaking', 'assessment']), attemptId: z.uuid().optional(), latest: z.literal(true).optional() })
  .refine(input => !(input.attemptId && input.latest), { message: 'Choose attemptId or latest, not both.' })
const resultSchema = z.looseObject({ ok: z.literal(true), data: z.looseObject({ submission: z.looseObject({ attemptId: z.uuid() }), evaluationStatus: z.string() }) })

export function createEvaluationStartTool(deps: {
  tools: WebMCP.ModelContextTool[]
  navigate: (input: PracticeNavigationInput, options: { signal: AbortSignal }) => Promise<unknown>
  begin: (kind: EvaluationKind, attemptId: string) => void
}): WebMCP.ModelContextTool {
  return {
    name: 'begin_submission_evaluation', title: 'Begin evaluating a submission',
    description: 'When asked to grade or evaluate submitted Writing, Speaking or a custom rubric assessment, call this FIRST. Opens the exact saved submission, shows an evaluating indicator, and returns the responses, existing feedback and evaluation contract in one call. Omit IDs for the visible submission; use attemptId for history or latest:true only when requested. Then assess and call the returned attachTool. This signals your work; the app does not run an AI evaluator. Never call merely to read results.',
    inputSchema: z.toJSONSchema(inputSchema, { target: 'draft-07' }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options)
      throwIfCancelled(signal)
      const parsed = inputSchema.safeParse(input)
      if (!parsed.success) return toolFailure('INVALID_INPUT', 'Choose kind and either attemptId, latest:true, or neither for the visible submission.', true, zodIssues(parsed.error))
      const { kind, ...selection } = parsed.data
      const names = evaluationTools[kind]
      const reader = deps.tools.find(tool => tool.name === names.read)!
      const attachment = deps.tools.find(tool => tool.name === names.attach)!
      try {
        // Reuse the policy-aware reader. Never return raw repository data here.
        const initial = await reader.execute(selection, options)
        const selected = resultSchema.safeParse(initial)
        if (!selected.success) return initial
        const attemptId = selected.data.data.submission.attemptId
        if (selected.data.data.evaluationStatus === 'not_required') return toolFailure('EVALUATION_NOT_REQUIRED', 'This submission is scored locally. Read its results and explain mistakes instead.', true)
        if (kind === 'speaking' && selected.data.data.evaluationStatus !== 'awaiting_evaluation') return toolFailure('EVALUATION_EXISTS', 'This Speaking attempt already has feedback. Read it with get_ielts_speaking_submission; Speaking feedback cannot be revised.', true)
        throwIfCancelled(signal)
        await deps.navigate({ action: 'result', kind, attemptId }, { signal })
        throwIfCancelled(signal)
        const current = await reader.execute({ attemptId }, options)
        const ready = resultSchema.safeParse(current)
        if (!ready.success) return current
        if (!(ready.data.data.canAttachEvaluation || ready.data.data.canReviseEvaluation)) return toolFailure('EVALUATION_NOT_AVAILABLE', 'The selected submission is no longer open or cannot accept feedback. Read its current status before retrying.', true)
        throwIfCancelled(signal)
        deps.begin(kind, attemptId)
        return { ok: true, data: { ...ready.data.data, activityStatus: 'evaluating', attachTool: names.attach, evaluationSchema: attachment.inputSchema,
          nextAction: `Evaluate the supplied responses now, then call ${names.attach} for this attempt. Do not end with a promise to evaluate later. If saving fails, repair the reported errors and retry. The indicator stops waiting after five minutes; feedback can still be saved afterward.` },
          sideEffect: { type: 'evaluation_started', visibleView: kind === 'assessment' ? 'assessment_results' : `${kind}_review` } }
      } catch (error) { return applicationFailure(error) }
    },
  }
}
