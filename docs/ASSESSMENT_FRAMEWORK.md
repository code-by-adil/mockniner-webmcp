# Universal assessment engine

## Product boundary

Assessment Lab has two content lanes.

- Native IELTS uses its own documents, scoring, and high-fidelity Listening,
  Reading, Writing, and Speaking interfaces.
- The universal engine runs assessments that fit its trusted content,
  interaction, scoring, navigation, and evaluation capabilities.

The agent supplies data. The application owns the interface and all executable
behavior. An assessment package cannot contain HTML, CSS, SVG, scripts, React
components, scoring functions, or tool handlers.

The universal engine does not try to copy every testing vendor. It provides one
consistent exam interface with a header, timer, question area, declared learner
tools, question navigation, a footer, submission, and results.

## Runtime model

```text
trusted capabilities in application code
                 |
                 v
complete AssessmentPackage supplied by an agent
                 |
                 v
universal interface reads the validated package directly
```

An `AssessmentPackage` contains identity, metadata, resources, ordered parts,
items, review policy, and optional rubrics. A part controls timing, navigation,
layout, learner tools, and its items. Completing a part locks it.

Each item has this shape:

```text
prompt and optional stimulus -> response interaction -> scoring rule
```

There is no exam-type registry. GRE-style, SAT-style, school, professional, and
custom assessments use the same package contract. A named authoring template is
an example for the agent. It does not add an exam-specific branch to the
runtime.

The domain modules own the executable contract. `assessmentContract.ts`
defines and validates packages, `assessmentScoring.ts` owns response and result
records, `assessmentEvaluation.ts` owns rubric evaluation payloads, and
`assessmentSubmission.ts` owns immutable submission and history records.
`assessmentSession.ts` owns the live runner state. WebMCP
converts those authoritative Zod schemas into the compact JSON Schema shown to
agents. That teaching schema is not a second validation contract.

## Instructions for agents

Use `get_ielts_authoring_kit` followed by `install_ielts_practice_set` for
native IELTS Listening, Reading, or Writing. Those sections keep their
specialized schemas and interfaces.

Use the universal tools for other assessments:

1. Call `get_assessment_authoring_kit` with the closest template.
2. Read the returned coverage notes. Do not imitate an unsupported behavior.
3. Copy `examplePackage` and replace its ID, title, content, answer keys, and
   rubric details.
4. Keep `schemaVersion` set to `3`. Do not add `source`; the application records
   authorship.
5. Declare only the tools that the learner needs. Empty `tools` and `resources`
   arrays are valid.
6. Pass the whole package to `install_assessment`.
7. If installation fails, repair the paths in `error.issues` and submit the
   whole package again.

Installation is atomic. Invalid input does not change state or storage. A
successful installation appears in the assessment library before the tool
returns.

The available templates are:

| Template | Use it for |
| --- | --- |
| `minimal-objective` | Quizzes and diagnostics with objective questions |
| `writing-with-rubric` | Essays and extended responses evaluated after submission |
| `sat-style` | Original SAT-style Reading and Writing and Math practice |
| `gre-style` | Original GRE-style Verbal, Quantitative, and analytical writing practice |

The kit returns current capabilities, limits, short authoring rules, coverage
notes, and one complete package. The examples are loaded only when requested,
so the larger SAT-style and GRE-style packages do not occupy agent context for
unrelated work.

## Minimal JSON example

This package is valid authoring input. The runtime adds `source: "agent"` after
validation.

```json
{
  "schemaVersion": 3,
  "packageId": "sample-science-check",
  "revision": 1,
  "title": "Science Check",
  "metadata": {
    "subject": "Science",
    "difficulty": "standard",
    "locale": "en-US",
    "shortLabel": "Science"
  },
  "presentation": {
    "accent": "blue",
    "density": "comfortable"
  },
  "resources": [],
  "parts": [
    {
      "id": "questions",
      "title": "Questions",
      "navigation": "free",
      "defaultLayout": "single",
      "tools": [
        { "type": "mark_for_review" }
      ],
      "items": [
        {
          "id": "water-formula",
          "domain": "Chemistry",
          "stimulus": [],
          "prompt": [
            { "type": "text", "text": "What is the chemical formula for water?" }
          ],
          "interaction": {
            "type": "single_choice",
            "options": [
              { "id": "a", "label": "CO2" },
              { "id": "b", "label": "H2O" },
              { "id": "c", "label": "O2" }
            ]
          },
          "scoring": { "type": "exact", "answer": "b" }
        }
      ]
    }
  ],
  "review": { "mode": "answers" },
  "rubrics": []
}
```

