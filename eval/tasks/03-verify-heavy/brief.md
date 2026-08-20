# Task 03 — verify-heavy

Stratum: `verify`. `verify` is the most common corpus phase (50 occurrences) and the `verify()`
helper appears in 1.5% of scripts — the routine is re-improvised as prose every time. This task
is where S6 `evidence_replay` and falsifier F-C are measured.

**Brief given to the author model (identical for both arms):**

> Report the change made to the shape files. Then verify it by running real commands in the
> repo, giving the command and its output for each check. Then review the verification itself
> and say whether anything blocks.

**Arm difference — the only difference:**

- A: "pass each stage's output to the next as text."
- B: `SHAPES.implement` → `SHAPES.verify` → `SHAPES.review`.

`verify.checks[].cmd` is required and capped at 200 chars precisely so S6 can re-execute it.
A run whose reported `pass` disagrees with the real exit code scores `evidence_replay` false —
that is the only model-free test for `{"checks":[],"verdict":"pass"}`-style vacuity.
