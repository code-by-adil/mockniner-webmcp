import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getIeltsExample } from './ieltsExamples'
import { listeningDocument } from './objective'
import { revision, scriptsSha256 } from './bundledListeningAudio.json'
import { parseListeningTimeline } from '@/infrastructure/media/listeningTimeline'
import { getListeningAudioSources } from '@/infrastructure/media/listeningAudio'

const museumScript = readFileSync(new URL('../../scripts/audio/part-2.txt', import.meta.url), 'utf8')
// Question-range instructions and "check your answers" are normal exam narration.
// Individual question numbers and answer letters must not leak into the guide's speech.
const answerAnnouncements = /\b(?:choice|choose|option|marked)\s+[A-F]\b|\b(?:question|number)\s+(?:\d+|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b|\b(?:correct answer|answer is|answer to question)\b/i

describe('Listening narration', () => {
  it('the museum guide gives facts without announcing question numbers or answer choices', () => {
    expect(museumScript).not.toMatch(answerAnnouncements)
  })

  it('keeps all ten museum answers supported in question order', () => {
    const facts = [
      /north-west corner[^.]*cloakroom/i,
      /north-east corner[^.]*café/i,
      /south-west corner[^.]*gift shop/i,
      /south-east corner[^.]*toilets/i,
      /north of the main hall[^.]*lecture room/i,
      /south of the main hall[^.]*activity studio/i,
      /timed entry[^.]*reduce queues/i,
      /standard ticket[^.]*temporary photography exhibition/i,
      /museum racks[^.]*near the ferry stop/i,
      /Friday[^.]*close at four because a private event/i,
    ]
    const offsets = facts.map(fact => museumScript.search(fact))
    expect(offsets.every(offset => offset >= 0)).toBe(true)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    const part = listeningDocument.parts.find(part => part.id === 2)!
    const answers = part.blocks.flatMap(block => 'questions' in block
      ? block.questions.map(({ questionId, answer }) => [questionId, answer]) : [])
    expect(answers).toEqual([
      [11, 'C'], [12, 'B'], [13, 'A'], [14, 'E'], [15, 'F'], [16, 'D'],
      [17, 'A'], [18, 'B'], [19, 'C'], [20, 'A'],
    ])
  })

  it('the independent authoring example also models natural speech, not spoken answer keys', () => {
    const example = getIeltsExample('listening')
    if (example.section !== 'listening' || example.audio.type !== 'kokoro') throw new Error('Expected generated Listening example')
    for (const part of example.audio.parts) for (const segment of part.segments) {
      if (segment.type === 'speech') expect(segment.text).not.toMatch(answerAnnouncements)
    }
  })

  it('ships regenerated audio and a matching cache-busted timeline for the current scripts', () => {
    const hash = createHash('sha256')
    for (const part of [1, 2, 3, 4]) hash.update(readFileSync(new URL(`../../scripts/audio/part-${part}.txt`, import.meta.url))).update('\0')
    expect(scriptsSha256, 'Run bash scripts/generate-audio.sh after editing narration').toBe(hash.digest('hex'))
    const audio = readFileSync(new URL('../../public/audio/listening-test-1.mp3', import.meta.url))
    const timeline = readFileSync(new URL('../../public/audio/local-original-timeline.json', import.meta.url), 'utf8')
    expect(revision).toBe(createHash('sha256').update(audio).update(timeline).digest('hex').slice(0, 16))
    const sources = getListeningAudioSources('local-original')
    expect(sources.audioUrl).toBe(`/audio/listening-test-1.mp3?v=${revision}`)
    expect(sources.timelineUrl).toBe(`/audio/local-original-timeline.json?v=${revision}`)
    const parsed = parseListeningTimeline(JSON.parse(timeline))
    expect(parsed).not.toBeNull()
    const { events } = parsed!
    expect(events.map(event => event.part)).toEqual([1, 2, 3, 4])
    let previousEnd = 0
    for (const event of events) {
      expect(event.start).toBe(previousEnd)
      expect(event.end).toBeGreaterThan(event.start)
      previousEnd = event.end
    }
  })
})