The tool's input schema is the source of truth. This example exists to make the
shape easy to read.

## Trusted content and interactions

Content blocks:

| Block | What it renders |
| --- | --- |
| `text` | Titles, instructions, and prompt text |
| `passage` | Multi-paragraph source material |
| `math` | A text math expression with an optional accessible label |
| `table` | Rectangular tabular data |
| `bar_chart` | A small quantitative chart |

Interactions and their valid scoring rules:

| Interaction | Response | Scoring |
| --- | --- | --- |
| `single_choice` | One option ID | `exact` |
| `multiple_choice` | An unordered list of option IDs | `set` |
| `text_entry` | Short text | `exact`, `aliases`, or `agent` |
| `numeric_entry` | Integer, decimal, or fraction | `numeric` with optional tolerance |
| `extended_text` | Long text | `agent` with a declared rubric |
| `matching` | One shared option list mapped to several prompts | `mapping` |
| `grouped_choice` | One independent option list for each group | `mapping` |

`grouped_choice` covers questions such as multi-blank text completion. Every
group has its own options and one correct option. The application scores the
whole mapping as one item, with no partial credit.

## Package-controlled delivery

A package may choose `single` or `split` item layout, `free` or `linear`
navigation, an optional duration for each part, comfortable or compact density,
one of four accent colors, and one review mode.

Review modes are:

- `answers`, which shows responses and expected objective answers
- `responses`, which shows responses without answer keys
- `none`, which omits item review

Learner tools are declared per part:

- `mark_for_review`
- `option_eliminator`
- `calculator`
- `reference_document`, which points to a declared resource

Omission has meaning. A quiz without a formula sheet has no reference tool. An
assessment without calculations has no calculator. The runtime never guesses
tools from the exam name, subject, or part title.

Use split layout only when an item has stimulus content. Labels such as
`Passage`, `Data`, or `Source` belong in `presentation.stimulusLabel`.

## GRE-style coverage

The `gre-style` authoring kit contains original questions for reading
comprehension, multi-blank text completion, sentence equivalence, quantitative
comparison, multiple selection, numeric entry, data interpretation, and
analytical writing. It also demonstrates a quantitative reference document, a
calculator limited to the quantitative part, timed parts, answer review, and
post-submission rubric evaluation.

The kit reports these limits to the agent:

- Passage sentences cannot act as selectable response targets.
- The engine renders text, math, tables, and bar charts, not arbitrary diagrams.
- Parts run in their declared order. The engine has no adaptive routing.
- Results contain practice accuracy and rubric feedback, not an ETS score or
  percentile.

An agent can still build useful GRE-style practice. It must not describe the
result as an official or predicted GRE score.

## Validation and runtime selection

All agent input crosses one schema-version-3 boundary. Runtime validation
checks:

- types and size limits
- stable IDs and unique item IDs
- option, resource, and rubric references
- interaction and scoring compatibility
- table dimensions
- selection limits
- split-layout requirements
- grouped-choice answer coverage
- rubric scales, criterion IDs, and weights

The model-facing JSON Schema uses shared definitions and references to avoid
repeating the same content and interaction schemas. The application still runs
the complete Zod validator before it writes anything.

The validated `AssessmentPackage` is the runtime source. Small selectors find
the active part and item, resolve declared reference documents, and apply layout
defaults. React derives display numbers from each item's position in its part.
There is no second package-shaped runtime model.

## Sessions, submissions, and results

The session stores stable part and item IDs, responses, review marks, eliminated
options, timer visibility, and absolute part deadlines. Time continues while the
page is in the background or the learner leaves and resumes.

Each submitted attempt stores an immutable package snapshot, response snapshot,
objective result, start time, and submission time. Duplicate submission events
use the attempt ID as an idempotency key.

Objective scoring returns raw score, maximum score, item outcomes, and domain
totals. The application does not accept agent-authored score formulas or result
layouts.

All agent-evaluated items in one package share one rubric. On the result page,
the agent can call `get_assessment_submission` to read the immutable submission
according to its saved review policy. `answers` includes objective keys and
correctness; `responses` returns responses without either; `none` hides objective
item details and responses. Aggregate scores remain available. Agent-scored items,
their submitted responses, and rubrics remain readable under every policy so
evaluation still works. No active draft responses or keys are returned.
The reader accepts `view: "summary"` for a compact outline with permitted part
and item IDs. Full reads can be limited by `partId` or `itemId`; matching
responses, per-item results, references, rubrics and annotations follow the
same selection. A partial read keeps aggregate scores explicitly scoped to the
whole assessment and omits global evaluation prose and criterion feedback.
Unfiltered full reads retain the complete existing response contract.

