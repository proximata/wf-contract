#!/bin/sh
# The one runnable check for the dev environment.
#   1. shellcheck every shell file, if shellcheck is installed (skipped loudly if not).
#   2. idempotency assertion: bootstrap.sh run twice; the SECOND run must report
#      "bootstrap: no changes". This is the property that makes re-running safe.
set -eu

REPO_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
cd "$REPO_DIR"
RC=0

echo "== shellcheck =="
if command -v shellcheck >/dev/null 2>&1; then
  # .example files are sh too; lint them so a copied overlay starts clean.
  # shellcheck disable=SC2046
  if shellcheck -s sh bootstrap.sh check.sh $(ls overlays/*.sh overlays/*.sh.example 2>/dev/null); then
    echo "PASS shellcheck"
  else
    echo "FAIL shellcheck"; RC=1
  fi
else
  echo "SKIP shellcheck not installed (brew install shellcheck / apt install shellcheck)"
fi

echo
echo "== bootstrap idempotency =="
echo "-- run 1 --"
sh bootstrap.sh
echo "-- run 2 --"
OUT=$(sh bootstrap.sh)
echo "$OUT"
if [ "$(printf '%s\n' "$OUT" | tail -n 1)" = "bootstrap: no changes" ]; then
  echo "PASS second run reported zero changes"
else
  echo "FAIL second run reported changes; bootstrap.sh is not idempotent"; RC=1
fi

echo
[ "$RC" -eq 0 ] && echo "check: PASS" || echo "check: FAIL"
exit "$RC"
