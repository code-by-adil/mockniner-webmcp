import { listeningDocument, readingDocument } from './objective'
import { writingDocument } from './writing'
import type { KokoroListeningAudio } from '@/domain/objectiveContent'
import part1 from '../../scripts/audio/part-1.txt?raw'
import part2 from '../../scripts/audio/part-2.txt?raw'
import part3 from '../../scripts/audio/part-3.txt?raw'
import part4 from '../../scripts/audio/part-4.txt?raw'

// Original, redistributable sample scripts already used by the bundled test.
// The returned JSON is self-contained: no dependency on these source files or
// on bundled audio remains when an agent installs the example.
const listeningAudio: KokoroListeningAudio = {
  type: 'kokoro',
  speakers: [
    { id: 'daniel', voice: 'bm_george' },
    { id: 'samantha', voice: 'af_heart' },
    { id: 'karen', voice: 'bf_emma' },
  ],
  parts: [part1, part2, part3, part4].map((script, index) => ({
    partId: index + 1,
    segments: [
      { type: 'silence', durationMs: 30_000, purpose: 'question_time' },
      ...script.trim().split('\n').map(line => {
        const delimiter = line.indexOf('|')
        if (delimiter < 1) throw new Error('An original Listening script is missing its speaker label.')
        return { type: 'speech' as const, speakerId: line.slice(0, delimiter).toLowerCase(), text: line.slice(delimiter + 1) }
      }),
      { type: 'silence', durationMs: 20_000, purpose: 'part_transition' },
    ],
  })),
}

const examples = {
  listening: { ...listeningDocument, contentKey: 'example-ielts-listening', name: 'Harbour and River Listening', audio: listeningAudio },
  reading: { ...readingDocument, contentKey: 'example-ielts-reading', name: 'Forests, Time and Repair Reading' },
  writing: { ...writingDocument, contentKey: 'example-ielts-writing', name: 'Sports and Households Writing' },
}

export function getIeltsExample(section: keyof typeof examples) {
  return structuredClone(examples[section])
}
