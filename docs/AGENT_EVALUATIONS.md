# Agent authoring evaluations

The application has two complementary test layers:

- Vitest verifies schemas, handlers, state transitions, grading, persistence,
  and rendering deterministically.
- `webmcp-evals` checks whether a real model can understand the complete set of
  tools available on the library screen and complete an authoring request from
  natural language.

The model suite is development-only. It does not add an AI service, model key,
or model SDK to the application bundle.

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

The prepared suite exposes the same four tool definitions that the application
registers on its library screen: native IELTS installation, the compact IELTS
learning summary, the universal authoring kit, and universal installation.
Submission, evaluation, and Speaking-interview schemas are registered only on
their relevant result or interview surfaces, so unrelated large schemas do not
consume authoring context.

The first four requests must call the smallest relevant universal authoring
kit and then `install_assessment`. IELTS Reading must call
`install_practice_set` without entering the universal lane. Passage-text
selection must stop after reading the GRE-style kit and explain the unsupported
capability; calling either installation tool fails the case.

The report gate does more than compare function names. It passes every
generated package back through the application's current parser and checks the
request-specific contract:

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

## Deterministic preflight

Run the normal test command:

```bash
npm test
```

In addition to Vitest, it prepares the evaluation artifacts under the ignored
`.evals/agent-authoring/fixtures` directory and verifies:

- all expected production tools are present once and in runtime order;
- the IELTS versus universal routing descriptions remain explicit;
- every authoring kit example passes the current package parser;
- GRE coverage still declares passage selection unsupported and official score
  reporting limited;
- every natural-language case compiles to a valid `webmcp-evals` trajectory.

This preflight uses no model and no API key.

## Native browser smoke test

Start the application, then run the deterministic browser journey:

```bash
npm run eval:agent:smoke -- --chrome-channel chrome-canary --verbose
```

Set `AGENT_EVAL_URL` to test another local or deployed URL. The smoke runner
uses Chrome's native WebMCP implementation and calls every tool registered on
the library screen. It checks real discovery, callback execution, local
persistence, and structured failure handling without a model or API key. Keep
this separate from the model evaluations. It proves that the browser can call
the tools, not that a model will choose them correctly.

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

Reports are written to `.evals/agent-authoring/reports` as JSON and HTML.

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

## Release bar

With the development server running, execute:

```bash
npm run eval:agent:release -- --backend vercel --model openai:gpt-5.4 --chrome-channel chrome-canary
```

Release mode defaults to five runs per case. The wrapper launches a separate
temporary browser process for every run, then aggregates the reports, so an
installation in one run cannot cause a package-revision conflict in another.
It requires:

- at least 90% of all case runs to pass;
- at least 80% for every individual case;
- 100% correct routing for native IELTS Reading;
- 100% refusal to approximate unsupported passage selection;
- every counted pass to satisfy both the upstream call matcher and the local
  semantic package gate.

Pass `--runs` explicitly to change only the sample count. The thresholds stay
fixed. A report is evidence for the tested model and version, not a permanent
claim that every model will behave identically.

## Tooling boundary

The suite pins `webmcp-evals` to `0.0.4` because it is experimental. It is an
Apache-2.0 development dependency maintained in the
[GoogleChromeLabs WebMCP tools repository](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals).
Before upgrading, rerun the deterministic preflight and inspect changes to its
tool-schema mapping, browser launch flags, trajectory matching, and report
format.
