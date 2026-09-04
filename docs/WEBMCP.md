# WebMCP tool reference

`prepare_practice_audio` starts the shared Listening/Speaking voice download
without waiting for it. Call it before authoring new spoken practice. Progress
is visible in the page and exposed as `audioPreparation` by
`get_practice_context`. See [audio downloads](./AUDIO_ASSETS.md).

The top-level application registers semantic tools through
`document.modelContext`. React and WebMCP call the same application commands and
operate on the same local state. The tool catalog is registered once per loaded
document and remains available on every screen. Each handler checks whether its
action is allowed in the current practice state. Discovery, history, learning
summaries, and explicit submission reads work everywhere. Authoring kits also
work during unfinished practice. Complete examples remain available alongside
unrelated drafts. A kit with questions copied into an unfinished test returns
`examplesIncluded: false` and a full schema instead, including when that draft
is parked or its content key has changed. Writing examples have no answer keys.
The context reports `authoringExampleAccess: "checked_per_kit"`; each kit reports
its own `examplesIncluded` value.
Installing practice requires the library; evaluation attachment requires the
matching visible submission. Writing and universal feedback support retries and
revisions; Speaking feedback is saved once. Unavailable calls return an
actionable `TOOL_NOT_AVAILABLE` error.

`get_practice_context` is available throughout the application. It identifies
the visible practice, active attempt ID, and visible submitted attempts without
returning draft responses or answer keys. Its `progress` includes visible part,
time remaining, and answered counts. Reading/Listening expose the visible part's
question IDs, since several questions share one screen. Custom practice
identifies the selected item. Writing includes word counts, and Speaking uses
its local question/phase progress and countdown. `progress` is `null` outside an
active exam.

## Discovery and navigation

- `get_practice_library` lists built-in and installed practice, including saved
  native sets that are no longer active, plus resumable attempt IDs and Listening
  audio readiness. Entries include duration, item/part counts, declared subject
  and difficulty, and `startability.canStart` with a structured `blockingReason`.
  Unknown metadata is `null`, estimated durations are labeled, and startability
  is rechecked when navigating. Invalid saved content is preserved and identified in
  `unavailableContentKeys`, not offered as playable practice.
- `get_practice_history` lists both IELTS and universal submissions, newest first,
  with attempt IDs, scores, evaluation status, and universal domain results.
  Both lists accept an optional `kind`, `limit` from 1 to 25, and `offset`.
  Defaults are 10 and 0. Continue with `nextOffset` until it is `null`.
- `get_practice_activity` returns recent saved changes with exact practice and
  attempt IDs. Use it when the user refers to recent work that the visible
  context does not identify. It records `practice_installed`, `practice_updated`,
  `attempt_submitted`, and `feedback_attached`. Speaking feedback can have an
  `insufficient_evidence` outcome. Writing and assessment feedback can be revised.
  Each successful revision records a `feedback_attached` event. Speaking feedback
  is saved once. IELTS content uses immutable keys rather than revisions, so only
  universal packages emit `practice_updated`.
  Events contain short titles, not questions, answers, essays, transcripts,
  scores, or feedback text. An unavailable native title is `null`.
  The tool accepts an optional `kind`, `limit` from 1 to 25, and `offset` from
  0 to 100. Defaults are 5 and 0. Follow `nextOffset` until it is `null`.
  The app keeps the latest 100 events in this browser's local database, ordered
  by insertion. It writes each event in the same transaction as the saved
  change. Failed saves and identical retries add no events. Browsing, reloads,
  reads, draft edits, start/pause/resume, and audio preparation add none.
  Activating an unchanged bundled IELTS set also adds no event.
  Recording begins when this version is first used, without historical backfill.
  Events may reference a removed package or an older revision. Check current
  context and library availability before acting. Recency does not override the
  visible submission or authorize an action. Ask when multiple targets fit.
- `open_practice` opens the library, an exact result, starts a chosen practice,
  or resumes the saved unfinished attempt. Its returned `context` identifies
  the screen and actual attempt after navigation. For results, optional
  `location` selects a Reading/Listening `questionId`, a Writing `taskNumber`
  or `correctionId`, or a universal assessment `itemId`.

```json
{ "action": "library" }
{ "action": "result", "kind": "writing", "attemptId": "<uuid from history>" }
{ "action": "result", "kind": "reading", "attemptId": "<uuid from history>", "location": { "questionId": 28 } }
{ "action": "result", "kind": "writing", "attemptId": "<uuid from history>", "location": { "taskNumber": 1, "correctionId": "<id from evaluation>" } }
{ "action": "result", "kind": "assessment", "attemptId": "<uuid from history>", "location": { "itemId": "<id from submission>" } }
{ "action": "start", "kind": "assessment", "packageId": "<id from library>" }
{ "action": "start", "kind": "reading", "contentKey": "<key from library>" }
{ "action": "start", "kind": "speaking" }
{ "action": "start", "kind": "full_ielts" }
{ "action": "resume", "kind": "ielts", "attemptId": "<id from resumable>" }
{ "action": "resume", "kind": "assessment", "attemptId": "<id from resumable>" }
```

