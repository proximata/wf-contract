import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkScript } from '../src/rules.mjs';
import { renderDag } from '../src/dag.mjs';
import { human } from '../src/report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fx = (n) => readFileSync(join(root, 'test/fixtures', n), 'utf8');
const cli = (args, input) => {
  try {
    const out = execFileSync(process.execPath, [join(root, 'bin/wf-contract.mjs'), ...args], { input, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: e.stdout }; }
};

test('known-bad script is refused', () => {
  const r = checkScript(fx('bad.js'));
  const ids = new Set(r.findings.filter((f) => f.sev === 'block').map((f) => f.id));
  assert.ok(ids.has('WFC001'), 'raw passthrough blocked');
  assert.ok(ids.has('WFC003'), 'undeclared shape blocked');
  assert.ok(ids.has('WFC005'), 'prose control flow blocked');
  assert.equal(cli(['check', join(root, 'test/fixtures/bad.js')]).code, 1, 'exit 1');
});

test('known-good script passes', () => {
  const r = checkScript(fx('good.js'));
  assert.deepEqual(r.findings.filter((f) => f.sev === 'block'), [], 'no blocks');
  assert.deepEqual(r.findings.filter((f) => f.sev === 'warn'), [], 'no warns');
  assert.equal(cli(['check', join(root, 'test/fixtures/good.js')]).code, 0, 'exit 0');
});

test('a one-character shape edit is caught by hash', () => {
  const drifted = fx('good.js').replace('"maxLength": 600', '"maxLength": 601');
  const r = checkScript(drifted);
  assert.ok(r.findings.some((f) => f.id === 'WFC003' && /drifted/.test(f.msg)), 'WFC003 drift');
});

test('DAG renders: fan-out, consolidation, ≤60 columns', () => {
  const r = checkScript(fx('good.js'));
  const dag = renderDag(r.model);
  assert.ok(dag.some((l) => l.includes('⇉2')), 'fan-out header');
  assert.ok(dag.some((l) => l.includes('⇊ consolidate 2/2')), 'consolidation');
  assert.ok(dag.some((l) => l.startsWith('├▶') || l.includes('├▶')), 'branch glyph');
  for (const l of [...dag, ...human(r, 'good.js').split('\n')]) {
    assert.ok([...l].length <= 60, `>60 cols: ${l}`);
  }
});

test('RAW edge estimates ∞, contract edge does not', () => {
  assert.match(human(checkScript(fx('bad.js')), 'bad.js'), /in ≈ \[\d+ … ∞\] est chars\/4 · out unmeasured/);
  assert.match(human(checkScript(fx('good.js')), 'good.js'), /in ≈ \[\d+ … [\d.]+k?\] est chars\/4/);
});

test('CLI never prompts and reads stdin; shapes --emit js round-trips', () => {
  assert.equal(cli(['check', '-'], fx('bad.js')).code, 1);
  const js = cli(['shapes', '--emit', 'js']).out;
  const r = checkScript(js + '\nawait agent(`hi`, { label: "x", schema: SHAPES.recon, agentTimeoutMs: 1000 });\n');
  assert.deepEqual(r.findings.filter((f) => f.id === 'WFC003'), [], 'emitted SHAPES hash-matches');
});
