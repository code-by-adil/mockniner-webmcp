# Attribution and content sources

Assessment Lab is licensed under the [Apache License 2.0](./LICENSE).
Third-party packages and models retain their respective licenses.

## Application code

The IELTS interface includes components adapted from earlier work by the same
author. Assessment Lab's application state, storage, WebMCP integration, and
custom assessment engine are developed in this repository. The project builds
and runs independently.

## Practice content and assets

The built-in questions, passages, museum map, favicon, Listening scripts, and
Listening recording are original project assets. The authoring examples are
separate original content that illustrate the supported assessment formats.

SAT-style practice test 1 contains 98 original questions with module counts and
timings based on College Board's published test structure. Its passages,
scenarios, data, and mathematics questions were created for Assessment Lab. See
the [content notes](./src/content/satFullLength/README.md) for the format and
sources.

## Speech models

Speaking transcription uses OpenAI's Whisper base.en model through
Transformers.js and the ONNX Community conversion. The app downloads
`onnx-community/whisper-base.en` at revision
`fd8ac034a560b217176fae5215ca3fe05c9140f3`. The [Whisper model
card](https://huggingface.co/openai/whisper-base.en) lists Apache-2.0. The [ONNX
conversion](https://huggingface.co/onnx-community/whisper-base.en) provides the
browser-compatible weights.

Transformers.js is licensed under Apache-2.0. Its license is included with the
installed package.

Generated Listening and examiner audio use `kokoro-js` with
[`onnx-community/Kokoro-82M-v1.0-ONNX`](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
The model card lists Apache-2.0. Speech models are downloaded at runtime and are
not included in this repository. Audio generation and transcription run in the
browser.

## Trademarks

IELTS, SAT, and GRE are trademarks of their respective owners. Assessment Lab is
an independent practice application and is not affiliated with or endorsed by
IELTS, the British Council, IDP, Cambridge University Press & Assessment,
College Board, or ETS.
