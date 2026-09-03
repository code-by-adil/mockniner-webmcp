import { z } from 'zod';
import { ApplicationError } from './errors';
import { getObjectiveBlockQuestionIds } from './objectiveContent';
import type { IeltsReview } from './session';

export const reviewLocationSchema = z.union([
  z.strictObject({ questionId: z.number().int().min(1).max(40) }),
  z.strictObject({ taskNumber: z.union([z.literal(1), z.literal(2)]), correctionId: z.string().min(1).max(100).optional() }),
  z.strictObject({ correctionId: z.string().min(1).max(100) }),
  z.strictObject({ itemId: z.string().min(1).max(100) }),
]);
export type ReviewLocation = z.infer<typeof reviewLocationSchema>;

export function locateIeltsReview(review: IeltsReview, location: ReviewLocation): IeltsReview {
  if (review.kind === 'objective' && 'questionId' in location) {
    const part = review.document.parts.find(part => part.blocks.flatMap(getObjectiveBlockQuestionIds).includes(location.questionId));
    if (part) return { ...review, part: part.id, selectedQuestionId: location.questionId };
  }
  if (review.kind === 'writing' && ('taskNumber' in location || 'correctionId' in location)) {
    if (!location.correctionId && 'taskNumber' in location) return { ...review, part: location.taskNumber, selectedCorrectionId: undefined, focusTask: true };
    const tasks = ([1, 2] as const).filter(taskNumber =>
      (!('taskNumber' in location) || location.taskNumber === taskNumber) &&
      review.evaluation?.[taskNumber === 1 ? 'task1' : 'task2'].annotations.some(annotation => annotation.id === location.correctionId));
    if (tasks.length === 1) return { ...review, part: tasks[0], selectedCorrectionId: location.correctionId };
    if (tasks.length > 1) throw new ApplicationError('AMBIGUOUS_CORRECTION', 'This correction ID appears in both tasks. Include taskNumber.', true);
  }
  throw new ApplicationError('REVIEW_LOCATION_NOT_FOUND', 'Use a questionId from this submitted Reading/Listening attempt, or a Writing taskNumber/correctionId from its saved evaluation.', true);
}
