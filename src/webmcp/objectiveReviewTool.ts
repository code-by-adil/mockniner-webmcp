import { z } from 'zod'
import type { AttemptReader } from '@/application/attemptReader'
import type { PracticeContentDocument } from '@/domain/contentDocument'
import { getObjectiveBlockQuestionIds } from '@/domain/objectiveContent'
import { readSelectedSubmission, submissionSelectionSchema } from './submissionSelection'
import { applicationFailure, getToolExecutionSignal, throwIfCancelled, toolFailure, zodIssues } from './toolResult'

const inputSchema = z.strictObject({
  section: z.enum(['listening', 'reading']),
  attemptId: z.uuid().optional(),
  latest: z.literal(true).optional(),
  part: z.number().int().min(1).max(4).default(1),
}).refine(input => !(input.attemptId && input.latest), { message: 'Use attemptId or latest, not both.' })

export function createObjectiveReviewTool(deps: {
  readAttempt: AttemptReader['readObjectiveAttempt']
  loadContent: (key: string) => Promise<PracticeContentDocument | null>
  visibleId: (section: 'listening' | 'reading') => string | undefined
  readExplanations: AttemptReader['readObjectiveExplanations']
}): WebMCP.ModelContextTool {
  return {
    name: 'get_ielts_objective_review',
    title: 'Read submitted Reading or Listening review',
    description: 'Read one submitted Reading/Listening part: original content with keys, saved responses, correctness and saved agent explanations with revisions. Requires section; part defaults to 1. Omit IDs for the visible submission or use attemptId/latest:true. Never reads drafts or navigates. Multiple-selection keys are unordered; correctness uses saved grading. Use open_practice result with location.questionId to show a question.',
    inputSchema: { ...z.toJSONSchema(inputSchema, { target: 'draft-07', io: 'input' }),
      properties: { ...submissionSelectionSchema.properties,
        section: { type: 'string', enum: ['listening', 'reading'] },
        part: { type: 'integer', minimum: 1, maximum: 4, default: 1, description: 'Return this part only; inspect availableParts for the rest.' },
      } },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (raw, options) => {
      const signal = getToolExecutionSignal(options)
      throwIfCancelled(signal)
      const parsed = inputSchema.safeParse(raw)
      if (!parsed.success) return toolFailure('INVALID_INPUT', 'Choose section, optional part, and at most one of attemptId/latest.', true, zodIssues(parsed.error))
      const { section, part, ...selectionInput } = parsed.data
      try {
        const selected = await readSelectedSubmission(selectionInput, async id => {
          const submission = await deps.readAttempt(id, section)
          if (!submission) return null
          const document = await deps.loadContent(submission.contentKey)
          return { submission, document, explanations: await deps.readExplanations(submission.attemptId) }
        }, () => deps.visibleId(section), signal)
        if (!selected.ok) return selected
        if (!selected.stored) return toolFailure('OBJECTIVE_SUBMISSION_NOT_FOUND', 'No submitted attempt matches. Read get_practice_history for a saved Reading/Listening attempt ID.', true)
        const { submission, document, explanations } = selected.stored
        if (submission.section !== section || !document || document.section !== section || document.contentKey !== submission.contentKey) {
          return toolFailure('REVIEW_CONTENT_MISMATCH', 'The saved attempt and its original content do not match. No review was returned.', false)
        }
        const availableParts = document.parts.map(p => ({ part: p.id, label: p.label }))
        const content = document.parts.find(p => p.id === part)
        if (!content) return toolFailure('PART_NOT_FOUND', `Choose one of these parts: ${availableParts.map(p => p.part).join(', ')}.`, true)
        const correct = new Set(submission.result.correctQuestionIds)
        return { ok: true, data: {
          selection: selected.selection, attemptId: submission.attemptId, section, contentKey: submission.contentKey,
          title: document.name, startedAt: submission.startedAt, submittedAt: submission.submittedAt,
          result: submission.result, availableParts, part: content,
          questions: content.blocks.flatMap(getObjectiveBlockQuestionIds).map(questionId => ({
            questionId, response: submission.answers[questionId] ?? '', correct: correct.has(questionId),
            explanation: explanations.find(entry => entry.questionId === questionId) ?? null,
          })),
        } }
      } catch (error) {
        throwIfCancelled(signal)
        return applicationFailure(error)
      }
    },
  }
}
