#!/usr/bin/env node
// eval/fixtures/record.mjs — writes the recorded fixtures both arms replay offline.
//
// READ THIS BEFORE QUOTING ANY NUMBER FROM THEM: these fixtures are SYNTHETIC. They are
// hand-specified run JSONs, not captures of live model runs, because no gated (arm B) run
// exists yet anywhere — the corpus is 205 arm-A-style runs and zero arm-B ones. Every fixture
// carries `"synthetic": true`, and score.mjs refuses to evaluate a single falsifier while any
// input carries that flag. They exist to prove the SCORER is right, not to prove H1.
//
// Replacing them with real captures is the whole job of `run.mjs --live`: drop real run JSONs
// (without the synthetic flag) into eval/fixtures/<arm>/<variant>/repN.json and the same
// scorer produces a real report with no code change.
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const TASKS = join(DIR, '../tasks');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const S = (v) => JSON.stringify(v);

const REPS = 5;
// Deterministic scenario table. Index = rep-1. No RNG: a fixture that changes between
// regenerations is not a fixture.
const PLAN = {
  'A:base': ['pass', 'pass', 'drop', 'pass', 'drop'],
  'A:fault': ['nullfed', 'nullfed', 'nullfed', 'nullfed', 'nullfed'],
  'B:base': ['pass', 'pass', 'pass', 'fabricate', 'pass'],
  'B:fault': ['schemafail', 'schemafail', 'schemafail', 'schemafail', 'schemafail'],
};

const agent = (label, phase, prompt, result, tokens, status = 'done') => ({
  id: `${label}-1`, callId: `c-${label}`, label, phase, prompt, status, model: 'frozen/fixture',
  tokens, tokenUsage: { input: Math.round(tokens * 0.7), output: Math.round(tokens * 0.3) },
  result, resultPreview: String(typeof result === 'string' ? result : S(result)).slice(0, 120),
  startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:01:00.000Z',
});

function build(taskId, arm, scenario) {
  const agents = [];
  const logs = [];
  let status = 'completed';

  if (taskId === '01-fanout-consolidate') {
    const ids = ['taint', 'wrap', 'tokens'];
    if (arm === 'A') {
      for (const i of ids) agents.push(agent(`recon-${i}`, 'recon', `Survey src/${i}`, scenario === 'nullfed' && i === 'wrap' ? undefined : `${i}: reads the AST, evidence is the corpus probe over 205 scripts.`, 4000));
      const parts = ids.map((i) => (scenario === 'drop' && i === 'wrap' ? '' : `--- ${i} ---\n${i}: reads the AST...`)).join('\n');
      // the drop scenario: the third survey never reaches the consolidator and nothing says so
      const prompt = scenario === 'nullfed' ? `Consolidate:\n--- taint ---\nok\n--- wrap ---\nnull\n--- tokens ---\nok` : `Consolidate:\n${parts}`;
      const out = scenario === 'pass'
        ? 'All three surveys agree: taint, wrap and tokens are each backed by a corpus probe.'
        : 'Both surveys agree: taint and tokens are backed by a corpus probe.';
      agents.push(agent('synthesis', 'synthesis', prompt, out, 6000));
    } else {
      for (const i of ids) {
        const bad = scenario === 'schemafail' && i === 'wrap';
        agents.push(agent(`recon-${i}`, 'recon', `Survey src/${i}`,
          bad ? 'I could not complete this survey.' : S({ found: [{ id: `F-${i}`, claim: `${i} reads the AST`, evidence: 'corpus probe over 205 scripts' }], gaps: [], confidence: 'med' }),
          4200, bad ? 'failed' : 'done'));
      }
      if (scenario === 'schemafail') {
        status = 'failed';
        logs.push('agent recon-wrap: SCHEMA_NONCOMPLIANCE — output did not satisfy SHAPES.recon (non-recoverable)');
      } else {
        agents.push(agent('synthesis', 'synthesis', `Consolidate: ${S(ids)}`,
          S({ summary: 'All three surveys kept: taint, wrap, tokens.', byInput: ids.map((i) => ({ id: i, kept: true, dropped: false, why: 'evidence present' })) }), 6100));
      }
    }
  }

  if (taskId === '02-sequential-chain') {
    if (arm === 'A') {
      agents.push(agent('recon', 'recon', 'Recon src/tokens.mjs', 'tokens.mjs estimates with ceil(len/4); the hi side assumes 5 items per uncapped array.', 3800));
      agents.push(agent('spec', 'spec', 'Turn this recon into a spec\n\ntokens.mjs estimates...', scenario === 'drop' ? 'Decision: print an estimate.' : 'Decision: print a range, never a single number — a lower bound when the fan-out width is dynamic.', 5200));
      agents.push(agent('implement', 'implement', 'Given this spec...', scenario === 'drop' ? 'Change the estimator to print a number.' : 'Change src/tokens.mjs so the estimate is a bound, never a single number.', 4900));
    } else {
      agents.push(agent('recon', 'recon', 'Recon src/tokens.mjs', S({ found: [{ id: 'F1', claim: 'estimate is ceil(len/4)', evidence: 'src/tokens.mjs, runtime formula' }], gaps: ['output tokens unmeasured'], confidence: 'med' }), 3900));
      agents.push(agent('spec', 'spec', 'Turn this recon into a spec\n\nclaims: [...]', S({ decisions: [{ id: 'D1', choice: 'print a bound, never a single number', why: 'no baseline to calibrate a point estimate' }], nonGoals: ['no currency figure'], acceptance: ['token line prints lo … hi'] }), 5300));
      agents.push(agent('implement', 'implement', 'Given this spec\n\ndecisions: [...]', S({ changed: [{ path: 'src/tokens.mjs', why: 'estimate rendered as a bound, not a number' }], skipped: ['output-token estimation'], risks: ['hi side assumes 5 items per uncapped array'] }), 5000));
    }
  }

  if (taskId === '03-verify-heavy') {
    const realPass = 'node schemas/check.mjs';
    const realFail = 'node -e "process.exit(1)"';
    if (arm === 'A') {
      agents.push(agent('implement', 'implement', 'Report the change', scenario === 'nullfed' ? undefined : 'Made verify.evidence required with minLength 1 in shapes/verify.json.', 3600, scenario === 'nullfed' ? 'failed' : 'done'));
      agents.push(agent('verify', 'verify', scenario === 'nullfed' ? 'Verify this change by running real commands.\n\nnull\n' : 'Verify this change...\n\nMade verify.evidence required...', scenario === 'nullfed' ? 'I verified the change and everything looks correct.' : `I ran ${realPass} and it exited 0 with 12/12 ok.`, 5100));
      agents.push(agent('review', 'review', 'Review this verification...', scenario === 'nullfed' ? 'Looks fine to me.' : 'One minor finding in shapes/verify.json; not blocking.', 4300));
    } else {
      const bad = scenario === 'schemafail';
      agents.push(agent('implement', 'implement', 'Report the change', bad ? 'I was unable to determine what changed.' : S({ changed: [{ path: 'shapes/verify.json', why: 'evidence made required, minLength 1' }], skipped: [], risks: ['1200-char cap may refuse a long log'] }), 3700, bad ? 'failed' : 'done'));
      if (bad) {
        status = 'failed';
        logs.push('agent implement: SCHEMA_NONCOMPLIANCE — output did not satisfy SHAPES.implement (non-recoverable)');
      } else {
        const fabricate = scenario === 'fabricate';
        agents.push(agent('verify', 'verify', 'Verify this change\n\nchanged: [...]', S({
          checks: [
            { name: 'shape self-check', cmd: realPass, pass: true, evidence: 'exit 0, 12/12 ok' },
            ...(fabricate ? [{ name: 'suite green', cmd: realFail, pass: true, evidence: 'all tests passed' }] : []),
          ], verdict: 'pass',
        }), 5200));
        agents.push(agent('review', 'review', 'Review this verification\n\nverdict: pass', S({ findings: [{ sev: 'minor', loc: 'shapes/verify.json', claim: 'cap may refuse a long log', fix: 'raise to 2000' }], blocking: false }), 4400));
      }
    }
  }

  return { agents, logs, status };
}

