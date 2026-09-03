# Assessment Lab

Practice with your agent.

Assessment Lab is a browser-based practice app for IELTS, SAT-style tests, and
custom assessments. Choose a built-in test or ask your agent to create one.
Complete the test here, review your results, and ask for feedback on submitted
work.

Your agent creates questions and gives feedback through WebMCP. The app handles
timing, scores objective answers, and saves your progress in the browser.

Built for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/).

## Try it

Open Assessment Lab in a browser with WebMCP support and ask your agent:

> Create a short SAT-style practice test focused on algebra and inference.

The test appears in the practice library. Complete it, submit your answers, and
review your score. Then ask:

> Explain the questions I missed and create practice for the topics I need to improve.

For Writing and Speaking, open your submitted work and ask your agent for
feedback. The evaluation appears beside your responses. You can also choose a
built-in test and practise without an agent.

See the [Site tools guide](https://learn.chatgpt.com/docs/webmcp) for supported
agent browsers and setup.

## Practice and feedback

- IELTS Listening, Academic Reading, Academic Writing, and Speaking, available
  separately or as a full practice test.
- A 98-question SAT-style practice test with four timed modules and results by
  topic.
- Custom quizzes and assessments with passages, tables, charts, multiple
  choice, numeric answers, matching, and written responses.
- Automatic scoring for objective questions, with answer review after
  submission when the assessment allows it.
- Agent feedback on submitted writing and interview transcripts, including
  strengths, suggested improvements, and comments on specific responses.
- Saved progress, results, and feedback, with backup export and import.

Speaking uses examiner audio and records each answer with your permission.
Speech recognition runs in the browser after the interview. Your agent reads its
completed transcript for feedback. Pronunciation is excluded from the band
estimate because the agent does not receive the recording.

Scores are for practice. IELTS bands are estimates. SAT-style and GRE-style
results report practice accuracy and rubric feedback, not official or predicted
test scores. The built-in SAT-style test uses a fixed question sequence.

## Run locally

Use Node.js 20.19+ or 22.12+.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To verify and build the application:

```bash
npm test
npm run lint
npm run build
```

The production build is in `dist/`. Deploy it to a static HTTPS host that
supports custom response headers. The included `public/_headers` configures
Cloudflare hosting. Other hosts must send the same headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These headers enable SQLocal's browser storage. See the [SQLocal setup
guide](https://sqlocal.dev/guide/setup).

Speaking and agent-generated Listening audio require WebGPU. The first use
downloads speech models. Later use reuses the browser cache while those files
remain available. Speaking also requires microphone permission.

## Your saved work

Practice sets, completed answers, recordings, results, and feedback are saved in
this browser. Assessment Lab does not require an account or an application API
key. Your agent can read submitted work through the site's tools when you ask it
to review your results. That work is then handled by your agent provider under
its own data policies. Browser-local storage does not mean agent reviews stay
on your device.

Open **Local data** to export a backup or import one on another browser or
device. Importing replaces the destination browser's saved practice. Backups are
unencrypted, so keep them somewhere private. Clearing site data removes saved
practice. A recording still in progress is not included in a backup.

## How WebMCP connects the app and your agent

React and WebMCP use the same application commands and saved data. An agent
creates a structured assessment, the app validates it, and the test appears in
the library. After submission, the agent can read the saved responses and return
feedback that the app displays in the results view.

The app registers tools with `document.modelContext` in the top-level page.
Tools support practice creation, navigation, submission review, and feedback.
The learner controls answering and submission. Active answer keys and draft
responses are excluded from tool results.

IELTS uses section-specific question models and interfaces. Custom assessments
use a shared package format with configurable questions, timing, review rules,
and rubrics. Both save attempts in the same local database.

## Developer documentation

- [WebMCP tool reference](./docs/WEBMCP.md)
- [Assessment framework](./docs/ASSESSMENT_FRAMEWORK.md)
- [Listening audio](./docs/KOKORO_LISTENING.md)
- [Speaking interviews](./docs/SPEAKING.md)
- [Local storage, backups, and deployment](./docs/LOCAL_DATA.md)
- [Agent authoring evaluations](./docs/AGENT_EVALUATIONS.md)

## License and attribution

Assessment Lab's original code, documentation, and bundled practice content are
licensed under the [MIT License](./LICENSE), copyright 2026 Mohammad Adil.
Third-party packages and speech models retain their own licenses. See
[Attribution and content sources](./PROVENANCE.md), including the unresolved
eSpeak NG licensing issue in the speech dependency.

IELTS, SAT, and GRE are trademarks of their respective owners. Assessment Lab is
an independent practice application and is not affiliated with or endorsed by
IELTS, the British Council, IDP, Cambridge University Press & Assessment,
College Board, or ETS.
