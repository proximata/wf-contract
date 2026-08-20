// ASCII DAG, hard ≤60 columns (D14).
import { stageTokens, k } from './tokens.mjs';

const W = 60;

export function edges(model) {
  const es = [];
  for (const s of model.stages) {
    for (const h of s.holesResolved) {
      for (const src of h.sources ?? []) {
        if (src.stage == null || src.stage === s.i) continue;
        es.push({ from: src.stage, to: s.i, contract: src.schema ?? 'RAW' });
      }
    }
  }
  return es;
}

export function depths(model, es) {
  const d = model.stages.map(() => 0);
  for (let r = 0; r < model.stages.length; r++) {
    for (const e of es) if (d[e.to] < d[e.from] + 1) d[e.to] = d[e.from] + 1;
  }
  return d;
}

const pad = (s, n) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

export function renderDag(model) {
  const es = edges(model);
  const d = depths(model, es);
  const out = [];
  const consumedFrom = new Set(es.map((e) => e.from));
  const groupHeaderDone = new Set();

  for (const s of model.stages) {
    const g = s.group != null ? model.groups[s.group] : null;
    const depth = d[s.i];
    if (g && !groupHeaderDone.has(g.id)) {
      groupHeaderDone.add(g.id);
      const wid = g.dynamic ? 'N?' : String(g.width);
      out.push(' '.repeat(Math.max(0, depth * 3 - 3)) + `└▶⇉${wid} ${g.kind}`);
    }
    const indent = ' '.repeat(depth * 3);
    const branch = g ? '├▶' : depth === 0 ? '' : '└▶';
    const inc = es.filter((e) => e.to === s.i);
    const contract = inc.length ? [...new Set(inc.map((e) => e.contract))].join('/') : (s.schema.name ?? (s.schema.present ? '?' : '—'));
    const t = stageTokens(s);
    const orphan = !consumedFrom.has(s.i) && !s.schema.present ? ' ⚠ orphan' : '';
    const right = `${contract} ~${k(t.hi)}`;
    const left = `${indent}${branch}[${s.i}] ${s.label}${orphan}`;
    const gapAt = Math.max(1, W - right.length - 1);
    out.push(pad(left, gapAt) + ' ' + right);

    // consolidation marker after the last member of a group
    if (g && g.members[g.members.length - 1] === s.i) {
      const kept = g.members.filter((m) => consumedFrom.has(m)).length;
      out.push(' '.repeat(depth * 3 + 3) + `⇊ consolidate ${kept}/${g.width ?? g.members.length}`);
    }
  }
  return out.map((l) => (l.length > W ? l.slice(0, W) : l));
}
