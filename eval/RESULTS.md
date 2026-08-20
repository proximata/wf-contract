# wf-contract A/B eval — consolidated results (trials 1–3)

> **VERDICT: H1 UNTESTED. Not held, not partially held, not failed — never contested.**
> Zero live agent runs across all three trials. All 150 run records are synthetic fixtures.
> Arm B did not win and did not lose. No number below is evidence about contracts.

```
H1  contracts convert silent wrong answers into loud, located failures at a named edge,
    without costing more correctness than they buy
    → status: UNTESTED   evaluated falsifiers: 0 of 6   live runs: 0 of 180 designed
```

---

## 1. Verdict, stated plainly

Three trials ran. Three trials completed green. None measured a model.

`eval/run.mjs --live` exits 2 in all three trials for want of a `$WF_EVAL_LIVE_CMD` adapter
(D01: no pi package ships a `bin`, wf-contract has no `run` verb). Offline mode replays
hand-written fixtures. `score.mjs`'s synthetic interlock therefore forced all six falsifiers to
`not-evaluable` — correctly, and in every trial.

**0 of 6 falsifiers fired. That is not survival.** A falsifier that could not be evaluated has
not been passed; it has not been asked. F-A (the live risk: B hard-fails where A limped to a
wrong-but-complete answer) remains entirely open.

What is genuinely established is narrower and is about the harness, not the claim:

| # | established | evidence |
|---|---|---|
| H-1 | synthetic interlock cannot be bypassed | 3/3 trials: all 6 falsifiers `not-evaluable`, header prints NOT EVIDENCE |
| H-2 | arm difference is mechanical, not asserted | `run.mjs` refuses to start unless every `A.js` exits 1 and every `B.js` exits 0 under `wf-contract check`; asserted in `test/eval.test.mjs` (4/4) |
| H-3 | S6 detects fabricated evidence by real re-execution | 1 of 5 measurable B replays mismatched (planted fixture); exit code compared, not self-reported |
| H-4 | live mode refuses to invent runs | exit 2, named env var, 3/3 trials |

Harness validity ≠ claim validity. The eval is built and unexecuted.

---

## 2. Every trial accounted for

Three trials were commissioned as independent replications. They are not independent.

```
trial-1 runs sha256(concat, sorted)  7d7dcd251d0cb7bc
trial-2 runs sha256(concat, sorted)  7d7dcd251d0cb7bc   ← identical
trial-3 runs sha256(concat, sorted)  7d7dcd251d0cb7bc   ← identical
report.json sha (generatedAt stripped) 0ccb79425f152769 in all three
```

Byte-identical inputs → byte-identical outputs. Trials 2 and 3 carry **zero independent bits**
about H1 beyond trial 1. Their value is different and real: they are a 3× determinism check on
the scorer, and they caught defects trial 1 did not.

| trial | kept | dropped | reason |
|---|---|---|---|
| 1 | harness evidence | H1 evidence | 50/50 runs `synthetic:true`; `--live` exit 2. Found D-1 (no adapter), D-2 (`generatedAt` breaks JSON diffability) |
| 2 | harness evidence + determinism replicate | H1 evidence; **independent replication** | run set byte-identical to trial 1. Confirms D-2 independently |
| 3 | harness evidence + determinism replicate | H1 evidence; **independent replication** | run set byte-identical to trial 1. Found D-3 (`score.mjs` ignores `--runs` for output path) |

Nothing was omitted. A trial that could not test the claim is data: it is the finding.

**Contradiction between trials, resolved.** Trial 1 scored `rescore determinism` as FAIL, trial 3
as PASS. Both observations are correct and measure different artefacts:

```
report.md    no timestamp        → byte-deterministic   (trial 3 checked this)  ✓
report.json  carries generatedAt → not byte-reproducible (trials 1,2 checked this) ✗
```
∴ the human render is diffable trial-to-trial; the machine render is not. Recorded as D-2.

---

## 3. Numbers — all fixture properties, none quotable as results

