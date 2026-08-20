# Contributing

## Dev environment

```sh
sh bootstrap.sh   # idempotent, safe to re-run
sh check.sh       # shellcheck (if installed) + idempotency assertion
```

`bootstrap.sh` is POSIX `sh`, works on a fresh Linux VM and on macOS, and installs only
what the gate needs: node >= 22 (checked, not installed) and `acorn` (D27, the single
dependency). It prints one line per action — `changed:` for anything it altered,
`ok:` for anything already in place — and ends with `bootstrap: no changes` or
`bootstrap: N change(s)`.

**No nix, no chezmoi, no dotfile manager**: the project has exactly one dependency and one
version constraint, so a 60-line POSIX script that every contributor can read start to
finish is cheaper to trust than a tool they must first install in order to install anything.

## Adding an overlay

VM- or machine-specific setup does not go in `bootstrap.sh`. It goes in one file:

1. `cp overlays/exe-dev.sh.example overlays/my-thing.sh`
2. Edit it. Guard on something (an env var, a `command -v`) so it no-ops elsewhere.
3. `sh check.sh` — the idempotency assertion covers your overlay too, because
   `bootstrap.sh` sources it.

`bootstrap.sh` sources `overlays/*.sh` in sorted order if the directory exists. Files
ending `.example` are never sourced. Overlays are optional in the strongest sense:
**deleting `overlays/` entirely must still yield a working base install.**

### The rule: overlays may only ADD

An overlay may create files, install extra tooling, export env vars for its own use.
An overlay may **not**:

- edit or delete anything `bootstrap.sh` wrote (`package.json`, `node_modules`)
- unset or redefine `bootstrap.sh`'s variables or functions (`CHANGES`, `changed`, `note`, `fail`)
- change the working directory without returning to it
- be required by anything in the repo

Why: the base shape must be byte-identical for every contributor regardless of VM
provider (D29). The moment provider specifics can reach the path everyone runs, "works on
my box" becomes unfalsifiable.

Overlays are sourced, not executed, so they inherit `set -eu` and the reporting helpers.
Use `changed "..."` and `note "..."` so your overlay participates in the change count —
an overlay that prints nothing will silently break the idempotency check.

Overlays are gitignored by default apart from the `.example`; commit yours only if it is
useful to more than you.