Opening results or the library preserves unfinished answers. Starting native
IELTS creates an independent attempt, even when another attempt uses the same
section or set. Installing new content never requires discarding an IELTS draft.
Use a fresh content key for new questions; an existing key cannot change meaning.
Resume the exact attempt ID from `get_practice_library` to restore its pinned
questions, answers, position, timer and playback. Full IELTS pins every section.
Generated Listening chunks remain cached when another set is installed.
The home screen lists all unfinished attempts with Resume and Delete actions,
plus saved agent-created IELTS tests with Start new attempt and Delete actions.
Deletion is learner-controlled, with a confirmation; it is not a WebMCP tool.
A universal assessment still has one unfinished draft at a time. Empty
Speaking setup can be left safely, preserving the configured questions. Once the
interview starts, navigation is blocked (`SPEAKING_IN_PROGRESS`) because the
learner must finish or use Exit test to pause. Completed answers are saved
before the next question. An unfinished recording is not saved. Listening and
Full IELTS open during audio preparation. Selecting a different Listening set
activates it and opens the exam, returning `view: "exam"` and
`status: "audio_preparing"` while needed. No second start call is required.
The existing player shows preparation and retry controls. The timer pauses
while audio is unavailable; playback begins when ready if the browser permits it. Full IELTS resumes through the
existing ordered-section logic. Its next section receives its own attempt ID,
reported in the returned context.

Review navigation selects the relevant passage, part, task, or question.
Question and correction targets move keyboard focus into their content. Writing
corrections open their feedback panel, including on mobile. A correction ID
shared by both Writing tasks requires `taskNumber`. Unknown targets fail before
navigation; universal assessments with review disabled reject question
navigation. `get_practice_context.reviewLocation` reports the shared selection
after either a tool call or a learner's navigation.

When a learner asks for grading, call `begin_submission_evaluation` with
`kind: "writing"`, `"speaking"`, or `"assessment"`. Omit selectors for the visible
submission, supply an exact `attemptId` for history, or use `latest: true` only
when that is what the learner requested. The tool opens that submission through
shared navigation, returns its policy-filtered responses, saved feedback,
revision and attachment schema, and shows an evaluating notice before returning.
Evaluate the returned work and call `attachTool`; do not stop at announcing that
evaluation has begun. Writing also includes original guidance based on the public
IELTS criteria, so routine practice grading does not require fresh web research.

The notice represents the agent's acknowledgement, not an application-owned AI
job. A successful attachment clears it. Failed attachment shows recovery copy.
After five minutes without feedback it stops spinning and offers a follow-up
request with the same attempt ID. Dismissing the notice does not cancel the agent.
Reload clears this temporary state; submitted responses and saved evaluations
remain in SQLite. `get_practice_context.evaluationActivity` exposes the current
notice without response text. Read-only submission calls do not start it.
Speaking feedback that already exists and objective-only custom assessments do
not start an evaluation. Writing and custom rubric revisions remain supported.

Saved Writing and Speaking attempts can be opened before evaluation. The screen
shows that feedback is pending and updates when the agent attaches it. A fresh
agent can discover and open those attempts after reload, without clicking
through the UI. To create follow-up practice from a result, read the feedback,
open the library, get the appropriate authoring kit, then install. Installation
opens practice by default. Tools
never answer questions, submit attempts, discard drafts, or expose active answer
keys.

Universal assessment tools:

- `get_assessment_authoring_kit` returns current capabilities, coverage limits,
  authoring rules and a complete example unless its questions overlap an unfinished test. SAT has 98 questions;
  GRE has one Issue essay and 54 objective questions. Exam formats include
  source links and current timings. Request `includeSchema: true` for the full
  `packageSchema`; it is also included when examples are withheld.
- `install_assessment` validates, persists, and opens a complete package by
  default. `openAfterInstall: false` saves it for later without starting a timer.
- `get_assessment_content` retrieves the currently installed universal package
  by `packageId`, including its revision. `view: "summary"` returns part/item IDs
  without prompts or keys; the default `full` read includes authoring content.
  Full reads require the library and are blocked while an unfinished attempt
  uses that package, including a paused draft. Unrelated packages remain readable.
  Optional `partId`/`itemId` filters trim the content; `revision` detects a version
  change between reads. `scope.completePackage` identifies a complete payload.
  To revise, read the complete package, edit it, increment `revision` by one, and
  pass only `data.package` to `install_assessment`. Built-ins require a new
  `packageId`. Existing submissions retain their original package snapshot.
