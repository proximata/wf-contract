# Task 02 — sequential chain

Stratum: `sequential`. Reconstructed from the corpus pure-sequential topology (69 of 205 runs).

**Brief given to the author model (identical for both arms):**

> Three stages in a chain. Recon the token-estimation subsystem. Turn that recon into a spec
> with numbered decisions and acceptance criteria. Then report what an implementer would change
> to satisfy the spec, and what they would deliberately skip.

**Arm difference — the only difference:**

- A: "pass each stage's output to the next as text."
- B: `SHAPES.recon` → `SHAPES.spec` → `SHAPES.implement`, each stage consuming named fields.

No fan-out. `branch_drop` is not scored for this task; it is the sequential control that keeps
F-A honest — if contracts cost correctness, they cost it here too, with no fan-out to hide it.
