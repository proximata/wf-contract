#!/usr/bin/env node
// eval/run.mjs — materialise the runs score.mjs reads. Two modes, one output shape.
//
//   node eval/run.mjs                 offline: replay recorded fixtures (CI default, 0 tokens)
//   node eval/run.mjs --live          live: delegate each run to $WF_EVAL_LIVE_CMD
//
// Offline is the default on purpose: CI must be able to prove the harness works without
// burning tokens. There is no headless workflow runner to wrap (D01: neither pi package ships
// a bin), so `--live` shells out to an adapter the caller supplies rather than pretending.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(DIR, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const LIVE = flag('--live');
const OUT = resolve(opt('--out', join(DIR, 'out/runs')));
const sha = (s) => createHash('sha256').update(s).digest('hex');

const tasks = readdirSync(join(DIR, 'tasks'))
  .filter((d) => existsSync(join(DIR, 'tasks', d, 'task.json')))
  .map((d) => JSON.parse(readFileSync(join(DIR, 'tasks', d, 'task.json'), 'utf8')));

const variants = tasks.flatMap((t) => [{ t, id: t.id, fault: false }, ...(t.seededFault ? [{ t, id: `${t.id}--fault`, fault: true }] : [])]);

// Pre-run invariant: the arms must actually differ in the way the eval claims they differ.
// A must be refused by wf-contract, B must pass. Checked before any run, every run.
for (const t of tasks) {
  for (const [arm, want] of [['A', 1], ['B', 0]]) {
    const p = join(DIR, 'tasks', t.id, `${arm}.js`);
    const r = spawnSync('node', [join(REPO, 'bin/wf-contract.mjs'), 'check', p, '--json'], { encoding: 'utf8' });
    if (r.status !== want) {
      console.error(`arm invariant broken: ${t.id}/${arm}.js exit=${r.status}, expected ${want}`);
      process.exit(2);
    }
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let n = 0;
for (const v of variants) {
  for (const arm of ['A', 'B']) {
    const scriptPath = join(DIR, 'tasks', v.t.id, `${arm}.js`);
    const scriptSha = sha(readFileSync(scriptPath, 'utf8'));
    const fixDir = join(DIR, 'fixtures', arm, v.id);
    const reps = LIVE
      ? Array.from({ length: Number(opt('--reps', 5)) }, (_, i) => i + 1)
      : (existsSync(fixDir) ? readdirSync(fixDir).filter((f) => /^rep\d+\.json$/.test(f)).map((f) => Number(f.match(/\d+/)[0])).sort((a, b) => a - b) : []);
    if (!reps.length) { console.error(`no reps for ${arm}/${v.id} — nothing recorded and not --live`); process.exit(2); }

    for (const rep of reps) {
      let run;
      if (LIVE) {
        const cmd = process.env.WF_EVAL_LIVE_CMD;
        if (!cmd) {
          console.error('--live needs $WF_EVAL_LIVE_CMD: a command that runs $WF_EVAL_SCRIPT and prints the path of the resulting run JSON on stdout.');
          process.exit(2);
        }
        const env = { ...process.env, WF_EVAL_ARM: arm, WF_EVAL_VARIANT: v.id, WF_EVAL_REP: String(rep), WF_EVAL_SCRIPT: scriptPath, WF_EVAL_FAULT: v.fault ? v.t.faultStage : '' };
        const r = spawnSync('sh', ['-c', cmd], { encoding: 'utf8', env });
        const p = (r.stdout || '').trim().split('\n').pop();
        if (r.status !== 0 || !p || !existsSync(p)) { console.error(`live adapter failed for ${arm}/${v.id} rep${rep}: ${r.stderr || 'no run JSON path on stdout'}`); process.exit(2); }
        run = JSON.parse(readFileSync(p, 'utf8'));
      } else {
        run = JSON.parse(readFileSync(join(fixDir, `rep${rep}.json`), 'utf8'));
        // A fixture recorded against a different script text is not a replay of this eval.
        if (run.scriptSha256 && run.scriptSha256 !== scriptSha) {
          console.error(`stale fixture ${arm}/${v.id}/rep${rep}: recorded against a different ${arm}.js. Re-record or restore the frozen script.`);
          process.exit(2);
        }
      }
      writeFileSync(join(OUT, `${arm}__${v.id}__rep${rep}.json`), JSON.stringify(run, null, 2));
      n++;
    }
  }
}

console.log(`${LIVE ? 'live' : 'fixtures'}: ${n} runs → ${OUT}`);
console.log(`next: node eval/score.mjs`);
