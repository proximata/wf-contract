// The refusal rules. Two severities only: block | warn (D08).
import { walk, calleeName, wrapCheck, parse } from './parse.mjs';
import { analyze, rootIdent } from './taint.mjs';
import { canonical, sha256, HASHES, NAMES, index } from './shapes.mjs';
import { readFileSync, existsSync } from 'node:fs';

/** WFC106: the strip+wrap reproduction is pinned to a harness version (D11). */
function installedHarness() {
  const p = `${process.env.HOME}/.pi/agent/npm/node_modules/@quintinshaw/pi-dynamic-workflows/package.json`;
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')).version; } catch { return null; }
}

const STR_OPS = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'search', 'match', 'split', 'test']);

/** Literal-only evaluation of an object literal. Never eval() — untrusted input. */
function staticValue(n) {
  if (!n) return undefined;
  switch (n.type) {
    case 'Literal': return n.value;
    case 'ArrayExpression': return n.elements.map(staticValue);
    case 'ObjectExpression': {
      const o = {};
      for (const p of n.properties) {
        if (p.type !== 'Property' || p.computed) return undefined;
        o[p.key.name ?? p.key.value] = staticValue(p.value);
      }
      return o;
    }
    case 'UnaryExpression': {
      const v = staticValue(n.argument);
      return n.operator === '-' ? -v : n.operator === '!' ? !v : undefined;
    }
    default: return undefined;
  }
}

function shapesDecl(ast) {
  for (const st of ast.body) {
    if (st.type !== 'VariableDeclaration') continue;
    for (const d of st.declarations) {
      if (d.id.type === 'Identifier' && d.id.name === 'SHAPES' && d.init?.type === 'ObjectExpression') return d.init;
    }
  }
  return null;
}

export function checkScript(script, { allow = [], maxTokens = null } = {}) {
  const findings = [];
  const add = (id, sev, msg, loc) => findings.push({ id, sev, msg, loc: loc ?? null });

  // WFC002 first: if the harness cannot even parse it, nothing else is trustworthy.
  const wrap = wrapCheck(script);
  if (!wrap.ok) {
    add('WFC002', 'block', `fails harness strip+wrap re-parse: ${wrap.message}`);
    return { findings, model: null };
  }

  const ast = parse(script);
  const model = analyze(script, ast);
  const { stages, groups } = model;

  // ---- WFC003: SHAPES literal must be present and hash-equal to shapes/index.json
  const decl = shapesDecl(ast);
  if (!decl) {
    if (stages.some((s) => s.schema.present)) add('WFC003', 'block', 'schema used but no top-level `const SHAPES = {…}` literal');
  } else {
    const val = staticValue(decl);
    if (!val) add('WFC003', 'block', 'SHAPES contains non-literal values');
    else {
      for (const n of NAMES) {
        if (!(n in val)) { add('WFC003', 'block', `SHAPES.${n} missing`); continue; }
        const h = sha256(canonical(val[n]));
        if (h !== HASHES[n]) {
          const keys = Object.keys(val[n]?.properties ?? {}).join(',') || '-';
          add('WFC003', 'block', `SHAPES.${n} drifted from canonical (its properties: ${keys})`);
        }
      }
    }
  }

  // ---- WFC003b: a consumed stage with no / non-canonical schema
  const consumed = new Set();
  for (const s of stages) for (const h of s.holesResolved) for (const src of h.sources ?? []) if (src.stage != null) consumed.add(src.stage);
  for (const i of consumed) {
    const s = stages[i];
    if (!s.schema.present) add('WFC003', 'block', `stage [${i}] ${s.label}: output consumed but declares no schema`, s.label);
    else if (!NAMES.includes(s.schema.name)) add('WFC003', 'block', `stage [${i}] ${s.label}: schema is not a SHAPES.<one of six>`, s.label);
  }

  // ---- WFC001: raw passthrough
  for (const s of stages) {
    for (const h of s.holesResolved) {
      const raw = (h.sources ?? []).filter((src) => !src.schema);
      if (raw.length) {
        add('WFC001', 'block', `stage [${s.i}] ${s.label}: \`\${${h.name}}\` carries raw output of an uncontracted stage`, s.label);
      }
    }
  }

  // ---- WFC004: producer promise neither awaited, assigned, returned nor passed on
  walk(ast, (n, parent) => {
    if (n.type !== 'CallExpression') return;
    const name = calleeName(n);
    if (!['agent', 'parallel', 'pipeline'].includes(name)) return;
    if (parent && parent.type === 'ExpressionStatement') {
      add('WFC004', 'block', `${name}() result is discarded — the promise is neither awaited nor stored`);
    }
  });

  // ---- WFC005: control flow keyed on a string op over a tainted binding
  walk(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    if (c.type !== 'MemberExpression' || c.computed || !STR_OPS.has(c.property.name)) return;
    const names = [...rootIdent(c.object), ...n.arguments.flatMap(rootIdent)];
    const t = names.find((x) => model.taint.has(x));
    if (t) add('WFC005', 'block', `control flow via \`.${c.property.name}()\` over tainted \`${t}\` — parse prose, not data`);
  });

  // ---- WFC006: a parallel branch binding that is never read
  const reads = new Map();
  walk(ast, (n, parent) => {
    if (n.type !== 'Identifier') return;
    if (parent?.type === 'VariableDeclarator' && parent.id === n) return;
    if (parent?.type === 'ArrayPattern' || parent?.type === 'ObjectPattern') return;
    if (parent?.type === 'Property' && parent.parent?.type === 'ObjectPattern') return;
    reads.set(n.name, (reads.get(n.name) ?? 0) + 1);
  });
  for (const [name, info] of model.taint) {
    if (!info.sources.some((s) => s.group != null)) continue;
    if ((reads.get(name) ?? 0) === 0) add('WFC006', 'block', `parallel branch binding \`${name}\` is destructured and never read`);
  }

  // ---- warns
  walk(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'slice') {
      const t = rootIdent(c.object).find((x) => model.taint.has(x));
      if (t) add('WFC101', 'warn', `\`.slice()\` truncates tainted \`${t}\` — use the shape's maxLength instead`);
    }
  });
  const pinned = index().harness, live = installedHarness();
  if (pinned && live && pinned !== live) add('WFC106', 'warn', `harness ${live} ≠ pinned ${pinned} — strip+wrap reproduction may have drifted`);
  for (const g of groups) if (g.dynamic) add('WFC104', 'warn', `${g.kind}(x.map(…)) — fan-out width unknown at preflight`);
  for (const s of stages) if (!s.timeout) add('WFC105', 'warn', `stage [${s.i}] ${s.label}: no agentTimeoutMs — a wedged agent hangs the run`);

  // ---- allowlist (D13): keyed on the hash of THIS script; every consumption printed
  const hash = sha256(script);
  const exempt = [];
  const kept = findings.filter((f) => {
    const a = allow.find((x) => x.rule === f.id && x.sha256 === hash && x.why);
    if (a) { exempt.push({ ...f, why: a.why }); return false; }
    return true;
  });

  return { findings: kept, exempt, model, hash, maxTokens };
}
