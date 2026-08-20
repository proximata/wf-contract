// One runnable check for the eval harness. node:test, no framework, no tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const node = (args, env) => spawnSync('node', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, ...env } });
const OUT = mkdtempSync(join(tmpdir(), 'wfc-eval-'));
process.on('exit', () => rmSync(OUT, { recursive: true, force: true }));

test('arm invariant: every A.js is refused, every B.js passes', () => {
  for (const t of ['01-fanout-consolidate', '02-sequential-chain', '03-verify-heavy']) {
    assert.equal(node(['bin/wf-contract.mjs', 'check', `eval/tasks/${t}/A.js`]).status, 1, `${t}/A.js should be blocked`);
    assert.equal(node(['bin/wf-contract.mjs', 'check', `eval/tasks/${t}/B.js`]).status, 0, `${t}/B.js should be clean`);
  }
});

test('fixtures replay offline and score deterministically', () => {
  const r = node(['eval/run.mjs', '--out', OUT]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /fixtures: 50 runs/);

  const s = node(['eval/score.mjs', '--runs', OUT]);
  assert.equal(s.status, 0, s.stderr);
  const rep = JSON.parse(readFileSync(join(REPO, 'eval/out/report.json'), 'utf8'));

  assert.equal(rep.synthetic, true);
  assert.equal(rep.pairs, 25);

  // the metric: A completes-but-wrong, B refuses at the edge instead
  assert.ok(rep.arms.A.silent_wrong > 0, 'arm A should show silent wrong answers');
  assert.equal(rep.arms.B.silent_wrong, 0, 'arm B should never complete a wrong answer in these fixtures');

  // representability, not success: A has no addressable fields at all
  assert.equal(rep.arms.A.fields_addressable, 0);
  assert.ok(rep.arms.B.fields_addressable > 0);

  // a dropped fan-out branch is decidable in B and a substring guess in A
  assert.ok(rep.branchDrop.A.some((x) => x.dropped.length && x.detectable === false));
  assert.ok(rep.branchDrop.B.every((x) => x.detectable === true));

  // S6 really re-executes: the fabricated check (cmd exits 1, reported pass) is caught
  const fabricated = rep.rows.find((x) => x.arm === 'B' && x.evidence_replay?.results?.some((c) => c.verdict === 'mismatch'));
  assert.ok(fabricated, 'evidence_replay must catch a schema-valid check whose cmd really fails');

  // synthetic input must never produce a falsifier verdict
  assert.ok(rep.falsifiers.every((f) => f.verdict.startsWith('not-evaluable')));

  // determinism: same input, same numbers
  node(['eval/score.mjs', '--runs', OUT]);
  const again = JSON.parse(readFileSync(join(REPO, 'eval/out/report.json'), 'utf8'));
  assert.deepEqual(again.arms, rep.arms);
  assert.deepEqual(again.mcnemar, rep.mcnemar);
});

test('a fixture recorded against a different script text is refused', () => {
  const p = join(REPO, 'eval/fixtures/A/02-sequential-chain/rep1.json');
  const orig = readFileSync(p, 'utf8');
  try {
    writeFileSync(p, orig.replace(/"scriptSha256": "[0-9a-f]+"/, '"scriptSha256": "deadbeef"'));
    const r = node(['eval/run.mjs', '--out', OUT]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /stale fixture/);
  } finally {
    writeFileSync(p, orig);
  }
});

test('--live without an adapter fails loudly instead of inventing runs', () => {
  const r = node(['eval/run.mjs', '--live', '--out', OUT], { WF_EVAL_LIVE_CMD: '' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /WF_EVAL_LIVE_CMD/);
});
