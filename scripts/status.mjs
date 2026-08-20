#!/usr/bin/env node
// scripts/status.mjs — emit docs/status.json, the numbers the README chips consume.
//
// Runs the same checks CI runs and records their real results plus a last-run timestamp.
// Model-free and token-free: node:test TAP counts, schemas/check.mjs's own tally, check.sh's
// bootstrap idempotency verdict, and the eval report that eval/score.mjs already wrote.
// Nothing here is hand-typed.
//
// CHIP RULE: `chips` carries exactly three things — eval run results, last-run time, install
// status. No build-passing chip, no stars, no license. tests/schemas stay in the body of this
// file as data (CI asserts on them) but are NOT chips: a chip that is not one of the three
// gets deleted.
//
// ponytail: chips are shields.io `dynamic/json` reads against this file in raw.githubusercontent,
// so there is no badge service and no endpoint schema to satisfy. Upgrade path if the chip count
// grows past ~6: a shields `endpoint` JSON per chip, generated from this same object.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => spawnSync(cmd, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });

// --- tests: node:test TAP summary lines are the count, not a guess ---
// (the file list lives in package.json's test script; test/fixtures/ are inputs, not tests)
const t = run('npm', ['test', '--silent']);
// summary line is `# pass N` (tap reporter) or `ℹ pass N` (spec, the default) — accept either
const tap = (k) => Number((t.stdout.match(new RegExp(`^(?:#|ℹ) ${k} (\\d+)$`, 'm')) ?? [, NaN])[1]);
const tests = { pass: tap('pass'), fail: tap('fail'), exit: t.status };

// --- schemas: check.mjs prints "N/M ok" ---
const s = run('node', ['schemas/check.mjs']);
const m = s.stdout.match(/(\d+)\/(\d+) ok/);
const schemas = { pass: m ? Number(m[1]) : 0, total: m ? Number(m[2]) : 0, exit: s.status };

// --- install: the documented install path, actually exercised ---
// check.sh = shellcheck + bootstrap.sh run twice, asserting the second run changes nothing.
// That verdict IS the install status; anything weaker would be a decorative chip.
const c = run('sh', ['check.sh']);
const install = {
  exit: c.status,
  idempotent: /PASS second run reported zero changes/.test(c.stdout),
  shellcheck: /PASS shellcheck/.test(c.stdout) ? 'pass' : /SKIP shellcheck/.test(c.stdout) ? 'skipped' : 'fail',
};

// --- eval: read what score.mjs already wrote; never re-derive ---
const rp = join(REPO, 'eval/out/report.json');
const r = existsSync(rp) ? JSON.parse(readFileSync(rp, 'utf8')) : null;
const evaluation = r && {
  runs: r.runs,
  pairs: r.pairs,
  synthetic: r.synthetic, // true => fixture self-test, NOT evidence about any model
  silent_wrong: { A: r.arms.A.silent_wrong, B: r.arms.B.silent_wrong },
  falsifiersEvaluated: r.falsifiers.filter((f) => !f.verdict.startsWith('not-evaluable')).length,
};

const status = {
  generatedAt: new Date().toISOString(),
  commit: (process.env.GITHUB_SHA ?? run('git', ['rev-parse', 'HEAD']).stdout.trim()).slice(0, 7),
  tests,
  schemas,
  install,
  eval: evaluation,
  // chip label/message pairs, so a chip URL only needs one $.chips.<id>.* query
  chips: {
    // 1. eval run results — synthetic fixtures are yellow and say so, plus the damning number:
    //    how many of the six falsifiers were actually evaluated.
    eval: evaluation
      ? {
          label: 'eval',
          message: evaluation.synthetic
            ? `${evaluation.runs} fixture runs · ${evaluation.falsifiersEvaluated}/6 falsifiers`
            : `${evaluation.runs} live runs · ${evaluation.falsifiersEvaluated}/6 falsifiers`,
          color: evaluation.synthetic ? 'yellow' : 'green',
        }
      : { label: 'eval', message: 'not run', color: 'lightgrey' },
    // 2. install status — bootstrap.sh run twice, second run must change nothing.
    install: {
      label: 'install',
      message: install.exit === 0 && install.idempotent ? 'bootstrap.sh · idempotent' : 'broken',
      color: install.exit === 0 && install.idempotent ? 'green' : 'red',
    },
    // 3. last-run time is $.generatedAt above; the chip reads that field directly.
  },
};

const ok = tests.exit === 0 && tests.fail === 0 && schemas.exit === 0 && install.exit === 0 && !!evaluation;
mkdirSync(join(REPO, 'docs'), { recursive: true });
writeFileSync(join(REPO, 'docs/status.json'), JSON.stringify(status, null, 2) + '\n');
console.log(JSON.stringify(status, null, 2));
if (!ok) { console.error('status: a check failed or the eval report is missing'); process.exit(1); }
