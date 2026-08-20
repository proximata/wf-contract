# wf-contract — preflight check for pi-dynamic-workflows

Deterministic, model-free. Runs BEFORE a workflow run. Refuses shapes that pass raw prose
between stages. Ships as CLI (CI) + pi extension (local harness).

Status: spec. Nothing implemented.

---

## 0. Grounded numbers

Re-measured with acorn against all 205 persisted run scripts (`~/.pi/workflows/projects/*/runs/*.json`),
not the regex in `analyze.py`. Probes: `/tmp/wfc/taint.mjs`, `/tmp/wfc/wrapcheck.mjs`.

| fact | value | note |
|---|---|---|
| taint→prompt (AST) | 161/205 = **78.5%** | regex said 84.7% — gap is benign `${cwd}` `${i}` |
| violating sites | 1040 | median 5/script, max 29 |
| clean scripts | 44 (21.5%) | the FP-test baseline |
| every-producer-has-schema | 1/205 | contracts are effectively unused |
| strip+wrap parse fail | 5/205 | all 5 already `status=failed`, 0 FP |
| `parallel([...])` static N | 182 sites | width known at preflight |
| `parallel(x.map(…))` dyn N | 37 sites | width unknown → `×N?` |

`84.7%` is retired. Published figure is **78.5%**, AST-derived.

---

## 1. CLI surface

```
wf-contract check  <path|->            gate one script
wf-contract shapes [--emit js|json]    print the six schemas
wf-contract corpus <glob>              batch check → FP report
```

`check` flags:

```
--json              machine report (see §7) instead of the human render
--dag               DAG only, no rules
--max-tokens N      arm WFC103 (default: off)
--warn-only         downgrade every block to a warn; still exit 0
--allow <file>      allowlist path (default ./.wf-contract.json)
```

Exit: `0` clean or warns-only · `1` ≥1 block · `2` usage/IO/parse-of-own-input error.

The CLI **never prompts**. Confirmation is the extension's job (§8). No `--yes` on the CLI —
a headless tool that can be talked out of its verdict is not a gate.

No `run` verb, ever. Neither pi package ships a `bin`; there is no headless workflow runner to
wrap, and `runWorkflow` constructs real agent sessions. wf-contract checks; something else runs.

---

## 2. How a stage declares its shape

Use the **existing** `agent(prompt, { schema })` option. No new key.

```js
const SHAPES = { /* pasted verbatim from `wf-contract shapes --emit js` */ };

const found = await agent(`…`, { label: 'recon', schema: SHAPES.recon });
```

Recognition rule, static:
1. top-level `const SHAPES = { … }` object literal, all six properties, object-literal values
2. gate canonicalises each value (`JSON.stringify` with recursively sorted keys) and sha256s it
3. compare to `shapes/index.json` → mismatch is **WFC003** with a key-level diff
4. an `agent()` call's `schema` must be a `MemberExpression` `SHAPES.<name>`. Computed access,
   spread, or an inline literal → WFC003.

Why the existing key and not `{ shape: 'recon' }`:
- `agentOptions` is hashed wholesale into the resume key (`workflow.ts:621`) — a new key
  invalidates every cached prefix on in-flight scripts.
- `schema` already buys the runtime half free: pi validates `structured_output` params before
  `execute()`, escalates to re-prompt → typebox prose extraction → **non-recoverable**
  `SCHEMA_NONCOMPLIANCE`. Never a silent `null`. `isEmptyTextAgentResult(result, schema)` also
  changes the emptiness test, which is the exact source of F10's `AGENT_EMPTY_OUTPUT`.
- Zero runtime patch. wf-contract is additive to a package it does not own.

Why paste and not import: the vm blocks imports. Paste + hash is the only mechanism available,
and the hash makes drift loud.

`fix` is **not** a seventh shape → `implement` + `cause`.

---

## 3. The six schemas on disk

`shapes/<name>.json`, JSON Schema draft-2020-12 subset (`type` `properties` `required` `items`
`enum` `maxLength` `additionalProperties:false`). `shapes/index.json` = `{name: sha256}`.
`shapes/shapes.js` is **generated** from the JSON — one source of truth.

