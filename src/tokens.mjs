// Runtime's own formula (workflow.ts:1563) so gate and run cannot disagree.
import { BUDGET } from './shapes.mjs';

export const est = (chars) => Math.ceil(chars / 4);

/** Per-stage [lo, hi] input estimate. hi is Infinity when any hole is a RAW edge. */
export function stageTokens(s) {
  const lo = est(s.staticChars);
  let hiChars = s.staticChars;
  for (const h of s.holesResolved) {
    if (!h.sources) continue;                       // not a producer edge → static-ish, ignore
    for (const src of h.sources) {
      if (!src.schema) return { lo, hi: Infinity, raw: true };
      hiChars += BUDGET[src.schema] ?? 0;
    }
  }
  return { lo, hi: est(hiChars), raw: false };
}

export function totals(model) {
  let lo = 0, hi = 0, raw = false;
  for (const s of model.stages) {
    const t = stageTokens(s);
    lo += t.lo;
    if (t.hi === Infinity) raw = true; else hi += t.hi;
  }
  const lower = model.groups.some((g) => g.dynamic);
  return { lo, hi: raw ? Infinity : hi, raw, lower };
}

export const k = (n) => (n === Infinity ? '∞' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

export function tokenLine(model) {
  const t = totals(model);
  const pre = t.lower ? '≥ ' : '';
  return `in ≈ ${pre}[${k(t.lo)} … ${k(t.hi)}] est chars/4 · out unmeasured`;
}
