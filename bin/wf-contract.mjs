#!/usr/bin/env node
// wf-contract — preflight check for pi-dynamic-workflows. Never prompts (D02), never runs (D01).
import { readFileSync, existsSync } from 'node:fs';
import { globSync } from 'node:fs';
import { checkScript } from '../src/rules.mjs';
import { human, json } from '../src/report.mjs';
import { SHAPES, emitJs, HASHES } from '../src/shapes.mjs';

const USAGE = `wf-contract check  <path|->   [--json] [--dag] [--warn-only] [--allow f]
wf-contract shapes [--emit js|json]
wf-contract corpus <glob>
exit 0 clean/warn · 1 blocked · 2 usage/IO`;

const argv = process.argv.slice(2);
const verb = argv[0];
const flag = (n) => argv.includes(n);
const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

function die(msg) { process.stderr.write(msg + '\n'); process.exit(2); }

function readInput(p) {
  if (p === '-') return readFileSync(0, 'utf8');
  if (!p || !existsSync(p)) die(`no such file: ${p}`);
  return readFileSync(p, 'utf8');
}

function loadAllow() {
  const p = opt('--allow', '.wf-contract.json');
  if (!existsSync(p)) return [];
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return (j.allow ?? []).filter((a) => a && a.rule && a.sha256 && a.why);
  } catch { die(`unreadable allowlist: ${p}`); }
}

function runCheck(src, name) {
  let res;
  try { res = checkScript(src, { allow: loadAllow() }); }
  catch (e) { die(`parse error in ${name}: ${e.message}`); }
  return res;
}

if (verb === 'check') {
  const path = argv[1];
  if (!path) die(USAGE);
  const src = readInput(path);
  const res = runCheck(src, path);
  const blocked = res.findings.some((f) => f.sev === 'block');
  if (flag('--json')) process.stdout.write(JSON.stringify(json(res, path), null, 2) + '\n');
  else if (flag('--dag') && res.model) process.stdout.write(json(res, path).dag.join('\n') + '\n');
  else process.stdout.write(human(res, path) + '\n');
  process.exit(blocked && !flag('--warn-only') ? 1 : 0);
} else if (verb === 'shapes') {
  const m = opt('--emit', 'json');
  if (m === 'js') process.stdout.write(emitJs());
  else if (m === 'json') process.stdout.write(JSON.stringify({ shapes: SHAPES, hashes: HASHES }, null, 2) + '\n');
  else die('--emit js|json');
  process.exit(0);
} else if (verb === 'corpus') {
  const g = argv[1];
  if (!g) die(USAGE);
  const files = globSync(g.replace(/^~/, process.env.HOME));
  let blocked = 0, clean = 0;
  for (const f of files) {
    let src = readFileSync(f, 'utf8');
    if (f.endsWith('.json')) {
      try { src = JSON.parse(src).script ?? ''; } catch { continue; }
    }
    if (!src.trim()) continue;
    let res;
    try { res = checkScript(src, { allow: [] }); } catch { continue; }
    const b = res.findings.filter((x) => x.sev === 'block');
    if (b.length) { blocked++; process.stdout.write(`BLOCK ${f}  ${[...new Set(b.map((x) => x.id))].join(' ')}\n`); }
    else { clean++; process.stdout.write(`ok    ${f}\n`); }
  }
  process.stdout.write(`\n${blocked} blocked · ${clean} clean · ${blocked + clean} scripts\n`);
  process.exit(blocked ? 1 : 0);
} else {
  die(USAGE);
}
