#!/usr/bin/env node
/**
 * Asset integrity check.
 *
 * Every `/images/...` path referenced anywhere in lib/ or app/ must exist in
 * public/. A missing file does not fail the build — it fails silently in the
 * browser as a 404, or as a 400 through next/image's optimizer. This catches
 * it before deploy.
 *
 * Usage: npm run check:assets
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = /["'`(](\/images\/[A-Za-z0-9._/-]+)["'`)]/g;

/** Recursively collect files with the given extensions under a directory. */
function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const sources = [
  ...walk(join(root, 'lib'), ['.ts', '.tsx']),
  ...walk(join(root, 'app'), ['.ts', '.tsx']),
  ...walk(join(root, 'components'), ['.ts', '.tsx']),
];

const referenced = new Map(); // path -> Set of files that reference it

for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(REF)) {
    const ref = match[1];
    if (!referenced.has(ref)) referenced.set(ref, new Set());
    referenced.get(ref).add(file.replace(root, '').slice(1));
  }
}

const missing = [];
for (const [ref, files] of referenced) {
  if (!existsSync(join(root, 'public', ref))) {
    missing.push({ ref, files: [...files] });
  }
}

// Report orphans too — images shipped but never used.
const onDisk = readdirSync(join(root, 'public', 'images'))
  .filter((f) => /\.(jpe?g|png|webp|avif|svg)$/i.test(f))
  .map((f) => `/images/${f}`);
const orphans = onDisk.filter((f) => !referenced.has(f));

console.log(`Scanned ${sources.length} source files.`);
console.log(`Found ${referenced.size} distinct image reference(s).\n`);

if (missing.length === 0) {
  console.log('OK  every referenced image exists in public/.');
} else {
  console.error(`FAIL  ${missing.length} referenced image(s) missing from public/:\n`);
  for (const { ref, files } of missing) {
    console.error(`  ${ref}`);
    for (const f of files) console.error(`      referenced by ${f}`);
  }
}

if (orphans.length > 0) {
  console.warn(`\nNOTE  ${orphans.length} image(s) in public/images are never referenced:`);
  for (const o of orphans) console.warn(`  ${o}`);
}

process.exit(missing.length > 0 ? 1 : 0);
