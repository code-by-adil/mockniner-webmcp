# Provenance

Assessment Lab is an independent application. It has no build-time or runtime
dependency on the commercial MockNiner product used as a development reference.

The native IELTS exam shell, question renderers, review views, interaction
helpers, and related models were adapted from that reference implementation.
Assessment Lab owns its branding, application state, local persistence, WebMCP
tools, universal assessment engine, and assessment content.

The built-in questions, museum map, favicon, Listening script, and generated
Listening recording are original project assets. No commercial assets, private
data, credentials, or application-owned cloud model services are included.

The IELTS and SAT-style authoring examples are separate original project
content, not copies of playable built-in questions or bundled audio scripts.
They demonstrate valid package structure and are not full-length calibrated exams.

Speaking recognition uses the public OpenAI Whisper base.en model, converted
to ONNX by the ONNX Community, through Transformers.js. It is downloaded from
`onnx-community/whisper-base.en` at revision
`fd8ac034a560b217176fae5215ca3fe05c9140f3`; weights are not committed here.
The [upstream model card](https://huggingface.co/openai/whisper-base.en) lists
Apache-2.0. Transformers.js is Apache-2.0. All transcription runs locally.

The unified Speaking runner follows the reference product's local question
progression and recording controls. Its whole-interview WebMCP contract,
ahead-of-time Kokoro audio queue, local transcription, and explicit skipped
responses are owned by this repository; no commercial model API is used.
