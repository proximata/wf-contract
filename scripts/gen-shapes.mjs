#!/usr/bin/env node
// Regenerates shapes/index.json and shapes/shapes.js from shapes/*.json. CI must see no diff.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { HASHES, emitJs } from '../src/shapes.mjs';

const pkgPath = new URL('../node_modules/@quintinshaw/pi-dynamic-workflows/package.json', import.meta.url);
const home = new URL('file://' + process.env.HOME + '/.pi/agent/npm/node_modules/@quintinshaw/pi-dynamic-workflows/package.json');
const p = existsSync(pkgPath) ? pkgPath : home;
const idxPath = new URL('../shapes/index.json', import.meta.url);
// The pinned harness version is a committed fact (D11), not an environment reading. When the
// package is not installed (CI, a fresh clone) keep the pin instead of nulling it — otherwise
// regeneration produces a diff on every box that has not installed pi-dynamic-workflows.
const pinned = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')).harness ?? null : null;
const harness = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).version : pinned;

writeFileSync(idxPath, JSON.stringify({ shapes: HASHES, harness }, null, 2) + '\n');
writeFileSync(new URL('../shapes/shapes.js', import.meta.url), '// GENERATED from shapes/*.json by scripts/gen-shapes.mjs — do not edit.\n' + emitJs());
console.log('shapes/index.json + shapes/shapes.js written · harness', harness);
