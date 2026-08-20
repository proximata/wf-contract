#!/bin/sh
# accept.sh <run.json> — exit 0 pass, 1 fail. Written BEFORE run 1. Arm-neutral (text rule).
# Criterion: the review stage reaches a blocking decision AND the verification it reviewed
# named at least one real command. A review with no command underneath it is not a review.
set -eu
node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const txt = (a) => typeof a?.result === "string" ? a.result : JSON.stringify(a?.result ?? "");
const ver = txt(j.agents.filter(a => a.label === "verify").pop());
const rev = txt(j.agents.filter(a => a.label === "review").pop()) || String(j.result ?? "");
if (!/\b(node|npm|sh|git)\b[^\n"]{0,80}/.test(ver)) { console.error("verify named no command"); process.exit(1); }
if (!/blocking|blocker|no findings|not blocking/i.test(rev)) { console.error("review reached no blocking decision"); process.exit(1); }
' "$1"