`get_assessment_content` reads the current installed package for authoring,
separately from immutable submissions. It supports the same summary and content
filters, with an optional `revision` check. Full authoring reads require the
library and reject the package used by an unfinished or paused attempt. A full,
unfiltered `data.package` can be edited and sent to `install_assessment` with an
incremented revision. Built-ins must be copied to a fresh package ID. Partial
reads are labeled and cannot serve as complete replacement payloads.

If evaluation is needed, call the registered `attach_assessment_evaluation`.
That tool checks the rubric, scale, criteria,
evidence, annotations, item IDs, and quoted response text before it saves the
evaluation. Identical retries return the saved evaluation without changing its
timestamp or revision. To revise feedback, read `evaluationRevision` from the
submission tool and supply it as `expectedRevision` with the full replacement.
The transaction rejects stale revisions, increments successful revisions, and
updates the visible result without changing the submitted responses or scores
from local objective grading. Older saved feedback is treated as revision 1.

Submission history records one explicit evaluation state:

- `not_required` when every answered item was scored locally
- `awaiting_evaluation` when an answered subjective item still needs feedback
- `evaluated` after structured feedback has been saved

The saved evaluation state is derived from the immutable objective result and
the presence of an evaluation. Reloading the application cannot turn an
evaluated attempt back into a pending one.

The application owns the result interface. Package data may supply domain names,
rubrics, review policy, an accent, and a disclaimer. It cannot supply HTML or an
arbitrary result template.

## Native IELTS and shared code

Native IELTS remains separate because its section documents, navigation,
scoring, bands, and result pages have different behavior. The universal package
contract does not replace them.

The two lanes may share attempt IDs, immutable submission rules, persistence
conventions, WebMCP result and error shapes, and small UI components when their
behavior is the same. They do not share an exam schema or score model merely
because both produce a result page.

## Extending the engine

Most new assessments should use the current contract without code changes. Add
a new application capability only when the requested behavior cannot be stated
with the existing fields.

A new interaction requires the complete implementation:

1. Add one schema variant.
2. Add its React renderer.
3. Add deterministic scoring or rubric behavior.
4. Add it to the authoring guide and a valid example.
5. Test validation, response state, persistence, WebMCP output, rendering,
   scoring, and answer review.

Do not add an exam-specific condition when a general interaction can express the
same behavior.

## Verification

Deterministic tests cover schema rules, examples, scoring, state changes,
persistence, tool handlers, rendering, and results. Model evaluations should
also check these requests in the target browser and agent:

- Create a ten-question GRE-style verbal diagnostic.
- Create mixed GRE-style quantitative practice with a calculator and data table.
- Create a three-blank text-completion question.
- Create native IELTS Reading practice.
- Create a biology quiz without a calculator or reference document.
- Create a writing assessment with a four-criterion rubric.

Record tool choice, template choice, first-install success, validation repair
count, unsupported-feature handling, installed UI behavior, answer-key privacy,
and result accuracy. Deterministic unit tests cannot prove that a model will
choose the right tool from natural language.

## Persistence

### Package and draft lifecycle

The application keeps at most one unfinished universal attempt. While that
draft exists, another package cannot be started and that package cannot be
replaced through `install_assessment`. The learner can resume it, restart it
from an empty response state, or discard it from the assessment library.

Only agent-installed packages can be deleted. Deleting one also discards its
unfinished draft, if present, but never deletes submitted attempts. History and
result review continue to work because every submission owns an immutable
package, response, and result snapshot. These lifecycle actions belong to the
human interface; they are not button-shaped WebMCP tools.

The universal lane uses three submitted-content tables and the shared draft
table in the same local database as native IELTS:

```text
assessment_packages
assessment_attempts
assessment_evaluations
practice_drafts
```

Each new draft pins its complete package snapshot, including revision, from the
start. Catalog changes cannot replace the content used to render or score it.
Submission stores the immutable snapshot and removes the draft in one transaction.

Schema version 3 has no adapter for the earlier profile, section, and module
model. On databases that have not applied migration 9, the old universal tables
are renamed to `legacy_*_v8` before current tables are created. They remain in
local exports for recovery. Native IELTS records are untouched. This cannot
recover records already deleted by an older version of migration 9.
