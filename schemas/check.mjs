#!/usr/bin/env node
// Runnable check for the six stage shapes. No framework, no deps.
// The validator itself lives in ../src/validate.mjs — one copy, shared with eval/score.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validate } from '../src/validate.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const NAMES = ['recon', 'spec', 'implement', 'verify', 'review', 'synthesis'];

// good = minimal honest instance · bad = one deliberate violation, named
const CASES = {
  recon: {
    good: { found: [{ id: 'F1', claim: '161/205 scripts interpolate raw output', evidence: 'taint.mjs over corpus' }], gaps: ['slash-command starts unmeasured'], confidence: 'med' },
    bad: { found: [{ id: 'F1', claim: 'x', evidence: 'y' }], confidence: 'certain' }, // gaps missing + confidence off-enum
  },
  spec: {
    good: { decisions: [{ id: 'D01', choice: 'three verbs', why: 'no headless runner to wrap' }], nonGoals: ['not a runner'], acceptance: ['corpus blocks 161'] },
    bad: { decisions: [], nonGoals: [], acceptance: [] }, // decisions minItems 1
  },
  implement: {
    good: { changed: [{ path: 'schemas/verify.json', why: 'evidence made mandatory' }], skipped: [], risks: ['caps may truncate long evidence'], cause: 'WFC003 fired' },
    bad: { changed: [{ path: 'a.json', why: 'b', lines: 12 }], skipped: [], risks: [] }, // additionalProperties
  },
  verify: {
    good: { checks: [{ name: 'schemas parse', cmd: 'node schemas/check.mjs', pass: true, evidence: 'exit 0, 12/12 cases' }], verdict: 'pass' },
    bad: { checks: [], verdict: 'pass' }, // vacuous pass: minItems 1
  },
  review: {
    good: { findings: [{ sev: 'major', loc: 'schemas/verify.json', claim: 'evidence could be empty', fix: 'minLength 1' }], blocking: true },
    bad: { findings: [{ sev: 'critical', loc: 'x', claim: 'y', fix: 'z' }], blocking: 'yes' }, // sev off-enum, blocking not boolean
  },
  synthesis: {
    good: { summary: 'three of four branches kept', byInput: [{ id: 'b1', kept: true, dropped: false, why: 'only branch with evidence' }] },
    bad: { summary: 'looks good', byInput: [] }, // fan-out branches unaccounted for
  },
};

let fail = 0;
for (const name of NAMES) {
  const schema = JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8'));
  const g = validate(schema, CASES[name].good);
  const b = validate(schema, CASES[name].bad);
  const gOk = g.length === 0, bOk = b.length > 0;
  if (!gOk) fail++;
  if (!bOk) fail++;
  console.log(`${gOk ? '✓' : '✗'} ${name} good accepted${gOk ? '' : ' — ' + g.join('; ')}`);
  console.log(`${bOk ? '✓' : '✗'} ${name} bad  rejected${bOk ? ' — ' + b.join('; ') : ' — NOTHING FIRED'}`);
}
console.log(fail === 0 ? `\n12/12 ok` : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