```
recon      { found[{id,claim,evidence,shape?}], gaps[], confidence }      3
spec       { decisions[{id,choice,why}], nonGoals[], acceptance[] }       3
implement  { changed[{path,why}], skipped[], risks[], cause? }            4
verify     { checks[{name,cmd,pass,evidence}], verdict }                  2
review     { findings[{sev,loc,claim,fix}], blocking }                    2
synthesis  { summary, byInput[{id,kept,dropped,why}] }                    2
```

Enums · required · caps:

```
recon.confidence      low|med|high            claim ≤600  evidence ≤2000
spec                  decisions ≥1            why   ≤400  acceptance[] ≤300 ea
implement             changed ≥0, skipped ≥0  why   ≤300  risks[] ≤300 ea
verify.verdict        pass|fail|blocked       cmd   ≤200  evidence ≤1200  pass:boolean
verify.checks         ≥1, evidence REQUIRED and minLength 1
review.findings[].sev blocker|major|minor|nit loc ≤200 claim ≤500 fix ≤500
review.blocking       boolean
synthesis.summary     ≤1500                   byInput[].kept,dropped: boolean
synthesis.byInput     length MUST equal fan-out width (checked post-run, not by the gate)
```

`maxLength` per field **is** the size budget. It replaces `.slice(0, 3000)` (225 sites, N by
feel, cuts mid-sentence, and at `mr5mulbk` truncated the security findings handed to the
remediator at char 6000). A cap on a field drops the least-important field; a cap on prose
drops whatever was at the end.

`additionalProperties:false` everywhere. A shape that accepts extras is not a contract.

---

## 4. Refusal rules

Two severities only. **block** = exit 1 / `{block:true}`. **warn** = printed, exit 0, but
forces the interactive confirm.

### Blocks

| id | fires when | corpus |
|---|---|---|
| WFC001 | tainted binding interpolated into an `agent()` template, producer has no `schema` | 161 runs / 1040 sites |
| WFC002 | body fails to parse after harness strip+wrap | 5 runs, 0 FP |
| WFC003 | consumed `agent()` lacks `schema`, or `schema` ≠ one of the six by hash | 204/205 |
| WFC004 | `agent()`/`parallel()`/`pipeline()` promise neither awaited nor returned nor assigned | 3 runs (one lost 16 done agents) |
| WFC005 | control flow keyed on a string op over a tainted binding | 11 runs, 2 failed |
| WFC006 | `parallel()` branch binding destructured and never read again | 5 sites |

**Taint** (WFC001): a binding is tainted when its initialiser reaches, through ≤6 hops of
`await` / `MemberExpression` / method-call chaining, a call to `agent parallel pipeline
workflow verify judgePanel loopUntilDry completenessCheck retry gate`. Propagates through
`ArrayPattern` and `ObjectPattern` destructuring (so `const [a,b] = await parallel([…])` taints
both) and through derived bindings (`const t = xs.map(…).join('\n')`), fixed-point, 3 rounds.
Violation = a tainted `Identifier` inside `agent()`'s **arg0**, excluding non-computed property
positions. If the producing call carries a valid `schema`, the interpolation is legal — a
contract-carrying edge may be rendered into prose however the author likes.

**WFC002** reproduces `parseWorkflowScript` exactly: acorn `{ecmaVersion:'latest',
sourceType:'module', allowAwaitOutsideFunction:true, allowReturnOutsideFunction:true}`, then
`script.slice(0, first.start) + script.slice(first.end)` (workflow.ts:946), then
`` `(async () => {\n${body}\n})()` `` (workflow.ts:831) re-parsed as `sourceType:'script'`.
This couples wf-contract to a harness internal: pin the reproduced version in
`shapes/index.json.harness`, assert it in `test/wrap.test.mjs` against the installed package,
and **warn** (WFC106) when the installed version ≠ pinned. Costs <50ms and no model call —
it is the cheapest 5 of the 9 failed runs anyone will ever recover.

