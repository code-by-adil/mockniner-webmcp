import { z } from 'zod';
import { assessmentResponseMapSchema } from '@/domain/assessmentScoring';
import { parseAssessmentPackage } from '@/domain/assessment';
import type { AssessmentSession } from '@/domain/assessmentSession';

const assessmentDraftSchema = z.strictObject({
  attemptId: z.uuid(),
  packageId: z.string().min(1),
  partId: z.string().min(1),
  itemId: z.string().min(1),
  secondsRemaining: z.number().int().nonnegative().nullable(),
  deadlineAt: z.number().finite().nullable(),
  responses: assessmentResponseMapSchema,
  workspace: z.strictObject({
    markedItemIds: z.array(z.string()),
    eliminatedOptionIds: z.record(z.string(), z.array(z.string())),
    timerHidden: z.boolean(),
  }),
  startedAt: z.iso.datetime({ offset: true }),
});

export function snapshotAssessment(session: AssessmentSession) {
  const draft = assessmentDraftSchema.parse({
    attemptId: session.attemptId, packageId: session.packageId, partId: session.partId, itemId: session.itemId,
    secondsRemaining: session.secondsRemaining, deadlineAt: session.deadlineAt, responses: session.responses,
    workspace: session.workspace, startedAt: session.startedAt,
  });
  const assessment = parseAssessmentPackage(session.packageSnapshot);
  if (assessment.packageId !== draft.packageId) throw new Error('The assessment draft does not match its content.');
  const part = assessment.parts.find(part => part.id === draft.partId);
  if (!part?.items.some(item => item.id === draft.itemId)) throw new Error('The saved question does not exist in the pinned assessment.');
  const ids = new Set(assessment.parts.flatMap(part => part.items.map(item => item.id)));
  if (Object.keys(draft.responses).some(id => !ids.has(id))) throw new Error('Saved responses do not match the pinned assessment.');
  return { draft, assessment };
}
