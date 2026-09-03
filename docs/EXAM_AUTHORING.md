# Exam authoring examples

The page tools provide complete, installable examples for the supported exam
formats. A learner does not need a project directory, an AGENTS.md file, or a
long prompt. Routine practice uses the kit's example and format facts. Research
is reserved for uncovered formats, external factual material, current-rule
verification, and requests that explicitly ask for it.

| Kit | Complete example | Timing |
| --- | --- | --- |
| IELTS Listening | Four parts, 10 answer slots each, about 3,300 spoken words, distinct speaker roles, completion, matching and choice questions | Approximately 30 minutes of listening-style practice |
| IELTS Academic Reading | Three passages totaling over 2,150 words, 40 questions, completion, headings, True/False/Not Given, Yes/No/Not Given and single choice | 60 minutes |
| IELTS Academic Writing | Task 1 bar chart and Task 2 essay, minimum 150 and 250 words | 60 minutes |
| SAT style | Reading and Writing modules of 27 questions each, Math modules of 22 questions each | 32, 32, 35 and 35 minutes |
| GRE style | Issue essay first; Verbal sections of 12 and 15 questions; Quantitative sections of 12 and 15 questions | Writing 30 minutes; Verbal 18 and 23; Quantitative 21 and 26 |

The named SAT and GRE examples are full tests. The general quiz and writing
examples remain short because they teach open-ended custom formats. An explicit
request for a shorter SAT or GRE drill can reduce the example's scope. Native
IELTS Listening and Reading still require 40 answer slots.

The examples model question structure and use original content. They are not
psychometrically calibrated official exams. SAT and GRE run a fixed sequence;
there is no adaptive module selection, official scaled score or percentile.
The runner does not schedule the SAT's inter-section break. GRE's advisory
writing rubric is not ETS's holistic scoring process. Native Academic Writing
currently supports a bar chart, not every official Task 1 type. General Training
Reading and Writing require different content and are not supplied by these kits.

## Getting from a request to practice

For existing suitable practice, read `get_practice_library` and open its ID.
For new IELTS content, call `get_ielts_authoring_kit` with the section. For SAT
or GRE, call `get_assessment_authoring_kit` with `sat-style` or `gre-style`.
Read the kit once, write the content, and pass the complete document to the
matching installation tool. The app validates it and opens practice by default.

The default kit includes the example and guidance. `includeSchema: true` adds
the full JSON Schema. When unfinished practice prevents answer-bearing examples
from being returned, the kit supplies the schema automatically. Examples must
stay separate from playable built-ins so a kit cannot disclose their keys.

Installation returns `opened: true` only after navigation succeeds. Listening
can be open while `readyToPlay` is false. Preparation and errors appear in the
existing exam player, and the timer pauses while audio is unavailable or awaiting a required Play click. Once
audio can play, local playback continues without another agent turn, subject
to browser autoplay restrictions.

Use `openAfterInstall: false` when the learner asks to save practice for later.
If saving succeeds but opening fails, use the returned `openAction` after
resolving `openingError`. Reinstalling is not the recovery step.

## Format sources

Checked September 4, 2026. These pages establish format facts, not redistribution
rights for exam-owner sample questions. All example questions are original.

- [IELTS Listening format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening)
- [IELTS Academic Reading format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading)
- [IELTS Academic Writing format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing)
- [SAT structure](https://satsuite.collegeboard.org/sat/whats-on-the-test/structure), [Reading and Writing](https://satsuite.collegeboard.org/sat/whats-on-the-test/reading-writing), and [Math](https://satsuite.collegeboard.org/sat/whats-on-the-test/math)
- [GRE structure](https://www.ets.org/gre/test-takers/general-test/prepare/test-structure.html), [Verbal Reasoning](https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html), and [Quantitative Reasoning](https://www.ets.org/gre/test-takers/general-test/prepare/content/quantitative-reasoning.html)
