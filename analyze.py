#!/usr/bin/env python3
"""Static recon over ~/.pi/workflows/projects/*/runs/*.json scripts.
Answers: do phases pass raw text or structured contracts? how terse are prompts?"""
import json, re, glob, os, statistics as st
from collections import Counter

rows=[]
for f in glob.glob(os.path.expanduser("~/.pi/workflows/projects/*/runs/*.json")):
    try: d=json.load(open(f))
    except Exception: continue
    s=d.get("script") or ""
    if not s: continue
    proj=f.split("/projects/")[1].split("/")[0]
    agents=d.get("agents") or []
    prompts=re.findall(r"agent\(\s*`(.*?)`", s, re.S)
    rows.append(dict(
        proj=proj, run=d.get("runId"), status=d.get("status"),
        script_len=len(s),
        n_agent_calls=len(re.findall(r"\bagent\(", s)),
        n_agents_ran=len(agents),
        parallel="parallel(" in s, pipeline="pipeline(" in s,
        # structured-contract signals
        json_schema=bool(re.search(r"JSON schema|jsonSchema|\"?schema\"?\s*:", s, re.I)),
        says_json=bool(re.search(r"\bJSON\b", s)),
        json_parse="JSON.parse" in s,
        json_stringify="JSON.stringify" in s,
        fenced_json=bool(re.search(r"```json", s)),
        # raw-passthrough signal: prior result interpolated straight into next prompt
        raw_interp=len(re.findall(r"\$\{[A-Za-z_$][\w$.]*(?:\[\d+\])?\}", s)),
        verify="verify(" in s, judge="judgePanel(" in s, gate="gate(" in s,
        prompt_lens=[len(p) for p in prompts],
        tok=sum((a.get("usage") or {}).get("totalTokens",0) or 0 for a in agents),
    ))

n=len(rows)
def pct(k): return f"{100*sum(1 for r in rows if r[k])/n:5.1f}%"
print(f"runs analysed: {n}  projects: {len(set(r['proj'] for r in rows))}")
print(f"agent calls total: {sum(r['n_agent_calls'] for r in rows)}  agents actually run: {sum(r['n_agents_ran'] for r in rows)}")
print("\n-- inter-stage contract signals (share of runs) --")
for k in ["json_parse","json_stringify","fenced_json","json_schema","says_json","parallel","pipeline","verify","judge","gate"]:
    print(f"  {k:14s} {pct(k)}")
raws=[r["raw_interp"] for r in rows]
print(f"\n-- raw ${{}} interpolations per script: median {st.median(raws)}  mean {st.mean(raws):.1f}  max {max(raws)}")
print(f"   scripts with >0 raw interp: {pct('raw_interp')}")
print(f"   scripts w/ raw interp AND no JSON.parse: {100*sum(1 for r in rows if r['raw_interp'] and not r['json_parse'])/n:.1f}%")
pl=[l for r in rows for l in r["prompt_lens"]]
if pl:
    pl.sort()
    q=lambda p: pl[int(p*(len(pl)-1))]
    print(f"\n-- inline agent prompt length (chars): n={len(pl)} p50={q(.5)} p90={q(.9)} p99={q(.99)} max={pl[-1]}")
    print(f"   prompts >2000 chars: {100*sum(1 for l in pl if l>2000)/len(pl):.1f}%   >4000: {100*sum(1 for l in pl if l>4000)/len(pl):.1f}%")
toks=[r["tok"] for r in rows if r["tok"]]
if toks: print(f"\n-- tokens/run: n={len(toks)} median={int(st.median(toks)):,} mean={int(st.mean(toks)):,} max={max(toks):,} sum={sum(toks):,}")
print("\n-- status --", dict(Counter(r["status"] for r in rows)))
json.dump(rows, open("recon.json","w"), indent=1)
