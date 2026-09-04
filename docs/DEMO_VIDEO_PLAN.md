# MockNiner demo video — editing brief

Updated September 4, 2026 to match the latest agreed script and demonstration order.
This replaces the earlier three-file plan featuring Speaking and environmental science.

## Current production status

The final demo is published on YouTube:
[MockNiner Demo | IELTS Practice with WebMCP](https://youtu.be/i6IOBF3TR0k).

Verified September 4, 2026: public visibility, completed SD and HD processing,
and playback at 2 minutes 48 seconds. The source recording and rendered video
files remain local and are not part of the source repository.

The sections below preserve the editing brief used during production. Planned
timings and scene descriptions are not a frame-by-frame record of the final cut.

## Story and framing

MockNiner connects agent-created practice, a real exam interface, saved results,
and useful feedback. The central proof is the collaboration: the learner asks,
the agent invokes real WebMCP tools, the application visibly changes, the learner
answers and submits, and the agent adds feedback to saved work.

Show IELTS first, then SAT, then the custom assessment. IELTS establishes the
workflow briefly; the rest of the film establishes breadth and extensibility.
Keep creation, answering, submission, and review in the same browser tab.

Target approximately **two minutes**. The narration is 277 words, roughly 1:51–1:59
at 140–150 words per minute before pauses. Adjust the rough cut to a comfortable
read; a few extra seconds are preferable to rushed narration. Keep the finished
video below the challenge's three-minute limit.

## Challenge requirements covered

The challenge requires a public YouTube video under three minutes with a clear
working demonstration and audio explaining what was built and how WebMCP was used.
Its written submission additionally asks why the use case fits WebMCP, how it
improves the experience, what people and agents can do together, and how WebMCP
was implemented. The narration addresses these points while the footage supplies
visible evidence.

The judging criteria are WebMCP Leverage, Execution, Potential Impact, and
Creativity & Ambition. Emphasize the working tool-to-browser transitions, complete
practice and feedback flow, student need, and custom assessment capability.

Sources checked September 4, 2026:
[Official requirements and rules](https://webmcp.devpost.com/rules) and
[challenge overview and judging criteria](https://webmcp.devpost.com/).
Recheck publication requirements before final submission.

## Planned edit order

These are approximate positions in the finished film, not timestamps in the raw recording.

| Final time | Scene | Evidence to retain |
| --- | --- | --- |
| 0:00–0:15 | Problem, product, and first request | MockNiner identity and the natural Listening prompt. A clean homepage shot from later in the recording can support the introduction. |
| 0:15–0:36 | IELTS Listening | Real installation tool activity; complete four-part, 40-question test opening; audio playing; a few learner answers. |
| 0:36–0:48 | Listening result and explanation | Submission, truthful result counts, and an explanation saved beside a reviewed question. |
| 0:48–1:03 | IELTS Writing | Task and response editor, submitted work, and feedback attached to that exact submission. |
| 1:03–1:17 | SAT | One complete Reading and Writing module, a few answers, submission, and results. |
| 1:17–1:43 | Custom NEET-style assessment | Natural request, installation, 30-question assessment, learner answers, and results in the same tab. |
| 1:43–1:55 | Personalised next step | Agent uses available saved IELTS results and feedback to recommend what to practise next. Tool/result footage can also support the technical explanation. |
| 1:55–2:00 | Close | Clean library or result screen with the MockNiner name. |

The final timing must follow the recorded narration and the usable footage. If a
planned scene is absent or unsuccessful, identify the gap and revise the script
or request a focused pickup; never manufacture an outcome.

## Demonstration sequence and natural prompts

These prompts document the intended recording flow and can be used for a pickup
if needed. They are not instructions to start another recording now.

### 1. Complete IELTS Listening test

Begin in a fresh conversation. Let the agent open the site from the request:

> Hey, I want to practise IELTS Listening. Make me a full 40-question test on https://mockniner-webmcp.dgkhan08.workers.dev/

Retain the real tool call and browser transition. Installation opens Listening
while its audio prepares; no second start request is normally needed. The timer
pauses while audio is unavailable, and playback starts when ready if the browser
permits it. See the current [WebMCP contract](WEBMCP.md).

Show the complete four-part structure, working audio, and two or three learner
answers. Submit using the browser controls, show the completion screen, open
results, and open answer review. All 40 questions must exist even though only a
few are answered in the demonstration.

### 2. Saved Listening explanation

After submission:

> Explain one of my incorrect answers and save the explanation in my review.

If every answered question was correct, request an explanation for one answered
question instead. Hold on the explanation in the application; a chat message
claiming it was saved is not sufficient evidence.

### 3. Writing and agent evaluation

After Listening review:

> Let’s do an IELTS Writing practice.

Show both tasks and enter substantive learner responses through the browser.
Submit, then use the **exact evaluation request shown by the application**,
including its attempt ID. Do not hard-code an ID from an earlier recording.

Wait for feedback to appear on that submission. Retain the practice score,
criterion feedback, and one useful response-specific comment or annotation.
Writing supplies the evaluation scene in this version of the film; Speaking is
not part of the current planned sequence.

### 4. SAT module and result

> Let’s practise SAT Reading and Writing. Create one complete 27-question module for me.

Show the module count, timer, navigation, two or three learner answers, submission,
and the actual result. If the recording instead uses a module within the ready-made
full-length test, describe exactly that in the final narration. Do not label a
single module as a full SAT or describe practice scores as official scores.

### 5. Custom NEET-style assessment

> Can you help me practise for NEET? Create a 30-question practice set covering Physics, Chemistry, and Biology.

Show the request, real installation, assessment title and 30-question count,
a few learner answers, submission, and results. Keep the entire workflow in one
tab. This is a NEET-style practice set, not a claim to reproduce a full official
NEET examination. Custom content remains subject to the application's supported
question types and validated assessment contract; avoid saying it supports
literally any exam without qualification.

### 6. Evidence-based next step

> Look at my saved IELTS results and feedback. Based on the work I actually completed, what should I practise next?

Show the agent using the available history and feedback. Partial demonstration
attempts do not establish a learner's overall ability or a reliable trend.
Recommendations must be grounded in answered questions and evaluated work,
without treating intentionally unanswered questions as evidence of weakness.
Do not require five historical attempts or invent scores and progress.

## Narration

The canonical ready-to-read narration is [DEMO_VOICEOVER.txt](DEMO_VOICEOVER.txt).
Keep it in that file rather than maintaining a second copy here.

It is the latest agreed 277-word draft. Record it after the rough cut so statements
about NEET, saved explanations, Writing feedback, and next-step recommendations
match the footage actually retained. Read naturally with short paragraph pauses;
do not read the user prompts aloud.

Record voiceover separately from screen capture. Use a consistent microphone
position and quiet room. Leave a little silence before and after each paragraph
for editing. WAV or the original high-quality M4A is suitable.

## Editing approach

Use Remotion for the rough cut and final composition. OpenReel is optional if it
helps a specific editing step. Inspect the relevant installed skills and current
documentation when editing begins; do not assume editor WebMCP capabilities
without checking them.

- Preserve the side-by-side view: roughly one quarter agent conversation and
  three quarters browser. Keep meaningful prompts and tool titles readable.
- Hide or crop unrelated desktop elements. Keep enough browser chrome and product
  identity to make the real agent-to-site interaction clear.
- Condense generation, audio preparation, and repetitive typing. Use an unobtrusive
  “Edited for time” label where waits are shortened.
- Keep each important tool call connected to its actual browser effect. Avoid
  fabricated tool activity, replacement results, or misleading rearrangements.
- Retain brief still holds on exam opening, submission, results, and saved feedback.
  Use restrained crops or zooms when text needs emphasis.
- For partial objective attempts, add “Selected questions answered for this
  walkthrough.” Preserve real answered, incorrect, and unanswered counts.
- Use a short Listening audio moment if the source contains it and it helps.
  Keep it quiet beneath narration. Do not assume the recording contains audio
  until the file has been inspected.
- Technical overlays may name the real tools used or show a compact
  “Agent → WebMCP tools → MockNiner” explanation. Match names to current tool
  activity; a source-code tour is unnecessary.
- Add captions after voiceover is available. Check exam names, numbers, timing,
  and readability in the final export.

Deliver a silent rough cut for review first, then add the user's narration,
refine pacing and captions, mix audio, and export the final 1080p MP4.

## Before calling the film complete

Verify the source scenes and every narrated capability against the footage.
Confirm that the complete question sets exist, the learner performs answering
and submission, objective scoring happens in the application, and saved feedback
belongs to the correct immutable submission. Keep practice scores and official
exam claims distinct. Preserve the original MOV and verify the final video's
length, playback, legibility, and audio before publication.
