#!/usr/bin/env node
// Regenerates shapes/index.json and shapes/shapes.js from shapes/*.json. CI must see no diff.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { HASHES, emitJs } from '../src/shapes.mjs';

const pkgPath = new URL('../node_modules/@quintinshaw/pi-dynamic-workflows/package.json', import.meta.url);
const home = new URL('file://' + process.env.HOME + '/.pi/agent/npm/node_modules/@quintinshaw/pi-dynamic-workflows/package.json');
const p = existsSync(pkgPath) ? pkgPath : home;
const harness = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).version : null;

writeFileSync(new URL('../shapes/index.json', import.meta.url), JSON.stringify({ shapes: HASHES, harness }, null, 2) + '\n');
writeFileSync(new URL('../shapes/shapes.js', import.meta.url), '// GENERATED from shapes/*.json by scripts/gen-shapes.mjs — do not edit.\n' + emitJs());
console.log('shapes/index.json + shapes/shapes.js written · harness', harness);
