# The six stage shapes

One JSON Schema per shape, draft-2020-12 subset (`type` `properties` `required` `items`
`enum` `minItems` `minLength` `maxLength` `additionalProperties:false`).
`maxLength` **is** the size budget — it replaces `.slice(0, N)`.

| shape | use it when the stage… | the field people omit, and must not |
|---|---|---|
| `recon` | gathers facts before anything is decided | `gaps` — an empty-but-present list is a claim of coverage; omitting it hides what was never looked at |
| `spec` | decides. `decisions` ≥1, else the stage did nothing | `decisions[].why` — a choice without a reason cannot be revisited or overturned downstream |
| `implement` | changes files. `fix` is this shape + `cause` | `skipped` — silent skips are how a run reports done while half the brief is unbuilt |
| `verify` | checks something is true. `checks` ≥1 | `checks[].evidence` — required, non-empty. A verdict without evidence is a vacuous pass |
| `review` | judges someone else's output | `blocking` — the boolean IS the handoff; prose "some concerns" is not routable |
| `synthesis` | consolidates a fan-out | `byInput` — one entry per branch. Missing entries are branches silently dropped |

Notes:

- `fix` is **not** a seventh shape. It is `implement` with `cause` populated (D05).
- `synthesis.byInput.length` must equal the fan-out width. Checked post-run, not by the gate.
- `verify.checks[].cmd` is required and capped so score S6 can re-execute it (D26).
- `additionalProperties:false` on every object, nested included. A shape that accepts extras
  is not a contract.

Check: `node schemas/check.mjs`.
