// Loads shapes/*.json, canonicalises, hashes. Single source of truth for the six.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const NAMES = ['recon', 'spec', 'implement', 'verify', 'review', 'synthesis'];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'shapes');

/** Deterministic JSON: keys sorted recursively. Arrays keep order. */
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export const SHAPES = Object.fromEntries(
  NAMES.map((n) => [n, JSON.parse(readFileSync(join(dir, n + '.json'), 'utf8'))]),
);

export const HASHES = Object.fromEntries(NAMES.map((n) => [n, sha256(canonical(SHAPES[n]))]));

export function index() {
  const p = join(dir, 'index.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { shapes: HASHES, harness: null };
}

export function emitJs() {
  return 'const SHAPES = ' + JSON.stringify(SHAPES, null, 2) + ';\n';
}

/** Sum of every maxLength reachable in a shape = upper bound on its serialised prose. */
export function shapeBudgetChars(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 8) return 0;
  let n = 0;
  if (typeof schema.maxLength === 'number') n += schema.maxLength;
  if (schema.type === 'boolean' || schema.enum) n += 8;
  if (schema.properties) for (const k of Object.keys(schema.properties)) n += k.length + 4 + shapeBudgetChars(schema.properties[k], depth + 1);
  // ponytail: unbounded arrays assumed 5 items. Ceiling: no maxItems in the shapes yet.
  if (schema.items) n += (schema.maxItems ?? 5) * shapeBudgetChars(schema.items, depth + 1);
  return n;
}

export const BUDGET = Object.fromEntries(NAMES.map((n) => [n, shapeBudgetChars(SHAPES[n])]));
