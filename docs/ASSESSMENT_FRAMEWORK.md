# Universal Assessment Framework

## Why the framework is separate from IELTS

IELTS already has mature section-specific documents, renderers, timing,
navigation, media behavior, grading, and review interfaces. Translating every
IELTS peculiarity into a lowest-common-denominator schema would add migration
risk without improving the learner experience.

The universal framework is therefore an additive lane. It standardizes the
large common core shared by SAT-style practice, school exams, diagnostics,
quizzes, and writing assessments while leaving native IELTS behavior intact.

## The stable contract

Every package has:

- `schemaVersion`, `packageId`, and monotonic `revision`
- a supported `profileId`
- human-facing metadata
- ordered sections, modules, and items
- optional assessment-level rubrics

Each item composes three independent pieces:

```text
content blocks -> interaction -> scoring rule or evaluation rubric
```

This separation keeps rendering and grading predictable. The agent supplies
data; the application owns all executable behavior.

### Content blocks

| Block | Purpose |
| --- | --- |
| `text` | Titles, instructions, and ordinary prompt text |
| `passage` | Multi-paragraph source material |
| `math` | A math expression with an optional accessible label |
| `table` | Rectangular tabular data |
| `bar_chart` | Small constrained quantitative charts |

### Interactions and scoring

| Interaction | Valid scoring |
| --- | --- |
| `single_choice` | `exact` option ID |
| `multiple_choice` | unordered `set` of option IDs |
| `text_entry` | `exact`, `aliases`, or `agent` |
| `numeric_entry` | numeric answer and optional tolerance |
| `extended_text` | `agent` plus a declared rubric |
| `matching` | complete prompt-to-option `mapping` |

The schema verifies IDs, counts, relationships, table dimensions, selection
limits, answer references, and rubric references before content reaches state or
storage. Active attempts never expose objective scoring keys to the candidate or
submission-reading tool.

## Profiles

`universal` accepts the full trusted vocabulary. Use it for a new exam whenever
the exam does not need additional structural invariants.

`sat-practice` adds these constraints:

- ordered `reading-writing` and `math` sections
- exactly two modules per section
- single-choice Reading and Writing items
- single-choice or numeric-entry Math items
- raw practice accuracy and domain summaries only

This profile intentionally does not reproduce College Board's adaptive routing
or scaled scoring. Those require calibrated item pools and official scoring
models; a generated practice package cannot infer them honestly.

## Objective and subjective results

Objective scoring is a pure local function over the immutable package and the
candidate response map. It returns raw score, maximum score, answer status, and
domain totals.

All agent-evaluated items in one package share one declared rubric. After
submission, the agent reads the immutable responses and returns one coherent
assessment evaluation containing:

- overall and criterion scores constrained to the rubric scale and step
- criterion feedback and, when required, evidence
- strengths and improvements
- optional annotations that must quote exact text from an agent-evaluated
  response

Only one evaluation can be attached to an attempt. It cannot be attached to a
different or historical UI submission by accident.

## Persistence and state

The universal lane uses the same local database as native IELTS but separate
tables and commands:

```text
assessment_packages
assessment_attempts       package + response + result snapshots
assessment_evaluations    one per immutable attempt
```

In-progress navigation, answers, review marks, and module time are resumable
through a narrow session store. Submission clears the resumable draft and makes
the persisted attempt the source of truth.

## Adding another exam

If the exam fits the current vocabulary:

1. Call `get_assessment_capabilities`.
2. Author original content with stable lowercase IDs.
3. Use `profileId: "universal"` and express the exam structure as sections and
   modules.
4. Include deterministic answer rules and one rubric for any subjective items.
5. Call `install_assessment`; repair any returned validation issues.
6. Complete and submit the assessment in the normal interface.
7. If needed, call `get_assessment_submission` and
   `attach_assessment_evaluation`.

If a new exam needs stricter structure but no new interaction, add a named
profile constraint and capability description. If it needs a new interaction,
the complete platform change is deliberately small but explicit:

1. add the schema variant;
2. add its trusted React renderer;
3. add its deterministic scorer or rubric behavior;
4. expose it in capabilities;
5. add validation, scoring, state, tool, and visible-render tests.

Do not accept arbitrary HTML, SVG, scripts, answer-checking code, or
agent-supplied React components as a shortcut. That would turn a safe content
package into an executable plugin system and break the framework's trust
boundary.
