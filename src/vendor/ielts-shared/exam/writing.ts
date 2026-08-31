import type { WritingAnnotation } from './types'

export function getWritingIssueTitle(annotation: WritingAnnotation) {
  const explicitTitle = annotation.shortTitle?.trim() || annotation.issueTitle?.trim()
  if (explicitTitle) return explicitTitle
  const derivedTitle = annotation.explanation.split('.')[0]?.trim()
  return derivedTitle && derivedTitle.length > 0 ? derivedTitle : 'Writing issue'
}
