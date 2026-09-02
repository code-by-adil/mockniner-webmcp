export function countWords(value: string | undefined): number {
  if (typeof value !== 'string') return 0
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}