**WFC005** string ops: `.includes .startsWith .endsWith .indexOf .search .match .split .test`
and `RegExp.prototype.test` with a tainted argument. `**CLEAN**` inverted a public-repo publish
gate because two asterisks beat `startsWith('CLEAN')`; the author's own next run patched
`.trimStart()` and still not markdown. Under contracts these are `verify.verdict` and
`review.blocking` — enum fields, renderable in the DAG because they are data.

**WFC006** exists because a discarded branch reports `completed`. At `mr5ir7nu` the dropped
branch was the one that wrote the spec the next phase read.

### Warns

| id | fires when | corpus |
|---|---|---|
| WFC101 | `.slice(0, N)` on a tainted binding | 225 sites / 43 runs |
| WFC102 | a path string appears in a "write" prompt and a later "read" prompt with no data edge | F13 |
| WFC103 | estimated prompt tokens > `--max-tokens` or a `phase(_, {budget})` | — |
| WFC104 | `parallel(x.map(…))` — width unknown at preflight | 37 sites |
| WFC105 | `agentTimeoutMs` absent/null | all 3 wedged runs |
| WFC106 | installed harness version ≠ the version WFC002 reproduces | — |

WFC101/102 are warns because both are heuristics: a slice may be deliberate under a capped
schema, and WFC102 is string-matched across prompts and will fire on coincidence. A block must
be defensible from the AST alone.

### Escape hatch

`.wf-contract.json`:

```json
{ "allow": [ { "rule": "WFC001", "sha256": "<script hash>", "why": "one line" } ] }
```

Keyed by the hash of the **script**, not its path. Edit the script → the exemption dies. No
expiry field: the hash is the expiry. `why` is required and non-empty; the report prints every
consumed exemption so a suppressed rule is still visible.

---

## 5. ASCII DAG

Nodes = `agent()` call sites. Label = `opts.label` ?? `#i`. Edges = the taint graph from §4,
which is the *declared* wiring — filesystem coordination is invisible by construction and is
rendered separately, dashed, as a guess.

Rules:
- ≤60 columns. Rendered wider is not read on a phone.
- chain `└▶` · fan-out `├▶` repeated, header `⇉N` · consolidation `⇊ consolidate k/N`
- each edge carries `<contract> ~<tokens>` right-aligned; contract is the shape name or `RAW`
- `⇉N?` when width is dynamic (WFC104); the total becomes a lower bound `≥`
- `⚠ orphan` on a node whose output no edge consumes (WFC006) or which declares no output (F13)
- `┄▶ path/to/file.md ?` for a WFC102 side-channel, always with the `?`
- branch conditions render as the field they read: `?verdict=fail▶` — possible only because
  contracts made them data

```
wf-contract check corpus-script-a.js            BLOCKED 6 · warn 2

[0] recon_system              recon      ~0.4k
 └▶[1] spec_layout            spec       ~0.6k
    └▶⇉4 journeys
       ├▶[2] review_joining      review  ~0.5k
       ├▶[3] review_team         review  ~0.5k
       ├▶[4] review_managing     review  ~0.5k
       └▶[5] review_backoffice   review  ~0.5k
          ⇊ consolidate 4/4
    └▶[6] fix_polish           implement ~2.1k
       └▶[7] close             synthesis ~0.3k
```

---

## 6. Executive summary

Fixed shape, ≤8 lines, verdict first. Truncated on a phone it still lands.

```
BLOCKED 6 · warn 2 · exempt 0
stages 8 · edges 9 · fan-outs 1 (max 4) · orphans 0 · depth 4
contracts  recon×1 spec×1 review×4 implement×1 synthesis×1 · RAW 0
in ≈ [12.4k … 31.8k] est chars/4 · out unmeasured
blocks  WFC001×4 WFC003×2
warns   WFC101×1 WFC105×1
fan-out 4 branches → [6], consolidated by synthesis.byInput (4 slots)
longest  recon_system → spec_layout → review_* → fix_polish → close
```

---

## 7. Token stats, pre-run, honestly

Formula is the runtime's own so the gate and the run cannot disagree:

```
estimateTokens(v) = ceil(JSON.stringify(v ?? '').length / 4)      workflow.ts:1563
```

What is knowable before anything runs:

