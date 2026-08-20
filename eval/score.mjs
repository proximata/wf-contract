#!/usr/bin/env node
// eval/score.mjs — deterministic, model-free scoring of the A/B runs. No LLM judge anywhere.
// Input:  eval/out/runs/<arm>__<variant>__rep<N>.json   (written by run.mjs, either mode)
// Output: eval/out/report.json + eval/out/report.md, printed to stdout.
//
// Usage: node eval/score.mjs [--runs DIR] [--no-replay] [--json]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { validate } from '../src/validate.mjs';
import { SHAPES } from '../src/shapes.mjs';
import { loadRun, stageObject, stageText, byLabel, retries, tokens, nullFed, locatedFailure } from './lib/extract.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(DIR, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const RUNS = resolve(opt('--runs', join(DIR, 'out/runs')));
const REPLAY = !flag('--no-replay');

// Only these commands are ever re-executed for S6. A cmd outside the allowlist is not replayed
// and is scored `unreplayable` — never silently counted as a pass.
const REPLAYABLE = /^(node|npm|sh|bash|git|ls|cat|test|grep|wc)\b/;

// ---------- per-run scoring -------------------------------------------------

function scoreRun(run, task) {
  const shapesOf = Object.fromEntries(task.stages.map((s) => [s.label, s.shape]));
  const stages = task.stages.map((s) => {
    const a = byLabel(run, s.label);
    const obj = a ? stageObject(a) : null;
    const schema = SHAPES[s.shape];
    const errs = obj ? validate(schema, obj) : null;
    const missing = obj ? (schema.required ?? []).filter((k) => !(k in obj)) : (schema.required ?? []);
    return { label: s.label, shape: s.shape, ran: !!a, structured: !!obj, schemaValid: obj ? errs.length === 0 : false, errors: errs ?? ['not structured'], missingRequired: missing };
  });

  // S1 task_pass — checked-in accept.sh, exit 0/1, written before any run.
  const accept = join(DIR, 'tasks', task.id, 'accept.sh');
  const runPath = run.__path;
  const r = spawnSync('sh', [accept, runPath], { encoding: 'utf8' });
  const task_pass = r.status === 0;

  const completed = run.status === 'completed';
  const s = {
    task_pass,
    silent_wrong: completed && !task_pass, // S2 — the metric. run.status is never a success signal.
    located_failure: !task_pass && locatedFailure(run), // S3
    null_fed: nullFed(run), // S4 — mechanism check in arm B, see README
    tokens: tokens(run), // S5
    retries: retries(run),
    status: run.status,
    stages,
    schema_valid: stages.filter((x) => x.schemaValid).length / stages.length,
    fields_addressable: stages.filter((x) => x.structured).length / stages.length,
  };

  // branch_drop — fan-out only. Structurally decidable in B, a substring guess in A.
  s.branch_drop = null;
  if (task.fanout) {
    const cons = byLabel(run, task.consolidator);
    const obj = cons ? stageObject(cons) : null;
    const ids = task.fanout.branchIds;
    if (!cons) {
      // the consolidator never ran. Absence is decidable from the run itself: loud, not silent.
      s.branch_drop = { dropped: ids, detectable: true, why: 'consolidator never ran' };
    } else if (obj && Array.isArray(obj.byInput)) {
      const seen = new Set(obj.byInput.map((b) => b.id));
      s.branch_drop = { dropped: ids.filter((i) => !seen.has(i)), detectable: true };
    } else {
      const txt = cons ? stageText(cons) : '';
      s.branch_drop = { dropped: ids.filter((i) => !txt.includes(i)), detectable: false };
    }
  }

  // S6 evidence_replay — re-execute every verify.checks[].cmd, compare real exit code to `pass`.
  s.evidence_replay = null;
  const verifyStage = task.stages.find((x) => shapesOf[x.label] === 'verify');
  if (verifyStage) {
    const obj = stageObject(byLabel(run, verifyStage.label));
    const checks = Array.isArray(obj?.checks) ? obj.checks : null;
    if (!checks) {
      s.evidence_replay = { measurable: false, why: 'verify output is not structured — no cmd field to replay' };
    } else if (!REPLAY) {
      s.evidence_replay = { measurable: false, why: '--no-replay' };
    } else {
      const results = checks.map((c) => {
        if (!c.evidence || !String(c.evidence).trim()) return { cmd: c.cmd, verdict: 'empty-evidence', match: false };
        if (!REPLAYABLE.test(String(c.cmd ?? '').trim())) return { cmd: c.cmd, verdict: 'unreplayable', match: null };
        const p = spawnSync('sh', ['-c', c.cmd], { cwd: REPO, encoding: 'utf8', timeout: 20000 });
        const real = p.status === 0;
        return { cmd: c.cmd, realExit: p.status, reported: !!c.pass, verdict: real === !!c.pass ? 'match' : 'mismatch', match: real === !!c.pass };
      });
      const decided = results.filter((x) => x.match !== null);
      s.evidence_replay = {
        measurable: decided.length > 0,
        cleanCheckout: false, // ponytail: replays in the working tree, not a fresh checkout
        mismatch: decided.some((x) => !x.match),
        results,
      };
    }
  }
  return s;
}

