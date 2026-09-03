# Agent authoring evaluations

The application has two complementary test layers:

- Vitest verifies schemas, handlers, state transitions, grading, persistence,
  and rendering deterministically.
- Model evaluations check whether a real model can complete an authoring
  request from natural language. Browser runs discover the full live catalog;
  static runs use the authoring subset.

The model suite runs as development tooling, separately from the application.

## What is evaluated

The source manifest is `agent-evals/authoring-cases.json`. It contains nine user
requests and one focused recovery case:

1. a ten-question GRE verbal diagnostic with a passage and two three-blank Text
   Completion items;
2. short GRE quantitative practice with a calculator and a data table;
3. a biology quiz without references or a calculator;
4. a writing assessment with four rubric criteria;
5. native IELTS Reading practice;
6. a short request for a complete IELTS Listening test;
7. a short request for a full SAT test;
8. a short request for a full GRE test;
9. an unsupported request to select a sentence directly in a passage;
10. repair of an invalid package using a returned `error.issues` path.

The fixture generator calls the same production home-tool composer as the
runtime. That composer supplies the native IELTS authoring kit and installation,
the compact IELTS learning summary, the universal authoring kit, and universal
installation. The evaluation layer does not keep its own tool catalog. Static
fixtures cover this authoring subset. Live browser runs discover the full
registered catalog. Each tool checks the current practice state before allowing
an action. The default kit examples and optional full schemas come from
production code. Static mocks cannot establish browser navigation success.

The first four requests must call the relevant universal authoring kit and then
`install_assessment`. IELTS Reading and Listening must call `get_ielts_authoring_kit` for the requested
section and then `install_ielts_practice_set`. Successful installation must
report `opened: true`; saving alone is not a completed handoff. Read-only context, library, history,
activity, learning-summary and installed-content calls are allowed around those
steps. Wrong-family writes, extra mutations and incorrect ordering fail.
Passage-text selection must read the GRE-style kit and explain the unsupported
capability in the final response. Calling either installation tool fails the case.

The report validator checks tool selection and parses each generated package
against the application schema. It also checks the request-specific contract:

- exact verbal item and three-blank Text Completion counts;
- passage and data-table presence;
- calculator and reference scope;
- four writing criteria and agent scoring;
- valid native IELTS Reading and Listening structure;
- full SAT and GRE question counts and current section timings;
- repair of the rejected package;
- no positive claim of official GRE or ETS scoring.

Unknown interaction, resource, content, layout, scoring, or learner-tool types
fail the application parser. The tool schemas, authoring examples, supported
capabilities, and unsupported coverage notes are loaded from production code
when the suite starts, so the fixtures cannot silently drift from the product.

## Deterministic tests

Run the normal test command:

```bash
npm test
```

Vitest verifies these contracts without creating files under `.evals`:

- the production home composer returns unique, valid WebMCP names and
  serializable schemas;
- the always-loaded IELTS installation schema stays below ten percent of the
  complete runtime schema;
- every authoring kit example passes the current package parser;
- GRE coverage still declares passage selection unsupported and official score
  reporting limited;
- every natural-language case compiles to a valid `webmcp-evals` trajectory.
- read-only discovery does not invalidate a correct authoring route;
- application rejections and missing persisted content fail the browser smoke
  assertions, even when the browser reports successful callback execution;
- unsupported-capability checks use the final response, never internal reasoning
  or earlier messages.

These tests use no model and no API key. Evaluation commands generate their
ignored JSON inputs before running. To generate the inputs without evaluating
them, run:

```bash
node scripts/agent-evals/prepare.mjs
```

## Native browser smoke test

Start the application, then run the deterministic browser journey:

```bash
npm run eval:agent:smoke -- --chrome-channel chrome-canary --verbose
```

Set `AGENT_EVAL_URL` to test another local or deployed URL. The script uses the
pinned upstream browser runner with application result assertions. Every call
must return `ok: true`; an `{ ok: false, error }` response stops that journey.
The first page reads the learning summary and authoring kits, then installs one
universal assessment and one native IELTS Writing set with `openAfterInstall: false`
to isolate the save-and-readback journey. A fresh page in the same
temporary browser profile reads back the complete universal package and the
saved Writing library entry, including its active selection.

