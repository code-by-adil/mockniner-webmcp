# Speaking interviews

## Starting an interview

Open Speaking and select **Start interview**. The app supports the built-in
question set and interviews created by an agent. Before the learner starts, an
agent can call `set_ielts_speaking_interview` to save a complete set of 10 to 12
questions.

The app saves the plan with the attempt, including its title, content key,
questions, cue points, and timings. Reloading or switching sections retains the
plan. A failed save returns `DRAFT_SAVE_FAILED` and leaves the existing plan in
place. Questions lock when the interview starts.

Setup requests microphone permission, prepares speech recognition, and loads the
first examiner question. Kokoro generates the remaining audio in a WebGPU worker
ahead of playback. The app reuses decoded audio and splits long questions at
phoneme boundaries before generation.

## Recording answers

Select **Record answer** to start the microphone and **Submit answer** to move
to the next question. Space performs the same actions. Recording starts only
when the learner chooses it.

Part 2 includes 60 seconds to prepare and up to 120 seconds to speak, with a cue
card and private notes. **Skip question** saves a skipped status. If the
microphone captures silence, the app asks the learner to record again.

The app saves each completed answer before the next question. On resume, it
continues from the next unsaved answer. An unfinished recording is not saved.
The exit dialog explains this before the learner leaves.

## Transcription and feedback

After the interview, the app transcribes answered recordings locally with
`@huggingface/transformers@3.8.1` and `onnx-community/whisper-base.en` at a
pinned revision, using q8 weights and WASM. Successful transcripts are cached
for retry if a later answer fails. Recordings and the completed submission
remain in browser storage. Automatic transcripts may contain recognition errors.

Transcripts become available to the agent only after submission. The completion
and pending-results screens provide a copyable request that identifies the
attempt. The agent calls `get_ielts_speaking_submission` to read it and
`attach_ielts_speaking_evaluation` to return feedback. Pronunciation is excluded
because the agent receives the transcript rather than the recording.

`get_ielts_speaking_progress` reports the configured title, content key, phase,
and question progress. It does not return live transcripts. The interview
advances locally without requiring agent calls between questions.

## References

- [Transformers.js speech recognition](https://huggingface.co/docs/transformers.js/v3.8.1/api/pipelines#module_pipelines.AutomaticSpeechRecognitionPipeline)
- [Whisper ONNX model](https://huggingface.co/onnx-community/whisper-base.en)
- [WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