// ---------- McNemar exact ---------------------------------------------------

function mcnemarExact(b, c) {
  const n = b + c;
  if (n === 0) return { b, c, n, p: 1 };
  const k = Math.min(b, c);
  const lc = (a) => { let s = 0; for (let i = 2; i <= a; i++) s += Math.log(i); return s; };
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(lc(n) - lc(i) - lc(n - i) - n * Math.LN2);
  return { b, c, n, p: Math.min(1, 2 * tail) };
}

// ---------- collect ---------------------------------------------------------

const tasks = Object.fromEntries(
  readdirSync(join(DIR, 'tasks')).map((d) => [d, JSON.parse(readFileSync(join(DIR, 'tasks', d, 'task.json'), 'utf8'))]),
);

if (!existsSync(RUNS)) {
  console.error(`no runs at ${RUNS} — run: node eval/run.mjs`);
  process.exit(2);
}

const rows = [];
let synthetic = false;
for (const f of readdirSync(RUNS).filter((f) => f.endsWith('.json')).sort()) {
  const m = f.match(/^([AB])__(.+)__rep(\d+)\.json$/);
  if (!m) continue;
  const [, arm, variant, rep] = m;
  const taskId = variant.replace(/--fault$/, '');
  const run = loadRun(join(RUNS, f));
  run.__path = join(RUNS, f);
  synthetic ||= run.synthetic === true;
  rows.push({ arm, variant, taskId, fault: variant.endsWith('--fault'), rep: Number(rep), ...scoreRun(run, tasks[taskId]) });
}

// ---------- aggregate + falsifiers -----------------------------------------

const A = rows.filter((r) => r.arm === 'A');
const B = rows.filter((r) => r.arm === 'B');
const rate = (rs, k) => (rs.length ? rs.filter((r) => r[k]).length / rs.length : null);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const key = (r) => `${r.variant}#${r.rep}`;
const mapB = new Map(B.map((r) => [key(r), r]));
const pairs = A.map((a) => [a, mapB.get(key(a))]).filter(([, b]) => b);

function pairedMcnemar(sel, field) {
  const p = pairs.filter(([a]) => sel(a));
  let b = 0, c = 0;
  for (const [x, y] of p) { if (x[field] && !y[field]) b++; else if (!x[field] && y[field]) c++; }
  return { ...mcnemarExact(b, c), pairs: p.length };
}

const faultPairs = (a) => a.fault;
const tokA = median(A.map((r) => r.tokens));
const tokB = median(B.map((r) => r.tokens));
const replayB = B.map((r) => r.evidence_replay).filter((e) => e?.measurable);
const replayMismatch = replayB.length ? replayB.filter((e) => e.mismatch).length / replayB.length : null;
const shapeEscapes = rows.filter((r) => r.arm === 'B' && r.stages.some((s) => s.structured && !s.schemaValid)).length;

const pp = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
const F = [];
const fire = (id, claim, fired, detail) => F.push({ id, claim, verdict: synthetic ? 'not-evaluable (synthetic fixtures)' : fired === null ? 'not-evaluable' : fired ? 'FIRED' : 'not fired', detail });

fire('F-A', 'task_pass(B) < task_pass(A) − 10pp', rate(B, 'task_pass') < rate(A, 'task_pass') - 0.1, `A ${pp(rate(A, 'task_pass'))} · B ${pp(rate(B, 'task_pass'))}`);
fire('F-B', 'median tokens(B) > 1.5 × median tokens(A)', tokB > 1.5 * tokA, `A ${tokA} · B ${tokB}`);
fire('F-C', 'evidence_replay mismatch in B > 20%', replayMismatch == null ? null : replayMismatch > 0.2, `${pp(replayMismatch)} of ${replayB.length} measurable`);
fire('F-D', 'gate false positives > 5%', null, 'measured by `wf-contract corpus`, not by this harness');
fire('F-E', '>2 of 12 tasks need a shape outside the six', shapeEscapes > 2, `${shapeEscapes} B runs had a structured stage failing its declared shape`);
const ff = pairedMcnemar(faultPairs, 'located_failure');
const locA = rate(A.filter((r) => r.fault), 'located_failure'), locB = rate(B.filter((r) => r.fault), 'located_failure');
fire('F-F', 'located_failure(B) ≤ located_failure(A) on the seeded-fault subset', locB == null ? null : locB <= locA, `A ${pp(locA)} · B ${pp(locB)} · ${ff.pairs} pairs`);

