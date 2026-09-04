# Agent-generated Listening audio

Generated Listening practice uses `kokoro-js` in the browser. The agent writes
the questions, answer keys, and the complete spoken script in one validated
Listening JSON document. The application turns that script into audio locally;
the agent does not send audio files and the application does not call a TTS
server.

Installation opens the exam immediately by default, showing the existing
preparation or retry controls. The timer pauses while audio is unavailable or the browser is waiting for the
learner to press Play.
Playback can begin with the first durable speech buffer while later chunks
continue generating. The agent does not need to wait for every chunk, keep a
polling call alive, or ask the learner to request opening a second time.
`openAfterInstall: false` preserves the explicit save-for-later workflow.

## JSON contract

A generated Listening document uses the same 4-part, 40-question schema as the
built-in test. Its `audio` field has this form:

```json
{
  "type": "kokoro",
  "speakers": [
    { "id": "host", "voice": "af_heart" },
    { "id": "guest", "voice": "bm_george" },
    { "id": "student", "voice": "bf_emma" },
    { "id": "tutor", "voice": "am_fenrir" }
  ],
  "parts": [
    {
      "partId": 1,
      "segments": [
        {
          "type": "speech",
          "speakerId": "host",
          "text": "You will hear a conversation about a community course."
        },
        {
          "type": "speech",
          "speakerId": "guest",
          "text": "I would like to ask about the evening classes."
        },
        {
          "type": "silence",
          "durationMs": 750,
          "purpose": "conversation_pause"
        }
      ]
    },
    { "partId": 2, "segments": [{ "type": "speech", "speakerId": "host", "text": "Part two script..." }] },
    { "partId": 3, "segments": [
      { "type": "speech", "speakerId": "student", "text": "Could we compare the two survey methods?" },
      { "type": "speech", "speakerId": "tutor", "text": "Yes, but explain which sample each method reaches." }
    ] },
    { "partId": 4, "segments": [{ "type": "speech", "speakerId": "host", "text": "Part four script..." }] }
  ]
}
```

The application supports four English voices:

- `af_heart`, American English, female
- `am_fenrir`, American English, male
- `bf_emma`, British English, female
- `bm_george`, British English, male

Speaker IDs are document-local. Part 1 uses exactly two speakers, Part 2 one,
Part 3 two to four, and Part 4 one. Every spoken sentence belongs to exactly one
declared speaker turn; labels such as `Speaker 1:` do not belong in the text.
Speakers in the same multi-speaker part use distinct, stable voices. The four
audio parts must be in order and correspond to the four Listening question
parts. A speech segment is a semantic speaker turn, not a TTS chunk. The
application uses Kokoro's `TextSplitterStream` to retain natural sentences. It
preserves a complete sentence up to Kokoro's safe 500-phoneme envelope and only
falls back to punctuation, then a word boundary, if one sentence exceeds that
hard limit. Agents supply speaker turns. The application handles audio chunking.
Silence is explicit and deterministic; supported purposes are
`conversation_pause`, `question_time`, and `part_transition`.

The boundary accepts up to 4,000 characters per speaker turn, 60,000 spoken
characters across the complete test, and 30 minutes of explicit silence. These
limits reject accidentally unbounded generation without making the agent
manually optimize audio chunks.

The authoritative executable contract is the Zod schema exported through
`src/domain/objectiveContent.ts`. Its implementation separates core objective
blocks, Listening audio, map data, and whole-document validation. Call
`get_ielts_authoring_kit` with `section: "listening"` to load that section's
schema, then pass the complete document to `install_ielts_practice_set`.
Installation invokes the existing `installContent` command. The script and
questions are installed together.

## Runtime

The first active Kokoro Listening document prepares pinned model, voice and
runtime files from the app's origin. Agents can start the download earlier with
`prepare_practice_audio`, while authoring. Subsequent generation reuses verified
files. Playing saved audio needs no model download. See
[audio setup](./LOCAL_DATA.md#deployment).

Generation follows the official browser setup:

- `StyleTextToSpeech2Model` and `AutoTokenizer` with a verified local asset cache
- Kokoro generation with a local voice-file loader
- `TextSplitterStream` for sentence-sized chunks
- `device: "webgpu"`
- `dtype: "fp32"`
- generation in a dedicated Web Worker
- `RawAudio.toBlob()` for playable WAV output

Speech generation requires WebGPU. If it is unavailable, the app displays
browser compatibility guidance.

The worker consumes the document segments in order. After every generated
sentence or explicit silence:

1. Kokoro generates one short speech chunk, or the app records an explicit
   silence chunk.
2. The chunk is immediately saved to the SQLocal SQLite database in OPFS.
3. The page acknowledges durable storage; only then does the worker generate
   the next chunk.
4. React is notified that another contiguous chunk is ready.
5. Playback starts once the first two chunks are durable while the worker
   continues generating and saving the remaining chunks.

The player uses one HTML audio element and advances through the saved sequence.
If playback catches generation, it waits for the next persisted chunk and then
continues automatically. Cache rows are versioned and WAV headers, lengths,
durations, and sequence continuity are checked before reuse. An invalid suffix
is deleted and regenerated. Exiting and resuming the attempt, or reloading the
page, restores the saved cursor and chunks instead of regenerating them. The
cache retains generated media only for the active Listening document; activating
a replacement removes the previous document's WAV rows while preserving its
installed content and submitted attempt history. Late writes from a superseded
worker are rejected. The existing bundled recording remains supported through `{
"type": "bundled", "assetKey": "local-original" }`.

## Downloads and storage

- Model files are downloaded once per browser cache lifecycle.
- Active generated WAV chunks and listening progress stay in browser-private
  storage.
- Clearing site data removes generated audio and attempts.
- The browser generates speech locally using the downloaded model.
- `get_ielts_authoring_kit` loads the Listening guidance and schema only when an
  agent requests that section. `install_ielts_practice_set` keeps compact
  discovery metadata and applies the full runtime validator.

Kokoro integration sources: the [`kokoro-js@1.2.1` package
documentation](https://www.npmjs.com/package/kokoro-js), the [Kokoro JavaScript
source and demo](https://github.com/hexgrad/kokoro/tree/main/kokoro.js), and the
[`onnx-community/Kokoro-82M-v1.0-ONNX` model
card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).

## Bundled recording

The built-in IELTS Listening set uses one bundled recording and a small
synchronization timeline under `public/audio`.

The original narration lives in `scripts/audio/part-*.txt`. Keep it natural:
speakers supply facts, not question numbers, option letters, or answer-key cues.
After editing it, run `bash scripts/generate-audio.sh` on macOS with Node.js,
FFmpeg/ffprobe, and the Daniel, Karen, and Samantha system voices installed.
This regenerates the recording, part timings, and cache revision together.
Commit all generated changes; tests detect scripts changed without regeneration.