| part | status |
|---|---|
| static template chunks | **exact** char count → exact under the formula |
| `${}` holes on contract edges | **bounded** — Σ of the producing shape's `maxLength` |
| `${}` holes on RAW edges | **unbounded** — reported as `∞`, which is the point |
| output tokens | **not estimated** |
| dynamic fan-out width | unknown → total is a lower bound `≥` |

Output format is fixed and never a single number:

```
in ≈ [12.4k … 31.8k] est chars/4 · out unmeasured
```

`lo` = static text only. `hi` = static + every hole at its cap. Mandatory `est` label,
mandatory `chars/4`, never a currency figure.

There is **no historical baseline**: all 202 corpus runs record `tok=0` at the rollup, and
`tokenBudget` is null on all 33 aborted/failed runs. Anyone reporting a calibration factor is
inventing it. Calibration lands only after the eval (§9) produces paired `Σ agents[].tokens`.

---

## 8. Extension, confirmation, CI

Attach point: `pi.on('tool_call')`, `event.toolName === 'workflow'`. Fires before execution,
can block, and — decisive — before `background:true` (the default) detaches the run.
`checkpoint()` cannot serve this: it is inside the vm and takes its declared default headlessly.

```
tool_call(workflow)
  ├ resolve script      input.script, else resolveWorkflowInvocation(input.name, …)
  ├ spawn CLI           node bin/wf-contract.mjs check - --json   (stdin)
  ├ blocks>0 & !approved → { block:true, reason: <report> }
  ├ ctx.hasUI            → ctx.ui.confirm('wf-contract preflight', DAG+summary)
  │                        declined → { block:true, reason:'preflight declined' }
  └ !ctx.hasUI           → approved ? pass : { block:true, reason:'pass --wf-contract-yes' }
```

The extension **shells out to the CLI**. One implementation of the rules, no acorn-resolution
risk from `~/.pi/agent/extensions/` (wf-monitor already concluded sibling global packages do
not resolve there and vendored instead), and the extension exercises the exact code path CI
runs. `ponytail:` costs a node boot (~40ms) per workflow start — irrelevant at that frequency.
Upgrade path if it ever matters: import in-process once acorn resolution from the extensions
dir is proven.

Blocking returns the full report as `reason`, so the model sees rule ids and can fix the script
in the same turn. That loop is the product.

CI / non-interactive approval, three levels, checked in order:
1. `--wf-contract-yes` (`pi.registerFlag`, boolean, default false)
2. `WF_CONTRACT_APPROVE=1`
3. per-script `.wf-contract.json` allowlist (§4)

**Known hole, not closed in v1.** Slash commands, saved-workflow commands and builtin commands
call `manager.startInBackground(script, …)` directly and emit no `tool_call`
(`saved-commands.ts:95`, `builtin-commands.ts:295`, `workflow-ui.ts:1689`). Those starts are
ungated. The run JSONs carry no origin discriminator, so the share is unmeasurable from traces.
v1 documents it; the fix is an upstream `workflow_start` event, requested, not vendored — a
WorkflowManager monkey-patch would be a second, drifting copy of the start path.

---

## 9. Eval

Claim under test, stated narrowly enough to be wrong:

> **H1.** Contracts convert silent wrong answers into loud, located failures at a named edge,
> without costing more correctness than they buy.

Not claimed: higher completion rate, lower cost, fewer aborts. The recon could show a contract
makes each failure *representable*; it could not show the run would then succeed.

### Arms

- **A prose** — corpus style, raw interpolation, no `schema`
- **B contract** — same task, six shapes, passes `wf-contract check`

Both arms generated from the **same brief by the same author model**, differing only in the
style constraint. Otherwise the eval measures prompt-writing skill. Scripts are frozen and
committed before run 1; reps execute the frozen text.

### Tasks

12, reconstructed from corpus runs, stratified 4 / 4 / 4 — fan-out+consolidate · sequential
chain · verify-heavy. 6 also run as a **seeded-fault** variant: an upstream stage forced to
fail with `agentTimeoutMs: 1`. Ground truth is then known by construction, which is what makes
the loud-vs-silent measurement deterministic.

18 script-pairs × 2 arms × **5 reps** = **180 runs**. 5 reps because agents are nondeterministic
and 5 gives per-task rate resolution of 0.2.

