import type { SectionKey } from './types'

export const SECTION_ORDER: SectionKey[] = ['listening', 'reading', 'writing', 'speaking']

export const SECTION_META: Record<SectionKey, {
  label: string
  durationSeconds: number
  minimumDurationSeconds?: number
  structure: string
}> = {
  listening: { label: 'Listening', durationSeconds: 30 * 60, structure: '4 parts · 40 questions' },
  reading: { label: 'Reading', durationSeconds: 60 * 60, structure: '3 passages · 40 questions' },
  writing: { label: 'Writing', durationSeconds: 60 * 60, structure: '2 tasks · 150 & 250 words' },
  speaking: {
    label: 'Speaking',
    durationSeconds: 14 * 60,
    minimumDurationSeconds: 11 * 60,
    structure: '3 parts · interview',
  },
}
