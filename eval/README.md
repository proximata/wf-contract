# wf-contract A/B eval

Two arms, same tasks, same model, same frozen text. Deterministic scoring. No LLM judge, not in
the gate and not here — an eval that scored prose with prose would be the thing it indicts.

```
A  prose     stages pass raw output into the next prompt   (the corpus pattern, 161/205 scripts)
B  contract  stages emit SHAPES.<name>; next stage reads named fields
```

The arm difference is enforced, not asserted: `run.mjs` refuses to start unless every `A.js`
exits 1 under `wf-contract check` and every `B.js` exits 0.

---

## The claim, stated narrowly enough to be wrong

> **H1.** Contracts convert silent wrong answers into loud, located failures at a named edge,
> without costing more correctness than they buy.

Not claimed: higher completion rate, lower cost, fewer aborts.

## What would falsify it

Any ONE of these firing sinks H1 as stated. `score.mjs` evaluates every one of them and prints
each as FIRED / not fired — including when firing kills the claim.

| id | fires when | why that is fatal |
|---|---|---|
| F-A | `task_pass(B) < task_pass(A) − 10pp` | contracts cost more correctness than they buy. The live risk: `SCHEMA_NONCOMPLIANCE` is non-recoverable, so B hard-fails where A limped to a wrong-but-complete answer |
| F-B | `median tokens(B) > 1.5 × median tokens(A)` | the shapes are paying for themselves in tokens |
| F-C | `evidence_replay` mismatch in B > 20% | **the sharpest one.** `{"checks":[…],"verdict":"pass"}` with fabricated `evidence` is schema-valid and worthless. If a model can fake evidence at will, the verify shape is decoration and the six-shape argument goes with it |
| F-D | gate false positives > 5% | measured by `wf-contract corpus`, not here; reported as not-evaluable by this harness |
| F-E | >2 of 12 tasks need a shape outside the six | the six are not closed. Scored as: a B run whose structured stage output fails its declared shape |
| F-F | `located_failure(B) ≤ located_failure(A)` on the seeded-fault subset | the core claim is simply false |

**And one thing that would falsify the harness rather than the claim:** if arm B's advantage
came only from `null_fed` or from `fields_addressable`, there is no result. Both are
true-by-construction in B. They are printed as mechanism checks and explicitly labelled
not-evidence. A metric that cannot go the other way proves only that the wiring is connected.

---

## Scores — every one model-free

```
S1 task_pass          tasks/<id>/accept.sh, exit 0/1, written BEFORE run 1, arm-neutral text rule
S2 silent_wrong       status=='completed' AND ¬task_pass          ← the metric
S3 located_failure    ¬task_pass AND a stage-named error surfaces
                      (SCHEMA_NONCOMPLIANCE | WFCxxx | AGENT_EMPTY_OUTPUT | failing agent with
                       nothing launched after it)
S4 null_fed           a stored prompt with a standalone null/undefined line   [mechanism check]
S5 tokens             Σ agents[].tokens
S6 evidence_replay    re-executes every verify.checks[].cmd, compares real exit code to `pass`
   schema_valid       fraction of stages whose output validates against its declared shape
   fields_addressable fraction of stages whose output can be read as named fields at all
   branch_drop        declared fan-out width vs what the consolidator accounted for
   retries            extra attempts per label
```

`run.status` is **never** a success signal. 13 of the 14 null-fed corpus runs report
`completed`, two of them with provably wrong final answers.

`branch_drop` is asymmetric on purpose: in B it is decided from `byInput` ids, in A it is a
substring guess (`detectable: false`). That asymmetry **is** the representability claim. Do not
read it as a measurement bug and do not read A's `dropped: []` as "nothing was dropped" — it
means "nothing was detectably dropped", which is a different sentence.

Analysis: paired by `(variant, rep)`, McNemar exact on discordant pairs, α=0.05. The design
(18 pairs × 5 reps = 90) detects ~20pp at 80% power. Below that the report says **"no
detectable difference"**, never "no difference", and prints its own pair count and floor.

---

## Running it

```sh
node eval/run.mjs            # offline: replay recorded fixtures. 0 tokens. CI default.
node eval/score.mjs          # → eval/out/report.md + report.json
npm run eval                 # both
node --test test/eval.test.mjs
```

Live:

```sh
WF_EVAL_LIVE_CMD='…' node eval/run.mjs --live --reps 5
```

The adapter receives `$WF_EVAL_ARM $WF_EVAL_VARIANT $WF_EVAL_REP $WF_EVAL_SCRIPT $WF_EVAL_FAULT`
and must print the path of the resulting run JSON on stdout. There is no built-in runner: neither
pi package ships a `bin`, and wf-contract has no `run` verb, ever (D01). Without the adapter,
`--live` exits 2 rather than inventing anything.

`--no-replay` skips S6's real command execution. S6 then reports `measurable: false` — it is never
silently counted as a pass.

---

## ⚠ The fixtures are SYNTHETIC, and the harness says so out loud

`eval/fixtures/**` is generated by `eval/fixtures/record.mjs`. They are hand-specified run JSONs,
not captures of live model runs. There was nothing to capture: the corpus is 205 arm-A-style runs
and **zero** arm-B ones, because no gated run has ever been executed.

Every fixture carries `"synthetic": true`, and **`score.mjs` refuses to render a single falsifier
verdict while any input carries that flag** — all six print `not-evaluable (synthetic fixtures)`
and the report header says NOT EVIDENCE. The fixtures prove the scorer is right. They prove
nothing about contracts.

Replacing them requires no code change: drop real run JSONs (without the flag) into
`eval/fixtures/<arm>/<variant>/repN.json`, or point `--live` at an adapter.

A fixture recorded against different script text is refused (`scriptSha256` mismatch, exit 2) —
the frozen scripts and their recordings cannot drift apart silently.

---

## Freezing and pre-registration

`A.js`, `B.js`, `accept.sh` and `score.mjs` are frozen before run 1. No metric is added after
data is seen. Both arms come from the same brief (`tasks/<id>/brief.md`) and differ only in the
style constraint — otherwise the eval measures prompt-writing skill and the A/B is decoration.

**Unmet, stated plainly:** the repo is not a git repository yet, so "provable from git log
ordering" is currently *asserted*, not *provable*. `git init` + a commit of `eval/` before the
first live run is what closes that.

**Also unmet:** 3 tasks are written, one per stratum, not the 12 the design calls for; 5 pairs,
not 18; 50 runs, not 180. The shipped harness is the full mechanism at one-sixth the sample. The
power floor printed in the report reflects the real pair count, not the design's.
