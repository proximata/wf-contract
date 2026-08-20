# wf-contract

[![ci](https://github.com/proximata/wf-contract/actions/workflows/ci.yml/badge.svg)](https://github.com/proximata/wf-contract/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fproximata%2Fwf-contract%2Fmain%2Fdocs%2Fstatus.json&query=%24.chips.tests.message&label=tests)](docs/status.json)
[![shapes](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fproximata%2Fwf-contract%2Fmain%2Fdocs%2Fstatus.json&query=%24.chips.schemas.message&label=shapes)](docs/status.json)
[![eval](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fproximata%2Fwf-contract%2Fmain%2Fdocs%2Fstatus.json&query=%24.chips.eval.message&label=eval)](docs/status.json)
[![last run](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fproximata%2Fwf-contract%2Fmain%2Fdocs%2Fstatus.json&query=%24.generatedAt&label=last%20run)](docs/status.json)

Chips read `docs/status.json`, written by CI from real check output (`scripts/status.mjs`).
The eval chip says **fixtures** because every recorded run is `synthetic: true` — a harness
self-test, not evidence about any model.

Deterministic **preflight check** for [pi-dynamic-workflows](https://www.npmjs.com/package/@quintinshaw/pi-dynamic-workflows) scripts.
It refuses workflow shapes that pass a prior stage's **raw prose** into the next stage's prompt.

It does not run workflows. There is no `run` verb, and there never will be.

## Why

Static analysis of 202 saved workflow runs (15 projects, 1109 `agent()` calls):

```
passthrough (AST, tainted binding in a prompt) 161/205 = 78.5%
JSON.parse anywhere                              1.5%
schema declared                                  5.0%
verify() helper                                  1.5%   ← while `verify` is the most common phase title (50)
```

The most-run phase in the corpus is the one with the least structure. `verify` is
re-improvised as English every single time, so a stage can report success with no
evidence and nothing downstream can tell.

## The six shapes

```
recon      {found[], gaps[], confidence}
spec       {decisions[{id,choice,why}], nonGoals[], acceptance[]}
implement  {changed[{path,why}], skipped[], risks[]}     fix = implement + cause, not a 7th shape
verify     {checks[{name,cmd,pass,evidence}], verdict}   evidence mandatory, non-empty
review     {findings[{sev,loc,claim,fix}], blocking}
synthesis  {summary, byInput[{id,kept,dropped,why}]}     every fan-out branch accounted for
```

Closed (`additionalProperties: false`), every prose field capped with `maxLength` — the cap
*is* the token budget, replacing hand-picked `.slice(0, N)` truncation.

## Use

```sh
./bootstrap.sh                       # idempotent, provider-agnostic
wf-contract check path/to/wf.js      # exit 0 clean/warn · 1 blocked · 2 usage/IO
wf-contract shapes --emit js         # paste the SHAPES literal into your script
wf-contract corpus '~/.pi/workflows/projects/*/runs/*.json'
```

A stage declares its shape with the option that already exists:

```js
const res = await agent(prompt, { schema: SHAPES.verify });
```

Also ships as a pi extension hooking `tool_call` (the last moment before
`background: true` detaches). Blocked → the full report comes back as the block `reason`.
Headless callers must pass `--wf-contract-yes` or `WF_CONTRACT_APPROVE=1`.

## Data in this repo

- `recon.json` — aggregate per-run statistics only (counts, flags, lengths). **Project names
  are pseudonymised** (`p01`…`p15`) and run ids truncated. No prompts, no script text.
- `analyze.py` — the analyzer, so the numbers are reproducible against your own
  `~/.pi/workflows` traces.
- The raw failure dossier mined from those traces is **not published**: it quotes private
  workflow scripts and prompts verbatim.

## Status

The gate, shapes, CLI and dev environment are built and tested. The A/B eval harness is
built but **H1 is untested** — zero live agent runs, all fixture runs carry `synthetic:true`
and the scoring interlock correctly refuses to evaluate the falsifiers. See `eval/RESULTS.md`.
Nothing here claims contracts raise completion rate or lower cost.

## Non-goals

Not a runner · not a security boundary · no LLM judge anywhere · no output-token estimate
and no currency figure · v1 does not gate slash/saved/builtin workflow starts (documented
hole: those call `startInBackground` and emit no `tool_call`).
