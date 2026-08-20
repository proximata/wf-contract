#!/bin/sh
# wf-contract dev environment bootstrap.
# POSIX sh. Idempotent: re-running on an unchanged tree reports zero changes.
# Provider-agnostic. VM-specific facts belong in overlays/*.sh, never here.
set -eu

REPO_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
cd "$REPO_DIR"

CHANGES=0
changed() { CHANGES=$((CHANGES + 1)); echo "changed: $*"; }
note() { echo "ok:      $*"; }
fail() { echo "error:   $*" >&2; exit 1; }

# --- 1. node >= 22 (D27). We check, we do not install a node manager. ---
command -v node >/dev/null 2>&1 || fail "node not found; install node >= 22 (nodejs.org, brew, or your distro)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || fail "node $(node -v) too old; wf-contract needs >= 22 (node:test, ESM .mjs)"
note "node $(node -v)"

command -v npm >/dev/null 2>&1 || fail "npm not found; it ships with node"

# --- 2. package.json is a tracked repo file. Assert it, never rewrite it: a
#       bootstrap that edits committed files is not idempotent, it is a merge conflict.
[ -f package.json ] || fail "package.json missing; you are not in a wf-contract checkout"
PKG_BAD=$(node -e '
  const p = require("./package.json");
  const bad = [];
  if (p.type !== "module") bad.push("type must be \"module\" (D27: ESM .mjs)");
  if (!p.dependencies || !p.dependencies.acorn) bad.push("dependencies.acorn missing (D27: the single dependency)");
  if (!p.engines || p.engines.node !== ">=22") bad.push("engines.node must be \">=22\"");
  process.stdout.write(bad.join("; "));
')
[ -z "$PKG_BAD" ] || fail "package.json: $PKG_BAD"
note "package.json declares acorn, type=module, node>=22"

# --- 3. dependencies. npm ci when a lockfile exists, else npm install. ---
if [ -d node_modules ] && [ -f node_modules/.wf-contract-stamp ] \
  && [ ! package.json -nt node_modules/.wf-contract-stamp ] \
  && { [ ! -f package-lock.json ] || [ ! package-lock.json -nt node_modules/.wf-contract-stamp ]; }; then
  note "node_modules up to date"
else
  if [ -f package-lock.json ]; then npm ci --silent; else npm install --silent; fi
  : >node_modules/.wf-contract-stamp
  changed "installed npm dependencies"
fi

# --- 4. optional overlays, sorted, additive only (D29). ---
if [ -d overlays ]; then
  for overlay in overlays/*.sh; do
    [ -f "$overlay" ] || continue
    echo "overlay: $overlay"
    # shellcheck disable=SC1090
    . "$overlay"
  done
fi

# --- 5. verdict ---
if [ "$CHANGES" -eq 0 ]; then
  echo "bootstrap: no changes"
else
  echo "bootstrap: $CHANGES change(s)"
fi