- `get_assessment_submission` follows the submitted package's review policy:
  `answers` includes keys and correctness, `responses` omits both, and `none`
  hides objective questions, responses, and per-item outcomes. Aggregate scores
  remain available. Rubric-scored items and their responses remain readable for
  agent evaluation under every policy; they have no deterministic answer key.
  Use `view: "summary"` to discover permitted part/item IDs, aggregate results
  and evaluation metadata without question text or responses. Add `partId` or
  `itemId` to a full read to retrieve only matching content, responses, per-item
  results, required references, the package rubric, and annotations. Supplying both IDs
  requires the item to belong to that part. `scope.partial` labels partial reads;
  result totals and evaluation scores remain assessment-wide. Global evaluation
  prose and criterion feedback appear only in an unfiltered full read. The
  existing no-filter behavior remains a full read of the selected submission.
- `attach_assessment_evaluation` validates and saves criterion scores and
  feedback to the current visible submission. The app calculates the overall
  score using the package rubric's weights and scale. The input contains no
  rubric ID or agent-supplied overall score.

For a large submitted assessment, first call
`get_assessment_submission({"attemptId":"<uuid>","view":"summary"})`, then
`get_assessment_submission({"attemptId":"<uuid>","itemId":"<id from
summary>"})`. These reads preserve the visible page. Retrieve current installed
content with `get_assessment_content`; submitted content always comes from the
saved attempt.

Native IELTS tools:

- `get_ielts_objective_review` reads one submitted Reading/Listening part with
  original content, keys, saved responses, per-question correctness, and saved
  agent explanations in `questions[].explanation` (or `null`).
  Supply `section`; `part` defaults to 1. Read `availableParts` for further parts.
  The content contains unordered keys for multiple-selection groups; use the
  saved per-question correctness rather than reassigning those keys to slots.
  It never reads active draft answers.
- `save_ielts_objective_explanation` saves and shows plain-text feedback for a
  submitted Reading/Listening question. Supply `attemptId`, `section`,
  `questionId`, and `explanation` (up to 4,000 characters) while that attempt's
  review is visible. Saving selects the question and displays the explanation
  beside the review. The original response, key, and score remain unchanged.
  Identical retries return the saved timestamp and revision. To replace an
  explanation, pass its current `explanation.revision` as `expectedRevision`;
  stale revisions are rejected. Explanations persist across reloads and backups.

- `get_ielts_authoring_kit` returns one section's format facts, workflow and
  full example. Listening has 40 questions and roughly 3,300 spoken words;
  Academic Reading has 40 questions and three passages totaling over 2,150
  words; Academic Writing has both tasks. Examples are original authoring
  content, separate from playable built-ins. `includeSchema: true` adds the
  full `documentSchema`, which also accompanies kits with withheld examples.
- `install_ielts_practice_set` validates, saves and opens the requested section.
  Listening opens while its audio prepares. Set `openAfterInstall: false` only
  for a save-for-later request. The tool-only flag is not saved in the document.
- `get_ielts_learning_summary`
- `retry_ielts_listening_audio`
- `get_ielts_writing_submission`
- `attach_ielts_writing_evaluation`
- `set_ielts_speaking_interview`
- `get_ielts_speaking_progress`
- `get_ielts_speaking_submission`
- `attach_ielts_speaking_evaluation`

## Writing and universal feedback revisions

Submission readers return the current feedback and `evaluationRevision` (0
before feedback, 1 for the first evaluation and for older saved evaluations).
They also report `canAttachEvaluation` and `canReviseEvaluation` for the visible
submission.

Send the full evaluation to its existing attachment tool. An identical retry
returns `status: "saved"` with the original timestamp and revision; it does not
create another activity event. To correct feedback, read the submission first
and send the full replacement with `expectedRevision` set to its current
`evaluationRevision`. A successful correction increments the revision and
updates the visible review. Missing or stale revisions return
`EVALUATION_REVISION_REQUIRED` or `EVALUATION_REVISION_CONFLICT`, including the
current revision and recovery instructions. An identical retry after a lost
response succeeds even if it carries the previous expected revision.

Revision checks and saves happen in one database transaction. All existing
rubric, score, evidence, and annotation checks still apply. The submitted tasks,
responses, timing, and objective results remain immutable. The application keeps
the current evaluation, not a history of previous feedback text.

## Authoring and handoff

A short request such as "Make me IELTS Listening practice" should work from
page tools alone. The kits carry the guidance; project-local agent files are
not part of the learner's contract. For routine IELTS, SAT and GRE authoring,
use the included example and sourced format facts. Research is appropriate for
uncovered exams, externally sourced subject matter, changed rules, or explicit
requests for verification. Existing suitable practice can be opened directly
from `get_practice_library`.

