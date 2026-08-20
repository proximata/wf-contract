// Parsing only. Never eval: a workflow script is untrusted input.
import * as acorn from 'acorn';

export const PARSE_OPTS = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  locations: true,
};

export function parse(script) {
  return acorn.parse(script, PARSE_OPTS);
}

/** Reproduces the harness: strip first statement (workflow.ts:946), wrap (workflow.ts:831). */
export function stripAndWrap(script) {
  const ast = acorn.parse(script, PARSE_OPTS);
  const first = ast.body[0];
  const body = first ? script.slice(0, first.start) + script.slice(first.end) : script;
  return `(async () => {\n${body}\n})()`;
}

/** WFC002: does the script survive the harness' own strip+wrap re-parse? */
export function wrapCheck(script) {
  try {
    acorn.parse(stripAndWrap(script), {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

const SKIP = new Set(['loc', 'start', 'end', 'range', 'type']);

/** Depth-first walk with parent links. Plain object crawl — no visitor table to drift. */
export function walk(node, fn, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    if (SKIP.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, fn, node);
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, fn, node);
  }
}

export function calleeName(node) {
  if (!node || node.type !== 'CallExpression') return null;
  const c = node.callee;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') return c.property.name;
  return null;
}