Reported for completeness and for regression-diffing the scorer. **Do not cite as support for
H1.** These values are hand-authored into `eval/fixtures/**` by `record.mjs`; arm B's especially.
Identical in all three trials.

```
runs          50            (design 180)   27.8% of designed volume
pairs         25            (design  90)   27.8%  → detection floor wider than ~20pp
tasks          3 of 12      (1 per stratum, not 4)
reps           5 per variant — variation is scripted, not observed nondeterminism

task_pass     A 44%   · B 60%
silent_wrong  A 56%   · B  0%     McNemar b=14 c=0 p=0.0001
tokens (med)  A 13900 · B 13300
addressable   A  0%   · B 70%                      [true-by-construction in B]
null_fed      A 40%   · B  0%                      [MECHANISM CHECK — not evidence, D24]
located_fail  A  0%   · B 100% on 10 seeded-fault pairs (b=0 c=10 p=0.0020)
evidence_replay(B)  5 measurable · 1 mismatch (20%) · cleanCheckout:false
branch_drop   A 7 runs detectable=false · B 5 runs detectable=true
```

`p=0.0001` here is the p-value of a fixture file against itself. It is arithmetic on
hand-written JSON, not a measurement.

---

## 4. Falsification test outcome (D25)

| id | claim | outcome | detail |
|---|---|---|---|
| F-A | task_pass(B) < task_pass(A) − 10pp | **not-evaluable** | synthetic; A 44% · B 60%. The live risk, untested |
| F-B | median tokens(B) > 1.5 × A | **not-evaluable** | synthetic; A 13900 · B 13300 |
| F-C | evidence_replay mismatch in B > 20% | **not-evaluable** | synthetic; 20% of 5 measurable — at the threshold, on planted data |
| F-D | gate false positives > 5% | **not-evaluable** | out of this harness's scope: measured by `wf-contract corpus`. **Also unmeasured there** — 0 of the 30 required hand-audits done |
| F-E | >2 of 12 tasks need a shape outside the six | **not-evaluable** | synthetic; 0 B runs failed their declared shape. Only 3 tasks exist |
| F-F | located_failure(B) ≤ A on seeded faults | **not-evaluable** | synthetic; A 0% · B 100% |

Fired: 0. Passed: 0. Not asked: 6.

Per the design's own wording rule, the correct sentence is **"no detectable difference"** — and
here even that overstates it: with zero live runs there was nothing to detect a difference in.

---

## 5. Open defects and blockers, ordered

```
D-1 🔒 no $WF_EVAL_LIVE_CMD adapter          → the single blocker. Nothing else matters first
D-2 ⚠  report.json carries generatedAt        → machine artefact not byte-diffable across trials
D-3 ⚠  score.mjs hardcodes eval/out/ output   → --runs selects input only; trial dirs are copies
D-4 ⚠  3 of 12 tasks, 25 of 90 pairs          → underpowered by design floor even once live
D-5 ⚠  not a git repository                   → D21 pre-registration is asserted, not provable
D-6 ⚠  S6 replays in working tree             → cleanCheckout:false, D26 requires clean checkout
D-7 ⚠  gate corpus 168 blocked / 37 clean     → spec expects 166 / 44; F-D unaudited (0 of 30)
```

Closing D-1 and D-5 is what converts this document from a harness report into a result.
Order: `git init` + commit `eval/` → write adapter → 9 more tasks → run 1.

Effort to a real result: **high** — the adapter must drive real agent sessions, and 12 tasks × 18
pairs × 5 reps × 2 arms is 180 live runs, none of which exist today.

---

## 6. What must never be quoted from this document

`silent_wrong 56% → 0%` · `p=0.0001` · `addressable 0% → 70%` · `task_pass +16pp` ·
`located_failure 0% → 100%`.

All five are properties of files a human wrote. Quoting them as evidence for contracts would make
this eval the exact thing wf-contract indicts: a confident conclusion passed downstream with no
contract behind it.
