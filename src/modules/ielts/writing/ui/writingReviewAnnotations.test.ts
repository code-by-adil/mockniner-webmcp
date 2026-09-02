import { describe, expect, it } from 'vitest'
import type { WritingAnnotation } from '@/domain/types'
import { findAnnotationSpan } from '@/domain/writingAnnotations'
import { getWritingIssueTitle, resolveAnnotationRanges } from './writingReviewAnnotations'

const annotation: WritingAnnotation = {
  id: 'issue-1', taskNumber: 1, originalText: 'bad', suggestion: 'good',
  explanation: 'Choose a precise word.', type: 'vocabulary',
}

describe('exact writing annotations', () => {
  it('respects offsets for a repeated quote', () => {
    const issue = { ...annotation, startOffset: 9, endOffset: 12 }
    expect(findAnnotationSpan('bad then bad', issue)).toEqual({ startOffset: 9, endOffset: 12 })
    expect(resolveAnnotationRanges('bad then bad', [issue]).mapped).toEqual([{ annotationIndex: 0, start: 9, end: 12 }])
  })
  it('resolves a unique exact quote or exact surrounding context at the boundary', () => {
    expect(findAnnotationSpan('a bad choice', annotation)).toEqual({ startOffset: 2, endOffset: 5 })
    expect(findAnnotationSpan('bad then bad', { ...annotation, contextBefore: 'then ' })).toEqual({ startOffset: 9, endOffset: 12 })
  })
  it.each([
    ['bad then bad', annotation],
    ['BAD', annotation],
    ['bad', { ...annotation, startOffset: 0 }],
    ['bad', { ...annotation, startOffset: 1, endOffset: 4 }],
    ['bad', { ...annotation, startOffset: 0, endOffset: 99 }],
  ])('does not guess at ambiguous or invalid locations', (essay, issue) => {
    expect(findAnnotationSpan(essay, issue)).toBeNull()
  })
  it('keeps overlapping feedback available without overlapping buttons', () => {
    const issues = [
      { ...annotation, startOffset: 0, endOffset: 3 },
      { ...annotation, id: 'overlap', startOffset: 0, endOffset: 3 },
      { ...annotation, id: 'second', startOffset: 9, endOffset: 12 },
    ]
    const result = resolveAnnotationRanges('bad then bad', issues)
    expect(result.mapped.map((range) => range.annotationIndex)).toEqual([0, 2])
    expect(result.unresolvedIndexes).toEqual(new Set([1]))
  })
  it('does not relocate legacy feedback in the renderer', () => {
    expect(resolveAnnotationRanges('bad', [annotation]).mapped).toEqual([])
  })
  it('uses the supplied title or the first explanation sentence', () => {
    expect(getWritingIssueTitle({ ...annotation, shortTitle: 'Word choice' })).toBe('Word choice')
    expect(getWritingIssueTitle(annotation)).toBe('Choose a precise word')
  })
})
