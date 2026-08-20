#!/bin/sh
# accept.sh <run.json> — exit 0 pass, 1 fail. Written BEFORE run 1. Arm-neutral (text rule).
# Criterion: the implement stage names the file under change AND carries the spec's key
# constraint through — the estimate is a bound, not a single number (D16).
set -eu
node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const last = j.agents.filter(a => a.label === "implement").pop();
const t = (typeof last?.result === "string" ? last.result : JSON.stringify(last?.result ?? j.result ?? "")).toLowerCase();
const need = ["tokens.mjs", "bound"];
const missing = need.filter(s => !t.includes(s));
if (missing.length) { console.error("missing: " + missing.join(",")); process.exit(1); }
' "$1"
