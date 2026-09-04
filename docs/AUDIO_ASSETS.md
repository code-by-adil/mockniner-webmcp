# Audio downloads and release checks

Listening and the Speaking examiner share pinned Kokoro assets. The browser
downloads 349.3 MB once and keeps verified files in Cache Storage. Weights,
voices, tokenizer files and the matching ONNX runtime are served from
`/audio-assets/<version>/` on the app's origin. Kokoro needs no runtime request to
Hugging Face or jsDelivr. Speaking transcription remains a separate Whisper
download.

The manifest in `src/infrastructure/media/audioAssetManifest.json` records exact
bytes, SHA-256, upstream revision and source. The fp32 model has five download
parts below Wrangler's upload limit. Each part can be retried independently;
this is not HTTP byte-range resume. Speech quality, phonemization, playback and
the SQLite WAV cache retain their existing contracts.

`prepare_practice_audio` starts downloading and returns immediately, so the agent
can author while the page works. The authoring kit remains read only. The page
shows bytes, verification, initialization, and errors. `get_practice_context`
reports `audioPreparation` for explicit preparation and
`listeningAudio.preparation` for Listening. Speaking progress carries examiner
preparation. Download completion does not mean test audio has been generated.

Transient network errors receive at most three attempts with backoff. Requests
that receive no data for 30 seconds are aborted. Only complete, hash-verified
files enter the cache. Damaged entries are replaced individually. Quota errors
give storage guidance. Retry never clears answers, recordings or saved WAVs.
Web Locks coordinate overlapping workers and tabs. Reload interrupts active
work; the next preparation reuses completed files and saved Listening chunks.

## Development and deployment

Run `npm run audio:prepare` after installing dependencies. It downloads pinned
sources into ignored `.audio-assets/`, checks hashes, and copies the matching
runtime from the locked package. Vite serves these files locally. Ordinary unit
tests and builds do not download model weights.

The deployed app uses a private R2 bucket, `mockniner-audio-assets`. Its Worker
accepts only GET and HEAD for manifest-listed paths and streams objects through
`AUDIO_ASSETS`. Other requests use static assets. The Worker does not run models,
accept uploads or handle learner data.

For a release:

1. Run `npm run audio:prepare` and `npm run audio:upload`. Upload retries are
   bounded. `-- --from=onnx/model.onnx.part2` resumes an interrupted upload at a
   known file. Never change bytes under an existing manifest version.
2. Run `npm test`, `npm run lint`, `npm run typecheck:worker`, and `npm run build`.
3. Run `npx wrangler deploy --dry-run`, then `npx wrangler deploy`.
4. Run `npm run audio:verify -- https://your-deployment.example`. It downloads
   every deployed file, verifies hashes, and checks missing-file responses.
5. Use a fresh browser profile or isolated test origin. Confirm the audio cache
   is absent. Call `prepare_practice_audio` and confirm visible byte progress
   while authoring. Install the full Listening example and verify `opened:true`,
   a paused timer while unavailable, and real playable speech.
6. Interrupt a model part download, retry, and verify completed parts are reused.
   Reload with a draft answer and generated chunks, resume, and check both.
   With assets cached, block external hosts and generate a new examiner clip.

Record cold-cache speech generation separately from endpoint checks and unit
tests. Successful HTTP responses and resolved tool calls do not prove that WebGPU
initialized or speech is playable. Natural-language agent quality evaluations
remain a separate check. Redistribution notices are in `public/licenses/`.

## Verification on 4 September 2026

The deployed release passed all 697 tests in 107 files, lint, application build,
Worker type checks, and a deployment dry run. All 14 hosted audio files matched
the manifest's size and SHA-256 checks. The authenticated Wrangler preview also
served the R2 asset route successfully.

A cold Kokoro cache on the deployed origin recovered a previously failing full
Listening draft. Reload during asset preparation retained the model parts and
voices already downloaded; preparation continued and produced saved, playable
speech. The exam opened with its timer at 30:00 and a Play audio action when
browser autoplay was blocked. A separate local full-example run verified a
saved answer and generated audio across reload.

The deployed Speaking worker generated a 6.9-second clip in 10.42 seconds from
cached assets, including model initialization. In that diagnostic worker, HTTP
fetches were disabled; no unexpected network fetch occurred. The WAV decoded
successfully in the browser, without the WASM compilation fallback after the
MIME correction. Final deployed Worker version:
`be18427a-793e-4476-9a64-b9028a7d0466`. This was a voice-generation check, not a Whisper
transcription test or a natural-language agent quality evaluation.
