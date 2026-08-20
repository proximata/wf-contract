// Read a pi-dynamic-workflows run JSON and pull out the per-stage facts the scorer needs.
// One reader for both modes: a recorded fixture and a live run JSON are the same shape,
// so nothing in score.mjs knows which it is looking at.
import { readFileSync } from 'node:fs';

export const loadRun = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Stage output as a parsed object, or null when it is prose. Arm A is prose by construction. */
export function stageObject(agent) {
  const r = agent?.result;
  if (r && typeof r === 'object') return r;
  if (typeof r !== 'string') return null;
  const s = r.trim();
  if (!s.startsWith('{')) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export const stageText = (agent) =>
  typeof agent?.result === 'string' ? agent.result : JSON.stringify(agent?.result ?? '');

/** Last agent carrying a label — reps may retry a label, the last one is the one consumed. */
export const byLabel = (run, label) => run.agents.filter((a) => a.label === label).pop() ?? null;

/** Retries = every extra attempt on a label, however the runtime recorded it. */
export function retries(run) {
  const seen = new Map();
  let extra = 0;
  for (const a of run.agents) {
    const n = (seen.get(a.label) ?? 0) + 1;
    seen.set(a.label, n);
    if (n > 1) extra++;
    if (typeof a.attempts === 'number' && a.attempts > 1) extra += a.attempts - 1;
  }
  return extra;
}

export const tokens = (run) => run.agents.reduce((s, a) => s + (Number(a.tokens) || 0), 0);

/** S4: a stored prompt containing a standalone `null` line — an upstream hole fed downstream. */
export const nullFed = (run) =>
  run.agents.some((a) => /^\s*(null|undefined)\s*$/m.test(String(a.prompt ?? '')));

/** S3: an error that names the stage it came from. */
const LOCATED = /SCHEMA_NONCOMPLIANCE|WFC\d{3}|AGENT_EMPTY_OUTPUT/;
export function locatedFailure(run) {
  const hay = [
    JSON.stringify(run.logs ?? []),
    String(run.error ?? ''),
    ...run.agents.map((a) => `${a.status}:${a.error ?? ''}:${String(a.result ?? '')}`),
  ].join('\n');
  if (LOCATED.test(hay)) return true;
  // an agent that errored and launched nothing after it is also located: the edge is named
  const i = run.agents.findIndex((a) => a.status === 'failed' || a.status === 'error');
  return i >= 0 && i === run.agents.length - 1;
}