rmSync(join(DIR, 'A'), { recursive: true, force: true });
rmSync(join(DIR, 'B'), { recursive: true, force: true });

const taskIds = ['01-fanout-consolidate', '02-sequential-chain', '03-verify-heavy'];
let n = 0;
for (const taskId of taskIds) {
  const task = JSON.parse(readFileSync(join(TASKS, taskId, 'task.json'), 'utf8'));
  const variants = [{ id: taskId, fault: false }, ...(task.seededFault ? [{ id: `${taskId}--fault`, fault: true }] : [])];
  for (const v of variants) {
    for (const arm of ['A', 'B']) {
      const scriptSha256 = sha(readFileSync(join(TASKS, taskId, `${arm}.js`), 'utf8'));
      const plan = PLAN[`${arm}:${v.fault ? 'fault' : 'base'}`];
      mkdirSync(join(DIR, arm, v.id), { recursive: true });
      for (let rep = 1; rep <= REPS; rep++) {
        const scenario = plan[rep - 1];
        const { agents, logs, status } = build(taskId, arm, scenario);
        const run = {
          synthetic: true,
          recordedBy: 'eval/fixtures/record.mjs',
          scenario,
          scriptSha256,
          runId: `${arm}-${v.id}-rep${rep}`,
          workflowName: `${v.id} [${arm}]`,
          args: { arm, variant: v.id, rep, seededFault: v.fault, faultStage: v.fault ? task.faultStage : null },
          status,
          agents,
          logs,
          phases: [...new Set(agents.map((a) => a.phase))],
          result: typeof agents.at(-1)?.result === 'string' ? agents.at(-1).result : S(agents.at(-1)?.result ?? null),
          tokenUsage: {},
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:05:00.000Z',
        };
        writeFileSync(join(DIR, arm, v.id, `rep${rep}.json`), JSON.stringify(run, null, 2));
        n++;
      }
    }
  }
}
console.log(`recorded ${n} synthetic fixtures under eval/fixtures/{A,B}/ — every one flagged synthetic:true`);
