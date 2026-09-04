# Attribution and content sources

MockNiner's original code, documentation, and bundled practice content are
licensed under the [MIT License](./LICENSE), copyright 2026 Mohammad Adil.
Third-party packages, embedded components, and models retain their own licenses.
The project license does not replace their terms.

## Practice content and assets

The built-in questions, passages, museum map, Listening scripts, and Listening
recording are original project assets. The M9 logo and wordmark reuse the
author's original MockNiner branding, with crimson accents for this app. The
favicon uses the same M9 paths with heavier strokes for small sizes. The
authoring examples are separate original content that illustrate the supported
assessment formats. The complete Listening authoring example was developed
from this project's original Harbour Workshops and City Sound demonstration
script and questions. It is separate from the bundled Listening recording.
The SAT and GRE authoring examples contain original passages and questions.
Fictional studies are marked as imagined examples; exam-owner questions have
not been copied. See [exam format sources](./docs/EXAM_AUTHORING.md).

SAT-style practice test 1 contains 98 original questions with module counts and
timings based on College Board's published test structure. Its passages,
scenarios, data, and mathematics questions were created for MockNiner. See
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

Generated Listening and examiner audio use
[`kokoro-js@1.2.1`](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) by
hexgrad, with contributions from Xenova, and
[`onnx-community/Kokoro-82M-v1.0-ONNX`](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
Kokoro's code and model weights use Apache-2.0. The ONNX conversion is provided
by onnx-community. The app uses model revision
`1939ad2a8e416c0acfeecc08a694d14ef25f2231`.

The [Apache-2.0 license](./public/licenses/kokoro-apache-2.0.txt) and
[audio asset notices](./public/licenses/audio-assets-notice.txt) are included
in the repository and deployed under `/licenses/`. The notices describe the
local voice-loading adaptation and model delivery format.

Speech models are downloaded at runtime and are not included in this
repository. Audio generation and transcription run in the browser.

## Trademarks

IELTS, SAT, and GRE are trademarks of their respective owners. MockNiner is
an independent practice application and is not affiliated with or endorsed by
IELTS, the British Council, IDP, Cambridge University Press & Assessment,
College Board, or ETS.
