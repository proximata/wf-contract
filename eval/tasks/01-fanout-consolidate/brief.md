# Task 01 — fan-out + consolidate

Stratum: `fanout`. Reconstructed from the corpus fan-out topology (133 of 205 runs).

**Brief given to the author model (identical for both arms):**

> Survey three wf-contract subsystems in parallel — `taint`, `wrap`, `tokens`. One agent per
> subsystem. Then consolidate the three surveys into one answer that accounts for every
> branch: what each survey found, and for anything dropped, why it was dropped.

**Arm difference — the only difference:**

- A: "pass each survey's output to the consolidator as text."
- B: "each survey emits `SHAPES.recon`; the consolidator emits `SHAPES.synthesis` with one
  `byInput` entry per survey."

Fan-out width is 3, declared in `task.json` before run 1. That declared width is what
`branch_drop` is scored against.
