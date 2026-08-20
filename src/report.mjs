// Fixed 8-line executive summary (D15) + human/JSON report.
import { renderDag, edges, depths } from './dag.mjs';
import { tokenLine } from './tokens.mjs';

const tally = (xs) => {
  const m = new Map();
  for (const x of xs) m.set(x.id, (m.get(x.id) ?? 0) + 1);
  return [...m].map(([id, n]) => `${id}×${n}`).join(' ') || '—';
};

export function summary(res, name = '-') {
  const { findings, exempt = [], model } = res;
  const blocks = findings.filter((f) => f.sev === 'block');
  const warns = findings.filter((f) => f.sev === 'warn');
  const es = edges(model);
  const d = depths(model, es);
  const fanouts = model.groups;
  const orphans = model.stages.filter((s) => !es.some((e) => e.from === s.i) && !s.schema.present).length;
  const contracts = new Map();
  for (const s of model.stages) {
    const c = s.schema.name ?? 'RAW';
    contracts.set(c, (contracts.get(c) ?? 0) + 1);
  }
  const rawEdges = es.filter((e) => e.contract === 'RAW').length;
  const longest = model.stages.length
    ? model.stages.filter((s) => d[s.i] === Math.max(...d)).map((s) => s.label).join(',')
    : '—';
  const consolidation = fanouts.length
    ? `fan-out ${fanouts.map((g) => (g.dynamic ? 'N?' : g.width)).join('+')} branches · consolidated ${fanouts.reduce((a, g) => a + g.members.filter((m) => es.some((e) => e.from === m)).length, 0)}/${fanouts.reduce((a, g) => a + g.members.length, 0)}`
    : 'fan-out none';
  return [
    `${blocks.length ? `BLOCKED ${blocks.length}` : 'CLEAN'} · warn ${warns.length} · exempt ${exempt.length}`,
    `stages ${model.stages.length} · edges ${es.length} · fan-outs ${fanouts.length} · orphans ${orphans} · depth ${d.length ? Math.max(...d) + 1 : 0}`,
    `contracts  ${[...contracts].map(([c, n]) => `${c}×${n}`).join(' ') || '—'} · RAW edges ${rawEdges}`,
    tokenLine(model),
    `blocks  ${tally(blocks)}`,
    `warns   ${tally(warns)}`,
    consolidation,
    `longest  ${longest}`.slice(0, 60),
  ];
}

export function human(res, name = '-') {
  if (!res.model) {
    return [`wf-contract check ${name}`, '', ...res.findings.map((f) => `${f.sev.toUpperCase()} ${f.id}  ${f.msg}`)].join('\n');
  }
  const s = summary(res, name);
  const lines = [`wf-contract check ${name}`.slice(0, 60), '', ...renderDag(res.model), '', ...s, ''];
  for (const f of res.findings) lines.push(`${f.sev === 'block' ? '✗' : '⚠'} ${f.id}  ${f.msg}`);
  for (const e of res.exempt ?? []) lines.push(`· exempt ${e.id}  ${e.msg}  — ${e.why}`);
  return lines.join('\n');
}

export function json(res, name = '-') {
  return {
    file: name,
    hash: res.hash ?? null,
    blocked: res.findings.some((f) => f.sev === 'block'),
    findings: res.findings,
    exempt: res.exempt ?? [],
    summary: res.model ? summary(res, name) : null,
    dag: res.model ? renderDag(res.model) : null,
  };
}
