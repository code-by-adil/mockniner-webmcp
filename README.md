# Assessment Lab

Prepare for your next exam with the AI agent you already use. No extra exam-prep
subscription.

Assessment Lab is an open-source exam-practice workspace that runs in your
browser. Use the AI agent you already have to create a test, complete it here,
and get feedback on your submitted work. Start with IELTS or SAT-style practice,
ask for a GRE-style diagnostic, or make a quiz for a subject you're learning.

Your agent supplies the questions and feedback. Assessment Lab provides the exam
interface, timers, objective scoring, and saved attempts. The exam can change;
you keep the same place to practise and review your work.

There is no Assessment Lab subscription, account, or application API key to set
up. You bring the agent, including any subscription or usage costs it requires.

Built for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/).

## Start with a test, or ask for one

The library is a starting point. Your agent can create practice around a topic,
a skill you want to improve, or the time you have available.

| Practice | What you can do |
| --- | --- |
| IELTS | Use built-in Listening, Academic Reading, Academic Writing, and Speaking practice, separately or as a full test. Ask your agent for new question sets or a Speaking interview. |
| SAT-style | Take the built-in 98-question test across four timed modules, with results by topic, or ask for a shorter, focused test. |
| GRE-style | Ask for original Verbal Reasoning, Quantitative Reasoning, and analytical writing practice. |
| Your own subject | Create a biology quiz, an essay with a marking rubric, or a diagnostic for a topic you're studying. |

Custom assessments can combine passages, tables, bar charts, multiple-choice
questions, numeric and short-text answers, matching, and extended writing.
They can include timed parts, a calculator, reference material, and answer
review. Your agent chooses from the app's supported question types and tools.

These are practice assessments, not official exams. IELTS bands are estimates.
SAT-style and GRE-style results report practice accuracy and rubric feedback,
not official or predicted scores. Custom tests follow a fixed sequence rather
than adaptive routing.

## Practise with your agent

Open Assessment Lab in an agent browser that supports WebMCP. For ChatGPT and
Codex, follow the [Site tools guide](https://learn.chatgpt.com/docs/webmcp) for
current browser, model, and account requirements. You need a compatible agent
and browser, but no separate MCP server.

Start in the practice library and ask:

> Create a 20-minute GRE-style diagnostic with verbal and quantitative questions.
> Add it to my library.

The agent creates the assessment through the site's tools. The app validates it
and adds it to the library. Open the test, answer the questions, and submit your
work. The app scores objective answers immediately.

With your results open, ask:

> Explain the questions I missed. Create a short follow-up quiz on the topics I
> need to work on.

For written work, ask your agent to evaluate the submitted responses. It returns
criterion scores and comments to the results view. IELTS Writing also supports
corrections linked to specific passages in your text.

You choose what to practise and control your answers and submission. Agent
feedback requires a request after submission; it does not arrive automatically.
You can also take built-in tests without an agent, with local scoring for
objective questions.

## Why WebMCP

WebMCP lets your agent add questions and feedback directly to the app you are
using. You do not have to copy questions into a document or paste your responses
back into a chat.

There is no embedded chatbot or application-side model API. The page exposes
tools for creating practice, opening tests and results, reading submissions,
and attaching feedback. React and WebMCP call the same application commands and
use the same saved data.

Agents send structured content, not executable code. The app validates questions,
answer rules, and feedback before saving them. Its tools do not answer questions,
submit attempts, or expose active answer keys and draft responses. Feedback
belongs to the exact saved attempt, even if the question set changes later.

See the [WebMCP tool reference](./docs/WEBMCP.md) for the complete workflow and
contracts.

## Listening and Speaking

Built-in IELTS Listening uses a bundled recording. For agent-created Listening
sets, the agent writes the script and the browser generates the audio locally
with Kokoro.

Speaking plays examiner questions and records each answer when you choose to
start the microphone. After the interview, Whisper transcribes the completed
recordings in the browser. Your agent reviews the submitted transcript, not the
audio. Pronunciation is therefore excluded from the band estimate, and automatic
transcripts may contain recognition errors.

Speaking and generated Listening audio require WebGPU. They download speech
models on first use and reuse them while the browser cache remains available.
Speaking also requires microphone permission.

## Your saved work

Practice sets, unfinished attempts, completed recordings, results, and feedback
stay in this browser's local database. There is no account-based sync.

Local storage does not make agent reviews local. When you ask an external agent
to review a submission, it receives that work under its provider's data policies.

Use **Local data** to export a backup or move saved work to another browser or
device. Importing replaces the destination's saved practice rather than merging
histories. Export that browser's work first if you want to keep it.

Backups are unencrypted. Keep them somewhere private. Clearing site data removes
saved practice, and a recording still in progress is not saved or included in a
backup.

## Run locally

Use Node.js 20.19+ or 22.12+, as required by
[Vite](https://vite.dev/guide/). From the repository root:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. No backend or model API key is required.

To check the project and create a production build:

```bash
npm test
npm run lint
npm run build
```

The app uses React and TypeScript, with SQLocal storing SQLite data in the
browser's origin private file system. The development server already sets the
headers required for persistence.

### Hosting

The build is in `dist/`. Use a static HTTPS host that supports custom response
headers. The included `public/_headers` supplies them for Cloudflare hosting.
Other hosts must return equivalent headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

SQLocal needs these headers for persistent storage. See its
[setup guide](https://sqlocal.dev/guide/setup) and the project's
[deployment notes](./docs/LOCAL_DATA.md#deployment). Review the
[speech dependency licensing notes](./PROVENANCE.md#speech-dependency-licensing)
before distributing a build.

## Developer documentation

IELTS retains its section-specific interfaces and scoring. Custom assessments
share a validated package format for questions, timing, learner tools, review
rules, and rubrics. New subjects do not require a new exam-specific runtime.

- [WebMCP tool reference](./docs/WEBMCP.md)
- [Custom assessment format and authoring](./docs/ASSESSMENT_FRAMEWORK.md)
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
