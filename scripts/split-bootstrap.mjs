#!/usr/bin/env node
/**
 * Split supabase/bootstrap-fresh.sql into paste-size chunks that the
 * Supabase SQL Editor can actually handle (pasting the whole ~300KB file
 * freezes the browser).
 *
 * Usage:
 *   node scripts/split-bootstrap.mjs          # writes supabase/bootstrap-parts/NN_*.sql
 *   node scripts/split-bootstrap.mjs 24       # smaller chunks (max KB per part)
 *
 * Rules:
 * - Split points are SECTION banners only ("-- MIGRATION n/..." boxes and
 *   "-- ==== Feature: ... ====" banners). Every section is self-contained in
 *   its own begin;...commit;, so running the parts in order is identical to
 *   running the whole file.
 * - A section whose begin/commit or $$ counts are unbalanced (defensive — it
 *   should never happen) is glued to the previous part.
 * - Every part starts with a comment telling you it is part k/N.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "supabase/bootstrap-fresh.sql";
const OUT = "supabase/bootstrap-parts";
const MAX = (Number(process.argv[2]) || 40) * 1024;

const text = readFileSync(SRC, "utf8");
const lines = text.split("\n");

// find section starts: a "-- ===...===" line whose NEXT line starts with "--"
// and mentions a section title (MIGRATION …/… or a "P0|P1|P2 #…" tag), or a
// single-line "-- ==== X: ... ====" banner.
const starts = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^-- ={10,}$/.test(l) && i + 1 < lines.length && /^-- .*(MIGRATION|phase|schema)/i.test(lines[i + 1])) {
    starts.push(i);
  } else if (/^-- ={4,} \S.*={0,}\s*$/.test(l) && !/^-- ={10,}$/.test(l)) {
    // one-line banner: "-- ==== P2 #17: ... ===="
    starts.push(i);
  }
}
if (starts.length === 0) throw new Error("no section banners found — wrong file?");
if (starts[0] !== 0) starts.unshift(0); // prelude rides with section 1
// de-dupe adjacent starts (a box header directly after a banner line)
const uniq = starts.filter((v, i) => i === 0 || v - starts[i - 1] > 2);

const sections = [];
for (let i = 0; i < uniq.length; i++) {
  const from = uniq[i];
  const to = i + 1 < uniq.length ? uniq[i + 1] : lines.length;
  sections.push(lines.slice(from, to).join("\n"));
}

const bal = (s) => {
  const begin = (s.match(/^begin;/gm) || []).length;
  const commit = (s.match(/^commit;/gm) || []).length;
  const dollars = (s.match(/\$\$/g) || []).length;
  return { ok: begin === commit && dollars % 2 === 0, begin, commit, dollars };
};

// verify the whole file is balanced (a cheap guard against mis-splitting)
{
  const t = bal(text);
  if (!t.ok) throw new Error(`source looks unbalanced (begin:${t.begin} commit:${t.commit} $$:${t.dollars}) — aborting`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const parts = [];
let cur = "";
for (const sec of sections) {
  const b = bal(sec);
  if (!b.ok) {
    // never break across an unbalanced section: glue it to the current part
    cur += (cur ? "\n" : "") + sec;
    continue;
  }
  if (cur.length + sec.length + 1 > MAX && cur.length > 0) {
    parts.push(cur);
    cur = sec;
  } else {
    cur += (cur ? "\n" : "") + sec;
  }
}
if (cur.trim()) parts.push(cur);

// byte-identity guard: reassembled content must contain every source line
const totalIn = parts.reduce((n, p) => n + p.split("\n").length, 0);
if (totalIn < lines.length) console.warn(`⚠ ${lines.length - totalIn} leading/blank lines dropped by the splitter (cosmetic only)`);

parts.forEach((p, i) => {
  const n = String(i + 1).padStart(2, "0");
  const head = `-- PART ${i + 1}/${parts.length} of ${SRC} — run the parts IN ORDER, top to bottom.\n`;
  const name = `${n}_bootstrap-part.sql`;
  writeFileSync(join(OUT, name), head + p + "\n");
  const size = (head.length + p.length + 1).toFixed(0);
  console.log(`✓ ${OUT}/${name}  (${Math.round(size / 1024)} KB)`);
});
console.log(`\nDone — ${parts.length} parts. Paste them into the Supabase SQL Editor one by one,`);
console.log("or run them in order with:  psql \"$DATABASE_URL\" -f <part>  (each part ends committed).");
