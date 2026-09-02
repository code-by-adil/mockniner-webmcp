# Agent-generated Listening audio

Generated Listening practice uses `kokoro-js` in the browser. The agent writes
the questions, answer keys, and the complete spoken script in one validated
Listening JSON document. The application turns that script into audio locally;
the agent does not send audio files and the application does not call a TTS
server.

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

The application currently accepts four vetted English voices:

- `af_heart` — American English, female
- `am_fenrir` — American English, male
- `bf_emma` — British English, female
- `bm_george` — British English, male

Speaker IDs are document-local. Part 1 uses exactly two speakers, Part 2 one,
Part 3 two to four, and Part 4 one. Every spoken sentence belongs to exactly one
declared speaker turn; labels such as `Speaker 1:` do not belong in the text.
Speakers in the same multi-speaker part use distinct, stable voices. The four
audio parts must be in order and correspond to the four Listening question
parts. A speech segment is a semantic speaker turn, not a TTS chunk. The
application uses Kokoro's `TextSplitterStream` to retain natural sentences.
It preserves a complete sentence up to Kokoro's safe 500-phoneme envelope and
only falls back to punctuation, then a word boundary, if one sentence exceeds
that hard limit. The agent therefore owns the script, while the application
owns the audio implementation. Silence is
explicit and deterministic; supported purposes are `conversation_pause`,
`question_time`, and `part_transition`.

The boundary accepts up to 4,000 characters per speaker turn, 60,000 spoken
characters across the complete test, and 30 minutes of explicit silence. These
limits reject accidentally unbounded generation without making the agent
manually optimize audio chunks.

The authoritative executable contract is the Zod schema in
`src/domain/objectiveContent.ts`. Call `get_ielts_authoring_kit` with
`section: "listening"` to load that section's schema, then pass the complete
document to `install_ielts_practice_set`. Installation invokes the existing
`installContent` command.
No TTS-specific WebMCP tool or second audio payload is needed.

## Runtime

The first active Kokoro Listening document lazily downloads the official
`onnx-community/Kokoro-82M-v1.0-ONNX` model through `kokoro-js`. Subsequent use
reuses the browser's model cache, so normal practice can continue offline.

Generation follows the official browser setup:

- `KokoroTTS.from_pretrained(...)`
- `TextSplitterStream` for sentence-sized chunks
- `device: "webgpu"`
- `dtype: "fp32"`
- generation in a dedicated Web Worker
- `RawAudio.toBlob()` for playable WAV output

The current MVP deliberately requires WebGPU instead of maintaining a second
WASM configuration. A clear error is shown when WebGPU is unavailable.

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
worker are rejected. The existing bundled recording remains supported through
`{ "type": "bundled", "assetKey": "local-original" }`.

## Operational boundary

- Model files are downloaded once per browser cache lifecycle.
- Active generated WAV chunks and listening progress stay in browser-private
  storage.
- Clearing site data removes generated audio and attempts.
- No API key, backend, embedded chatbot, FFmpeg, MP3 encoder, voice cloning, or
  application-side model service is involved.
- `get_ielts_authoring_kit` loads the Listening guidance and schema only when an
  agent requests that section. `install_ielts_practice_set` keeps compact
  discovery metadata and applies the full runtime validator.

Kokoro integration sources: the
[`kokoro-js@1.2.1` package documentation](https://www.npmjs.com/package/kokoro-js),
the [Kokoro JavaScript source and demo](https://github.com/hexgrad/kokoro/tree/main/kokoro.js),
and the
[`onnx-community/Kokoro-82M-v1.0-ONNX` model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
