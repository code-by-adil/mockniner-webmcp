# Agent authoring evaluations

The application has two complementary test layers:

- Vitest verifies schemas, handlers, state transitions, grading, persistence,
  and rendering deterministically.
- `webmcp-evals` checks whether a real model can understand the complete set of
  tools available on the library screen and complete an authoring request from
  natural language.

The model suite runs as development tooling, separately from the application.

## What is evaluated

The source manifest is `agent-evals/authoring-cases.json`. It contains six user
requests and one focused recovery case:

1. a ten-question GRE verbal diagnostic with a passage and two three-blank Text
   Completion items;
2. short GRE quantitative practice with a calculator and a data table;
3. a biology quiz without references or a calculator;
4. a writing assessment with four rubric criteria;
5. native IELTS Reading practice;
6. an unsupported request to select a sentence directly in a passage;
7. repair of an invalid package using a returned `error.issues` path.

The fixture generator calls the same production home-tool composer as the
runtime. That composer supplies the native IELTS authoring kit and installation,
the compact IELTS learning summary, the universal authoring kit, and universal
installation. The evaluation layer does not keep its own tool catalog. Static
fixtures cover this authoring subset. Live browser runs discover the full
registered catalog. Each tool checks the current practice state before allowing
an action.

The first four requests must call the smallest relevant universal authoring kit
and then `install_assessment`. IELTS Reading must call `get_ielts_authoring_kit`
for Reading and then `install_ielts_practice_set`. Passage-text selection must
stop after reading the GRE-style kit and explain the unsupported capability;
calling either installation tool fails the case.

The report validator checks tool selection and parses each generated package
against the application schema. It also checks the request-specific contract:

- exact verbal item and three-blank Text Completion counts;
- passage and data-table presence;
- calculator and reference scope;
- four writing criteria and agent scoring;
- valid native IELTS Reading structure;
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

Set `AGENT_EVAL_URL` to test another local or deployed URL. The package script
generates the fixture, then calls the upstream `smoke` command directly. The
upstream runner resolves matcher constraints to concrete arguments, opens a
fresh page per case, and calls every tool registered on the library screen. It
checks real discovery, callback execution, local persistence, and structured
failure handling without a model or API key. Use the model evaluations to check
natural-language tool selection.

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

Each run writes JSON and HTML reports to its own directory under
`.evals/agent-authoring/reports`.

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

For ordinary local and browser evaluations, the wrapper delegates execution,
`--runs`, matcher constraints, and report rendering to `webmcp-evals`, then
applies the application-specific semantic validator to the JSON report.

Release mode defaults to five runs per case. It retains one extra behavior the
upstream runner does not provide: the wrapper launches a separate temporary
browser process for every run and aggregates the reports. An installation in one
run therefore cannot cause a package-revision conflict in another. The release
gate requires:

- at least 90% of all case runs to pass;
- at least 80% for every individual case;
- 100% correct routing for native IELTS Reading;
- 100% refusal to approximate unsupported passage selection;
- every counted pass to satisfy both the upstream call matcher and the local
  semantic package gate.

Pass `--runs` explicitly to change only the sample count. The thresholds stay
fixed. Reports identify the tested model and version. Repeat evaluations when
either changes.

## Evaluation tooling

The suite pins `webmcp-evals` to `0.0.4` for reproducible runs. It is an
Apache-2.0 development dependency maintained in the [GoogleChromeLabs WebMCP
tools
repository](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals).
Before upgrading, rerun the deterministic tests and inspect changes to its
tool-schema mapping, browser launch flags, trajectory matching, and report
format.