const primary = pairedMcnemar(() => true, 'silent_wrong');
const detect = pairs.length >= 90 ? '~20pp at 80% power (design)' : `wider than ~20pp — design floor assumes 90 pairs, this run has ${pairs.length}`;

const report = {
  generatedAt: new Date().toISOString(),
  synthetic,
  runs: rows.length,
  pairs: pairs.length,
  detectionFloor: detect,
  arms: {
    A: { runs: A.length, task_pass: rate(A, 'task_pass'), silent_wrong: rate(A, 'silent_wrong'), null_fed: rate(A, 'null_fed'), medianTokens: tokA, retries: A.reduce((s, r) => s + r.retries, 0), fields_addressable: A.length ? A.reduce((s, r) => s + r.fields_addressable, 0) / A.length : null },
    B: { runs: B.length, task_pass: rate(B, 'task_pass'), silent_wrong: rate(B, 'silent_wrong'), null_fed: rate(B, 'null_fed'), medianTokens: tokB, retries: B.reduce((s, r) => s + r.retries, 0), fields_addressable: B.length ? B.reduce((s, r) => s + r.fields_addressable, 0) / B.length : null },
  },
  mcnemar: { silent_wrong: primary, located_failure_seeded: ff },
  branchDrop: {
    A: A.filter((r) => r.branch_drop).map((r) => ({ variant: r.variant, rep: r.rep, dropped: r.branch_drop.dropped, detectable: r.branch_drop.detectable })),
    B: B.filter((r) => r.branch_drop).map((r) => ({ variant: r.variant, rep: r.rep, dropped: r.branch_drop.dropped, detectable: r.branch_drop.detectable })),
  },
  evidenceReplay: { B: { measurable: replayB.length, mismatchRate: replayMismatch, cleanCheckout: false } },
  falsifiers: F,
  rows,
};

const dropCount = (rs) => rs.filter((r) => r.branch_drop?.dropped.length).length;
const md = `# wf-contract A/B eval — report

${synthetic ? '> **HARNESS SELF-TEST — SYNTHETIC FIXTURES. NOT EVIDENCE.**\n> Every falsifier below reads `not-evaluable`. These fixtures exercise the scorer; they do not\n> measure any model. A real result requires `node eval/run.mjs --live`.\n' : ''}
verdict      ${synthetic ? 'self-test only' : F.some((f) => f.verdict === 'FIRED') ? 'H1 SUNK — a falsifier fired' : 'no falsifier fired'}
runs         ${rows.length} · pairs ${pairs.length}
floor        ${detect}
task_pass    A ${pp(rate(A, 'task_pass'))} · B ${pp(rate(B, 'task_pass'))}
silent_wrong A ${pp(rate(A, 'silent_wrong'))} · B ${pp(rate(B, 'silent_wrong'))}   McNemar b=${primary.b} c=${primary.c} p=${primary.p.toFixed(4)}
tokens       median A ${tokA} · B ${tokB}
addressable  A ${pp(report.arms.A.fields_addressable)} · B ${pp(report.arms.B.fields_addressable)}
branch drop  A ${dropCount(A)} run(s), detectable=false · B ${dropCount(B)} run(s), detectable=true

## Falsifiers

| id | claim | verdict | detail |
|---|---|---|---|
${F.map((f) => `| ${f.id} | ${f.claim} | ${f.verdict} | ${f.detail} |`).join('\n')}

## Notes carried with the numbers

- \`run.status\` is never a success signal. \`silent_wrong\` = completed AND ¬task_pass.
- \`null_fed\` (A ${pp(rate(A, 'null_fed'))} · B ${pp(rate(B, 'null_fed'))}) is a MECHANISM CHECK, not evidence: it is
  a wiring check only: arm B cannot feed a null downstream by construction, because
  SCHEMA_NONCOMPLIANCE is non-recoverable and the run stops at the edge instead.
  A metric that cannot go the other way is not evidence.
- \`branch_drop\` in arm A is a substring guess (\`detectable:false\`); in arm B it is decided from
  \`byInput\` ids. That asymmetry IS the representability claim, not a measurement bug.
- \`evidence_replay\` re-executes in the working tree, not a clean checkout (\`cleanCheckout:false\`).
- Where a result is null the wording is **"no detectable difference"**, never "no difference".
`;

mkdirSync(join(DIR, 'out'), { recursive: true });
writeFileSync(join(DIR, 'out/report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(DIR, 'out/report.md'), md);
// no process.exit here: it truncates a large piped stdout mid-write.
console.log(flag('--json') ? JSON.stringify(report, null, 2) : md);
