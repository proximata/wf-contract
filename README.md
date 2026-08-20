# wf-contract

[![eval](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fproximata%2Fwf-contract%2Fmain%2Fdocs%2Fstatus.json&query=%24.chips.eval.message&label=eval)](eval/RESULTS.md)
[![install](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fproximata%2Fwf-contract%2Fmain%2Fdocs%2Fstatus.json&query=%24.chips.install.message&label=install)](bootstrap.sh)
[![last run](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fproximata%2Fwf-contract%2Fmain%2Fdocs%2Fstatus.json&query=%24.generatedAt&label=last%20run)](docs/status.json)

Three chips, each a measured fact written by CI into `docs/status.json` (`scripts/status.mjs`):
eval run results · install status (`bootstrap.sh` run twice, second run must change nothing) ·
last-run time. No build-passing chip, no stars, no license badge. `eval` is **yellow because
every recorded run is `synthetic: true`** — a harness self-test, not evidence about any model.

Deterministic **preflight check** for [pi-dynamic-workflows](https://www.npmjs.com/package/@quintinshaw/pi-dynamic-workflows)
scripts. Refuses shapes that pass a prior stage's **raw prose** into the next stage's prompt.

Model-free. Never runs a workflow — no `run` verb, ever.

---

## The measured problem

202 saved runs · 15 projects · 1109 `agent()` calls. Analyzer `analyze.py` and the redacted
aggregate `recon.json` are both committed, so every line below is re-derivable.

```
passthrough  raw text of stage N → prompt of N+1
  AST, tainted binding in a prompt  78.5%  161/205
  regex probe (retired, D12)        84.7%  171/202
  …and never JSON.parse anything    83.2%  168/202
JSON.parse anywhere                  1.5%    3/202
schema declared on agent()           5.0%   10/202
fenced json block                    0.0%    0/202
```

78.5% is the published figure. The regex also counted benign `${cwd}`, `${i}`; it is retired
(D12), and shown here only so the smaller honest number is the one that survives.

**The verify paradox** — the most-run phase carries the least structure:

```
phase titles  verify 50 · fix 23 · review 20 · design 19
verify() helper used       1.5%   3/202
judgePanel()               0%     0/202
parallel()                66.8% 135/202
```

`verify` is re-improvised as English every single time. ∴ a stage can report success with no
evidence, and nothing downstream can tell. That is the whole product.

Outcomes are no help either: 167/202 runs are `completed`, including runs that fed `null`
downstream. `status` is a liveness signal, not a correctness one.

---

## What it refuses

Two severities. `block` → exit 1. `warn` → printed, exit 0, but forces the interactive
confirm. A rule may only block if it is defensible from the AST alone.

| id | refuses | corpus |
|---|---|---|
| WFC001 | tainted binding interpolated into a prompt | 161/205 · 1040 sites |
| WFC002 | script fails the harness's own strip+wrap parse | 5/205, all already `failed` |
| WFC003 | stage output consumed with no declared shape | 204/205 |
| WFC004 | `agent()` promise never awaited | 3 runs |
| WFC005 | control flow by string-matching prose | 11 runs |
| WFC006 | fan-out branch produced and never read | 5 sites |

A producer carrying a valid `schema` **legalises** the edge — render the declared object into
prose however you like. The rule is fixable, not merely restrictive.

Real output, `check test/fixtures/bad.js` (exit 1), 60 columns hard:

```
[0] recon                                               — ~4
└▶⇉2 parallel
   ├▶[1] review_joining                               RAW ~∞
   ├▶[2] review_team                                  RAW ~∞
      ⇊ consolidate 2/2
      └▶[3] ship ⚠ orphan                             RAW ~∞

BLOCKED 8 · warn 5 · exempt 0
stages 4 · edges 4 · fan-outs 1 · orphans 1 · depth 3
contracts  RAW×4 · RAW edges 4
in ≈ [15 … ∞] est chars/4 · out unmeasured
blocks  WFC003×3 WFC001×4 WFC005×1
warns   WFC101×1 WFC105×4
fan-out 2 branches · consolidated 2/2
longest  ship
```

Then one line per finding, e.g.
`✗ WFC001  stage [3] ship: ${a} carries raw output of an uncontracted stage`.

The summary is a fixed 8 lines, verdict first, so a truncated read still lands and two runs
diff as lines. `∞` is a RAW edge: unbounded input, because nothing caps prose. Declare a shape
and the same edge prints `recon ~3.8k`. Output tokens are never estimated; no currency figure,
ever.

---

## The six shapes

| shape | fields | omit this and the stage lies |
|---|---|---|
| `recon` | `found[] gaps[] confidence` | `gaps` — hides what was never looked at |
| `spec` | `decisions[] nonGoals[] acceptance[]` | `decisions[].why` — unrevisitable |
| `implement` | `changed[] skipped[] risks[]` | `skipped` — silent half-builds |
| `verify` | `checks[{name,cmd,pass,evidence}] verdict` | `evidence` — required, non-empty |
| `review` | `findings[{sev,loc,claim,fix}] blocking` | `blocking` — the boolean IS the handoff |
| `synthesis` | `summary byInput[]` | `byInput` — one entry per branch |

Closed (`additionalProperties: false`, nested included). Every prose field capped with
`maxLength`; the cap **is** the token budget, replacing hand-picked `.slice(0, N)`.
`fix` is `implement` + `cause`, **not** a seventh shape.

---

## Install

Not on npm. Clone and bootstrap:

```sh
git clone https://github.com/proximata/wf-contract
cd wf-contract && ./bootstrap.sh
```

`bootstrap.sh` is POSIX sh, idempotent, provider-agnostic — the base shape is identical for
every user regardless of VM. Machine-specific facts go in `overlays/*.sh` (see
`overlays/exe-dev.sh.example`); deleting `overlays/` entirely still yields a working install.
Contributing a customization = adding one overlay file. `sh check.sh` proves both.

```sh
node bin/wf-contract.mjs check path/to/wf.js
node bin/wf-contract.mjs shapes --emit js
node bin/wf-contract.mjs corpus \
  '~/.pi/workflows/projects/*/runs/*.json'
```

Exit `0` clean or warn-only · `1` blocked · `2` usage/IO. The CLI **never prompts**: a headless
tool that can be talked out of its verdict is not a gate.

Declare a shape with the option that already exists — no new key:

```js
const SHAPES = { /* paste `shapes --emit js` verbatim */ };
const v = await agent(prompt, { schema: SHAPES.verify });
```

`SHAPES` is hashed against `shapes/index.json`, so drift is WFC003 with a key-level diff rather
than silence. Shapes are reachable only as `SHAPES.<name>` — the runtime already exports its own
`verify()` and `gate()`, and this repo never shadows either.

Confirmation lives in the pi extension, at `tool_call` — the last moment before
`background: true` detaches the run. Blocked → the full report returns as the block `reason`,
rule ids in front of the model so it can fix the script in the same turn. Headless callers pass
`--wf-contract-yes` or `WF_CONTRACT_APPROVE=1`. **See Known holes: the extension is written but
never compiled or loaded.**

---

## Eval: H1 is UNTESTED

> **H1** — contracts convert silent wrong answers into loud, located failures at a named edge,
> without costing more correctness than they buy.

```
status      UNTESTED — not held, not failed, never contested
live runs   0 of 180 designed
falsifiers  0 of 6 evaluated · 0 fired · 6 not asked
runs        50, all synthetic:true, 3 tasks of 12
trials      3 × byte-identical run sets → 2 add zero bits
```

`eval/run.mjs --live` exits 2 for want of a `$WF_EVAL_LIVE_CMD` adapter — no pi package ships a
`bin`, and wf-contract has no `run` verb. The scorer's synthetic interlock then forced all six
falsifiers to `not-evaluable`, correctly. **A falsifier that could not be evaluated has not been
passed; it has not been asked.** F-A is the live risk and is entirely open:
`SCHEMA_NONCOMPLIANCE` is non-recoverable, so arm B can hard-fail where arm A limped to a
wrong-but-complete answer.

**Do not quote** `silent_wrong 56%→0%` · `p=0.0001` · `task_pass +16pp` ·
`located_failure 0%→100%` · `addressable 0%→70%`. All five are properties of hand-written
fixture files. Citing them would make this eval the exact thing wf-contract indicts.

What *is* established is about the harness, not the claim:

```
✓ interlock unbypassable      3/3 trials
✓ arm difference mechanical   A.js exit 1 / B.js exit 0
✓ S6 caught planted evidence  by real re-execution
✓ --live invents no runs      exit 2, names the env var
```

Blockers, ordered: `D-1 🔒 no live adapter` · `D-2 report.json carries generatedAt` ·
`D-3 score.mjs ignores --runs for output` · `D-4 3/12 tasks, 25/90 pairs` ·
`D-5 pre-registration asserted, not provable` · `D-6 S6 replays in the working tree` ·
`D-7 F-D unaudited`. Effort to a real result: **high** — the adapter must drive real agent
sessions. Full account: [`eval/RESULTS.md`](eval/RESULTS.md).

Nothing here claims contracts raise completion rate, lower cost, or reduce aborts. The evidence
supports representability of failure, not success.

---

## Known holes

- **Slash / saved / builtin command starts are ungated** (D20). They call `startInBackground`
  directly and emit no `tool_call`. Run JSONs carry no origin field, so the hole's size is
  unmeasurable from traces. Fix requested upstream as a `workflow_start` event; no monkey-patch.
- **The extension is never compiled or loaded in CI.** `extension/index.ts` is written and
  unexercised in both TUI and headless. It also fails **open** if the CLI is missing or its JSON
  is unparseable — deliberate (never wedge the harness), but a broken install gates nothing.
- **F-D (gate false-positive rate) is unmeasured**: 0 of the 30 required hand-audits done. The
  gate's own corpus run reports `169 blocked · 37 clean · 206 scripts` against local traces,
  where the spec expects `166 / 44` — extra WFC003/005/006 arms the taint probe alone did not
  fire. Until those audits exist, 78.5% stands as the AST probe's number, not the gate's.
- `wf-contract corpus` is not in CI: it needs `~/.pi/workflows` traces a runner does not have.
- Not a security boundary. The vm it inspects is explicitly not one either. It refuses shapes,
  not adversaries.

## Data in this repo

- `recon.json` — aggregate per-run statistics only. Project names pseudonymised (`p01`…`p15`),
  run ids truncated. No prompts, no script text, no paths.
- `analyze.py` — the analyzer, so the numbers reproduce against your own traces.
- The raw failure dossier mined from those traces is **not published**: it quotes private
  workflow scripts and stored prompts verbatim.
