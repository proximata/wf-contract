#!/bin/sh
# accept.sh <run.json> — exit 0 pass, 1 fail. Written BEFORE run 1. Arm-neutral: it reads the
# final output as TEXT, so a prose answer and a JSON answer are judged by the same rule.
# Criterion: the consolidated answer accounts for all three branches by name.
set -eu
node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const last = j.agents.filter(a => a.label === "synthesis").pop();
const t = typeof last?.result === "string" ? last.result : JSON.stringify(last?.result ?? j.result ?? "");
const missing = ["taint", "wrap", "tokens"].filter(id => !t.includes(id));
if (missing.length) { console.error("missing branch: " + missing.join(",")); process.exit(1); }
' "$1"