### Scores — every one model-free

```
S1 task_pass        checked-in accept.sh, exit 0/1, written BEFORE any run
S2 silent_wrong     run.status=='completed' AND task_pass==0        ← the metric
S3 located_failure  ¬pass AND a stage-named error surfaces
                    (SCHEMA_NONCOMPLIANCE | WFCxxx | agent error with no downstream launch)
S4 null_fed         ≥1 stored prompt contains a standalone ^null$ line
S5 tokens           Σ agents[].tokens
S6 evidence_replay  re-execute every verify.checks[].cmd in a clean checkout,
                    compare exit code to the reported `pass`
```

`run.status` is **never** a success signal. 13 of the 14 null-fed corpus runs report
`completed`, including both runs that produced a provably wrong final answer.

S4 is true-by-construction in B (`SCHEMA_NONCOMPLIANCE` is non-recoverable) and is therefore
reported as a **mechanism check, not evidence**. A metric that cannot go the other way proves
only that the wiring is connected.

Analysis: paired by `(task, rep)` across arms, McNemar exact on discordant pairs, α=0.05.
90 pairs detects a ~20pp shift at 80% power. Below that the eval is blind and reports **"no
detectable difference"** — never "no difference".

### Falsifiers

Each has a number. Any one firing sinks H1 as stated.

```
F-A  task_pass(B) < task_pass(A) − 10pp
     contracts cost more correctness than they buy. LIVE RISK: SCHEMA_NONCOMPLIANCE
     is non-recoverable, so B hard-fails where A limped to a wrong-but-complete answer.
F-B  median tokens(B) > 1.5 × median tokens(A)
F-C  evidence_replay mismatch in B > 20%
     SCHEMA-VALID VACUITY — the sharpest one. {"checks":[],"verdict":"pass"} satisfies
     the shape and enforces nothing. If a model can fabricate `evidence` at will, the
     verify shape is decoration and the whole six-shape argument goes with it.
F-D  gate false positives > 5% over the 44 clean corpus scripts + 30 hand-audited blocks
F-E  >2 of 12 tasks need a shape outside the six
F-F  located_failure(B) ≤ located_failure(A) on the seeded-fault subset
     the core claim is simply false
```

Pre-registration: frozen A/B scripts, `accept.sh` per task, and `score.mjs` are all committed
before run 1. No metric is added after data is seen. That, and F-A/F-C in particular, is what
stops this being an eval that cannot fail.

---

## 10. Repo + dev environment

```
bin/wf-contract.mjs
src/{parse,taint,rules,dag,tokens,report}.mjs
shapes/{recon,spec,implement,verify,review,synthesis}.json  index.json  shapes.js (generated)
extension/{index.ts,package.json}
eval/{tasks/NN/{brief.md,A.js,B.js,accept.sh},run.mjs,score.mjs}
test/*.test.mjs                       node:test, no framework
bootstrap.sh                          idempotent
overlays/*.sh                         optional drop-ins, exe-dev.sh among them
docs/SPEC.md
```

ESM `.mjs`, node ≥22 (measured v24.18.0). **acorn is the only dependency** — the same parser
`workflow.ts:1352` uses, so gate AST and runtime AST cannot disagree.

**No JSON Schema validator, either side.** The CLI compares canonicalised shape literals by
sha256; runtime instance validation is already pi's job via `structured_output`. typebox is
free inside an extension via the loader alias but absent from the CLI's tree — and needed by
neither.

`bootstrap.sh` is idempotent and provider-agnostic; every VM-specific fact lives in an overlay.
Contributing a customization = adding one `overlays/<name>.sh`. The base shape is byte-identical
for every user regardless of provider.

### Naming

The runtime already exports `verify()` → `{real,realCount,total,votes}` and `gate()` →
`{ok,value,attempts}`. Neither is ours.

- shapes are only ever reached as `SHAPES.verify` — collision is syntactically impossible
- the binary is `wf-contract`, the verb is `check`
- **the word "gate" never appears in wf-contract's API surface.** Prose says "preflight check".
  `gate()` keeps its meaning.
