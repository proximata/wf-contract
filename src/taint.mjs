// Builds the stage/edge model and the taint map. Name-keyed, not scope-keyed.
// ponytail: no scope analysis — a shadowed name in an inner function is treated as the same
// binding. Ceiling: false positives on reused generic names. Upgrade: per-scope symbol table.
import { walk, calleeName } from './parse.mjs';

export const PRODUCERS = new Set([
  'agent', 'parallel', 'pipeline', 'workflow', 'verify', 'judgePanel',
  'loopUntilDry', 'completenessCheck', 'retry', 'gate',
]);

const strOf = (n) => (n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : null);

function optionOf(call, key) {
  const o = call.arguments[1];
  if (!o || o.type !== 'ObjectExpression') return null;
  for (const p of o.properties) {
    if (p.type === 'Property' && !p.computed && (p.key.name ?? p.key.value) === key) return p.value;
  }
  return null;
}

/** `SHAPES.verify` → 'verify'. Anything else (computed, inline literal, other object) → null. */
function schemaRef(call) {
  const v = optionOf(call, 'schema');
  if (!v) return { present: false, name: null, node: null };
  const ok = v.type === 'MemberExpression' && !v.computed
    && v.object.type === 'Identifier' && v.object.name === 'SHAPES'
    && v.property.type === 'Identifier';
  return { present: true, name: ok ? v.property.name : null, node: v };
}

/** Static text chars + the identifier holes of a template literal prompt. */
function promptParts(node) {
  if (!node) return { staticChars: 0, holes: [], literal: false };
  if (node.type === 'TemplateLiteral') {
    const staticChars = node.quasis.reduce((a, q) => a + q.value.cooked.length, 0);
    const holes = node.expressions.map((e) => rootIdent(e));
    return { staticChars, holes, literal: true };
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return { staticChars: node.value.length, holes: [], literal: true };
  }
  return { staticChars: 0, holes: [rootIdent(node)], literal: false };
}

/** The base identifier of an expression: `xs.map(f).join('\n')` → 'xs'. Also collects all idents. */
function rootIdent(expr) {
  const names = [];
  walk(expr, (n, parent) => {
    if (n.type !== 'Identifier') return;
    if (parent && parent.type === 'MemberExpression' && !parent.computed && parent.property === n) return;
    if (parent && parent.type === 'Property' && !parent.computed && parent.key === n) return;
    names.push(n.name);
  });
  return names;
}

/** Does `init` reach a producer call within `maxHops` of await/member/call chaining? */
function producerOf(init, maxHops = 6) {
  let n = init, hops = 0;
  while (n && hops++ <= maxHops) {
    if (n.type === 'AwaitExpression') { n = n.argument; continue; }
    if (n.type === 'CallExpression') {
      const name = calleeName(n);
      if (PRODUCERS.has(name)) return { call: n, name };
      n = n.callee; continue;
    }
    if (n.type === 'MemberExpression') { n = n.object; continue; }
    if (n.type === 'TSNonNullExpression' || n.type === 'ChainExpression') { n = n.expression; continue; }
    break;
  }
  return null;
}

export function analyze(script, ast) {
  const stages = [];   // agent() call sites
  const groups = [];   // parallel()/pipeline() call sites
  const byCall = new Map(); // CallExpression node -> stage idx

  walk(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const name = calleeName(n);
    if (name === 'agent') {
      const s = schemaRef(n);
      const p = promptParts(n.arguments[0]);
      const label = strOf(optionOf(n, 'label')) ?? `#${stages.length}`;
      stages.push({
        i: stages.length, label, node: n, schema: s, ...p,
        timeout: optionOf(n, 'agentTimeoutMs') != null,
        group: null, holesResolved: [],
      });
      byCall.set(n, stages.length - 1);
    } else if (name === 'parallel' || name === 'pipeline') {
      const a = n.arguments[0];
      const dynamic = !(a && a.type === 'ArrayExpression');
      groups.push({ id: groups.length, kind: name, node: n, dynamic, width: dynamic ? null : a.elements.length, members: [] });
    }
  });

  // membership: an agent() call lexically inside a group call belongs to it
  for (const g of groups) {
    for (const s of stages) if (s.node.start > g.node.start && s.node.end < g.node.end) { s.group = g.id; g.members.push(s.i); }
    if (g.width == null && g.members.length) g.width = g.members.length;
  }

  // --- taint map: varName -> { producers: [{kind,stageIdx|groupId,schemaName}] }
  const taint = new Map();
  const put = (name, src) => {
    if (!name) return;
    const cur = taint.get(name) ?? { sources: [] };
    cur.sources.push(src);
    taint.set(name, cur);
  };
  const srcOf = (prod) => {
    if (prod.name === 'agent') {
      const i = byCall.get(prod.call);
      return [{ kind: 'agent', stage: i, schema: stages[i]?.schema?.name ?? null }];
    }
    const g = groups.find((x) => x.node === prod.call);
    if (g) return g.members.map((i) => ({ kind: 'agent', stage: i, schema: stages[i].schema?.name ?? null, group: g.id }));
    return [{ kind: prod.name, stage: null, schema: null }];
  };

  const decls = [];
  walk(ast, (n) => { if (n.type === 'VariableDeclarator' && n.init) decls.push(n); });

  for (const d of decls) {
    const prod = producerOf(d.init);
    if (!prod) continue;
    const srcs = srcOf(prod);
    if (d.id.type === 'Identifier') for (const s of srcs) put(d.id.name, s);
    else if (d.id.type === 'ArrayPattern') {
      d.id.elements.forEach((el, k) => {
        if (!el) return;
        const nm = el.type === 'Identifier' ? el.name : null;
        put(nm, srcs[k] ?? srcs[0] ?? { kind: prod.name, stage: null, schema: null });
      });
    } else if (d.id.type === 'ObjectPattern') {
      for (const p of d.id.properties) {
        const nm = p.type === 'Property' && p.value.type === 'Identifier' ? p.value.name : null;
        for (const s of srcs) put(nm, s);
      }
    }
  }

  // fixed point: derived bindings inherit taint (3 rounds)
  for (let r = 0; r < 3; r++) {
    for (const d of decls) {
      if (d.id.type !== 'Identifier' || taint.has(d.id.name)) continue;
      const used = rootIdent(d.init).filter((x) => taint.has(x));
      if (used.length) for (const u of used) for (const s of taint.get(u).sources) put(d.id.name, s);
    }
  }

  // resolve prompt holes against the taint map
  for (const s of stages) {
    s.holesResolved = s.holes.flat().filter(Boolean).map((name) => ({
      name, sources: taint.get(name)?.sources ?? null,
    }));
  }

  return { stages, groups, taint, byCall };
}

export { rootIdent, producerOf, optionOf, schemaRef, promptParts };