This is an authoring and persistence smoke test, not coverage of all registered
tools or the full learner-to-feedback workflow. It uses no model or API key and
saves a JSON report under `.evals/agent-authoring/reports`. Model evaluations
check natural-language tool selection separately.

## Static model evaluation

Set credentials for a backend supported by `webmcp-evals`, then run, for
example:

```bash
npm run eval:agent:local -- --backend vercel --model openai:gpt-5.4 --runs 1
```

The local mode gives the model the exact current production tool schemas. Read
tools return their real generated authoring-kit payloads through deterministic
mock results; mutation tools return success-shaped mocks. The report gate still
validates the model's generated arguments with the application parsers.

Each run writes a raw execution JSON report and an application validation JSON
report to its own directory under `.evals/agent-authoring/reports`.

## Live browser evaluation

Start the application in one terminal:

```bash
npm run dev
```

Then run the browser suite in another terminal with a Chrome channel that has
native WebMCP support:

```bash
npm run eval:agent:browser -- --backend vercel --model openai:gpt-5.4 --chrome-channel chrome-canary
```

The default target is `http://127.0.0.1:5173/`. Override it without editing the
suite:

```bash
AGENT_EVAL_URL=https://example.test npm run eval:agent:browser -- --backend vercel --model openai:gpt-5.4
```

Browser mode reads the live registered tools and executes real application
commands. The upstream runner opens a fresh page for each case, while successful
installation persists for the life of that temporary browser profile. Use one
run for ordinary development.

## Release criteria

With the development server running, execute:

```bash
npm run eval:agent:release -- --backend vercel --model openai:gpt-5.4 --chrome-channel chrome-canary
```

The wrapper delegates model and browser execution to `webmcp-evals`. The
application validator removes permitted read-only discovery calls, then applies
the upstream matcher to the essential ordered calls and checks the generated
content with the application parsers. Successful installation results are
required. The final response must explain an unsupported request.

The `.validation.json` report and command exit status are the release verdict.
Raw upstream reports retain the full trajectory for diagnosis; their strict
matcher may mark permitted discovery calls as unexpected. That raw verdict is
not used as the application gate. Execution errors still fail.

Release mode defaults to five runs per case. It retains one extra behavior the
upstream runner does not provide: the wrapper launches a separate temporary
browser process for every run and aggregates the reports. An installation in one
run therefore cannot cause a package-revision conflict in another. The release
gate requires:

- at least 90% of all case runs to pass;
- at least 80% for every individual case;
- 100% correct routing for native IELTS Reading;
- 100% refusal to approximate unsupported passage selection;
- every counted pass to satisfy the ordered authoring contract and the semantic
  package checks.

Pass `--runs` explicitly to change only the sample count. The thresholds stay
fixed. Reports identify the tested model and version. Repeat evaluations when
either changes.

## Evaluation tooling

The suite pins `webmcp-evals` to `0.0.4` for reproducible runs. It is an
Apache-2.0 development dependency maintained in the [GoogleChromeLabs WebMCP
tools
repository](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals).
The smoke adapter uses its pinned browser registry and runner modules. Before
upgrading, rerun the deterministic tests and inspect changes to result handling,
tool-schema mapping, browser launch flags, trajectory matching, and report format.

The checks follow [Chrome's evaluation guidance](https://developer.chrome.com/docs/ai/webmcp/evals)
for tool outputs, visible changes, failures and multi-step user journeys. Browser
transport completion alone is not an application success assertion.


## Short-prompt handoff checks

The Listening, full SAT and full GRE cases use ordinary short prompts without
schema or workflow instructions. Their expected install results include
`opened: true`, and the package validator checks full question counts and timing.
These are model evaluations when run with a configured backend, not evidence
that a model passed merely because the fixtures compile.

Deterministic tests cover default opening, explicit save-only requests,
cancellation after a committed save, opening errors with saved-content recovery,
and Listening timer suspension during preparation and buffering. Browser checks
must separately observe the exam, the saved attempt after reload, and locally
continuing audio. Do not claim question-generation latency from a timed
installation call; that call receives content the model has already written.
