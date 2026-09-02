import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const workDir = process.argv[2]
if (!workDir) throw new Error('Pass the temporary audio generation directory.')
const projectDir = fileURLToPath(new URL('../', import.meta.url))
const audioPath = join(workDir, 'listening-test-1.mp3')
function duration(path) {
  const seconds = Number(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ], { encoding: 'utf8' }).trim())
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid duration for ${path}`)
  return seconds
}

let cursor = 0
const events = [1, 2, 3, 4].map(part => {
  const start = cursor
  cursor += duration(join(workDir, `listening-part-${part}.wav`))
  return { type: 'content', start, end: cursor, part, label: `Part ${part}` }
})
const encodedDuration = duration(audioPath)
if (Math.abs(encodedDuration - cursor) > 0.1) throw new Error('Encoded audio does not match the four part durations.')
events[3].end = encodedDuration
const timeline = JSON.stringify({ events }, null, 2) + '\n'
const revision = createHash('sha256').update(readFileSync(audioPath)).update(timeline).digest('hex').slice(0, 16)
const scriptsHash = createHash('sha256')
for (const part of [1, 2, 3, 4]) scriptsHash.update(readFileSync(join(projectDir, `scripts/audio/part-${part}.txt`))).update('\0')
const manifest = { revision, scriptsSha256: scriptsHash.digest('hex') }

copyFileSync(audioPath, join(projectDir, 'public/audio/listening-test-1.mp3'))
writeFileSync(join(projectDir, 'public/audio/local-original-timeline.json'), timeline)
writeFileSync(join(projectDir, 'src/content/bundledListeningAudio.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Generated Listening recording, timeline and revision ${revision} (${encodedDuration.toFixed(2)} seconds).`)