Both installation tools return `opened`, `status` and `nextAction`. A committed
save can succeed while opening fails, for example because another assessment
draft is protected. In that case `opened: false`, `openingError` and
`openAction` identify recovery. Use `open_practice` with that action after
resolving the blocker. Do not reinstall or claim the exam is open. Cancellation
after saving likewise leaves the saved set available without opening it.

The compact installation schemas introduce the payload. The application
validates the full document with its canonical parser and returns error paths.
An agent does not need to build its own validator. Full schemas remain available
on demand. See [exam examples and format sources](./EXAM_AUTHORING.md).

## Listening preparation and readiness

Installing Listening saves and activates its document, then opens the exam by
default. Audio preparation runs asynchronously. The installation response includes `listeningAudio`, and the
context and library tools expose the same live status used by the interface:

```json
{
  "contentKey": "my-listening-set",
  "source": "kokoro",
  "phase": "generating",
  "readyToPlay": true,
  "completedChunks": 2,
  "totalChunks": 188,
  "error": null,
  "canRetry": false
}
```

`phase` is `loading`, `generating`, `ready`, or `error`. `totalChunks` is null
until the generation plan is known. `readyToPlay` becomes true once enough
durable audio is buffered, so practice can begin while later chunks generate;
`phase: ready` means preparation is complete. Playback status and browser
autoplay permission are separate from preparation readiness. Generation errors
set `readyToPlay: false` and expose the error and retry state.

When `canRetry` is true, call `retry_ielts_listening_audio` with that exact
`contentKey`. It restarts preparation using validated saved chunks, returns
immediately, and leaves answers and playback position intact. A stale key or
retry while generation is already running is rejected. In an open exam,
playback continues when chunks become available; the agent need not keep polling. The UI displays each active IELTS set's
name, audio progress, and failure details with the same retry action.

## Attempt identity and selection

Each attempt receives a UUID when it starts. A content key or assessment package
ID identifies the question set; the attempt ID identifies one learner run.
Submissions and evaluations keep that same attempt ID. Full IELTS results can
contain several independently identified section submissions.

All three submission readers use the same contract:

| Input | Selection |
| --- | --- |
| `{}` | The submission currently visible for that practice type |
| `{ "latest": true }` | The newest saved submission of that type, explicitly requested |
| `{ "attemptId": "<uuid>" }` | Exactly that historical submission |

`attemptId` and `latest` are mutually exclusive. A default read never falls back
to the newest attempt if a visible ID is missing or cannot be found. If the user
switches attempts during a default read, the tool returns
`VISIBLE_ATTEMPT_CHANGED`; the agent can read context and retry. Explicit reads
stay pinned to their requested ID. Reads do not navigate the learner's screen.
Results include the attached evaluation and `selection.mode` /
`selection.isVisible` so an agent can explain an existing result without
confusing it with other work. Evaluation writes still require the exact ID of
the eligible visible submission.

The `evaluation` field is the complete saved evaluation, or `null` before one
exists. Universal assessments include criterion scores, feedback, quoted
evidence, strengths, improvements, annotations, and the evaluation timestamp.
Writing includes both task evaluations and their correction annotations;
Speaking includes either transcript-based bands and feedback or the explicit
`insufficient_evidence` outcome with feedback and no scores. This lets an agent
explain previous feedback or plan follow-up practice without grading again.
Readback does not modify the evaluation or submission, expose Speaking audio, or
add a pronunciation score.

For unscored Speaking feedback, call `attach_ielts_speaking_evaluation` with
`status: "insufficient_evidence"`, `attemptId`, `reason`, `summary`, `strengths`
(which may be empty), and `improvements`. Omit all band fields. The result is
saved once, survives reload, appears as feedback rather than a pending
evaluation, and is excluded from band-score history. For scored feedback, use
`status: "scored"` and all four bands; older scored payloads that omit status
remain valid. A submission containing only skipped questions cannot receive
bands.

All inputs are validated before state changes. Expected failures return a
consistent `{ ok: false, error }` response with repairable field or state
details. The assessment workflow is:

```text
get_assessment_authoring_kit -> install_assessment
                                      |
                                      v
                           learner completes attempt
                                      |
                                      v
begin_submission_evaluation -> attach_assessment_evaluation when required
                                      |
                                      v
                               visible results
```

Native IELTS authoring uses a separate two-step contract:

```text
get_ielts_authoring_kit -> install_ielts_practice_set -> visible IELTS module
```

Natural-language authoring behavior is covered by a development-only model
evaluation suite. It tests routing between native IELTS and universal tools,
template selection, complete package construction, validation recovery, and
unsupported-capability handling against the production schemas. See [Agent
authoring evaluations](./AGENT_EVALUATIONS.md) for the cases, commands, semantic
report checks, and release thresholds.
