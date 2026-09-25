#!/usr/bin/env node
/**
 * Re-cut the 2026-09-25 rider/dispatch migrations into small, safe pastes.
 *
 * The Supabase SQL Editor truncates big multi-statement pastes; a cut inside
 * a `$$`-quoted function body ends up executed as top-level SQL and reports
 * a nonsense error such as `42P01: relation "v_order" does not exist`
 * (v_order is a plpgsql variable, not a table). This is the SAME failure the
 * 2026-09-16 pass hit with `relation "v_zone" does not exist` — see the
 * header of scripts/split-paste.mjs.
 *
 *   node scripts/split-paste-20260925.mjs
 *     → writes supabase/paste-parts/20260925-fixes/NN_*.sql (+ README.md)
 *
 * The seven source files are already repeat-safe (the SQL integration test
 * applies every one of them twice), so any part — or the whole set — can be
 * re-pasted without harm. Regular statements travel as readable SQL, one
 * `begin;…commit;` part each, far below the size where the editor cuts.
 * A single statement too big for one safe paste (the two ~6 KB
 * ps_checkout_health builds) travels as BASE64 chunks into `_mig_paste_chunks`
 * plus an assembler that length/md5-checks the payload before CREATE — the
 * exact technique scripts/split-paste.mjs proved with the FINAL ps_place_order.
 */

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const MIG = "supabase/migrations";
const OUT = "supabase/paste-parts/20260925-fixes";

/** Byte budget per readable paste — a fraction of the size where the editor cuts. */
const MAX_PART_BYTES = 4200;
/** A single statement above this travels as base64 chunks instead. */
const MAX_RAW_STATEMENT_BYTES = 4200;
/** Base64 characters per chunk insert (the proven size was 7182). */
const CHUNK_B64_CHARS = 2800;
/** Where the base64 payload lands before the assembler runs. */
const HELPER = "_mig_paste_chunks";

const FILES = [
  "202609250001_area_broadcast_dispatch.sql",
  "202609250002_dispatch_cancel_guard.sql",
  "202609250003_dispatch_withdraw_resume.sql",
  "202609250004_settle_claims.sql",
  "202609250005_delivery_pin_lockout.sql",
  "202609250006_dispatch_health.sql",
  "202609250007_realtime_offers.sql",
  "202609250008_delivery_ratings.sql",
];

const FN = /create or replace function ([a-z0-9_]+)\(/i;

/**
 * Split SQL into statements at top-level `;`, keeping every comment attached
 * to the statement it describes. `$$` (the only quoting these files use)
 * toggles literal mode; `--` comments are skipped so a `;` inside them cannot
 * split.
 */
function splitStatements(sql) {
  const blocks = [];
  let pendingComments = "";
  let current = "";
  let inDollar = false;
  let inLine = false;

  for (const line of sql.split("\n")) {
    let i = 0;
    let broke = false;
    while (i < line.length) {
      const rest = line.slice(i);
      if (inLine) break;
      if (!inDollar && rest.startsWith("--")) {
        inLine = true;
        broke = true;
        break;
      }
      if (rest.startsWith("$$")) {
        inDollar = !inDollar;
        current += "$$";
        i += 2;
        continue;
      }
      if (!inDollar && rest.startsWith(";")) {
        current += ";";
        const block = (pendingComments + current).trimEnd();
        if (block.trim()) blocks.push(block);
        pendingComments = "";
        current = "";
        i += 1;
        broke = true;
        break;
      }
      current += line[i];
      i += 1;
    }
    if (inLine) {
      pendingComments += line + "\n";
      inLine = false;
    } else if (!broke) {
      current += "\n";
    }
  }
  const tail = (pendingComments + current).trimEnd();
  if (tail.trim()) blocks.push(tail);
  return blocks;
}

const stripNoise = (s) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, "");

for (const f of FILES) {
  const source = readFileSync(join(MIG, f), "utf8");
  const blocks = splitStatements(source);
  if ((blocks.join("\n").match(/\$\$/g)?.length ?? 0) !== (source.match(/\$\$/g)?.length ?? 0)) {
    throw new Error(`${f}: $$ balance changed while splitting`);
  }
  if (stripNoise(blocks.join("\n")) !== stripNoise(source)) {
    throw new Error(`${f}: statement split did not round-trip byte-wise`);
  }
  console.log(`${f}: ${blocks.length} statements, $$ balanced, round-trip OK`);
}

/** Drop a file's own outer begin/commit — every part gets a fresh one. */
const withoutTx = (blocks) => {
  const inner = [...blocks];
  const isTx = (b) => ["begin;", "commit;"].includes(stripNoise(b));
  while (inner.length && isTx(inner[0])) inner.shift();
  while (inner.length && isTx(inner[inner.length - 1])) inner.pop();
  if (!inner.length) throw new Error("a file lost all statements after begin/commit strip");
  return inner;
};

const shortName = (file) => file.replace(/^20260925(0001|0002|0003|0004|0005|0006|0007)_/, "").replace(/\.sql$/, "");

// ---------------------------------------------------------------------------
// Pass 1 — per file, a list of units: readable statements + base64 statements
// ---------------------------------------------------------------------------
const units = []; // {kind:'sql'|'b64', block, fn?, file}
for (const file of FILES) {
  for (const block of withoutTx(splitStatements(readFileSync(join(MIG, file), "utf8")))) {
    if (block.length > MAX_RAW_STATEMENT_BYTES) {
      const fn = block.match(FN)?.[1];
      if (!fn) throw new Error(`${file}: oversized statement is not a function — cannot base64 it`);
      // The payload must be exactly the CREATE statement (the assembler
      // checks it starts that way) — leading comment banners stay out.
      const statement = block.replace(/^(\s*--[^\n]*\n)+/, "").trimStart();
      units.push({ kind: "b64", block: statement, fn, file });
    } else {
      units.push({ kind: "sql", block, file });
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — pack units into paste files
// ---------------------------------------------------------------------------
const pastes = []; // {file, source, sql}

const flushSql = (bucket) => {
  if (!bucket.length) return;
  pastes.push({
    source: bucket[0].file,
    sql: `begin;\n\n${bucket.map((u) => u.block).join("\n\n")}\n\ncommit;\n`,
  });
};

{
  let bucket = [];
  let size = 0;
  let currentFile = null;
  for (const unit of units) {
    if (unit.file !== currentFile) {
      // Never mix two migrations in one paste — labels stay truthful.
      flushSql(bucket);
      bucket = [];
      size = 0;
      currentFile = unit.file;
    }
    if (unit.kind === "b64") {
      flushSql(bucket);
      bucket = [];
      size = 0;
      // chunks + assembler, immediately in sequence
      const b64 = Buffer.from(unit.block, "utf8").toString("base64");
      const md5 = createHash("md5").update(unit.block, "utf8").digest("hex");
      const chunks = [];
      for (let i = 0; i < b64.length; i += CHUNK_B64_CHARS) chunks.push(b64.slice(i, i + CHUNK_B64_CHARS));
      chunks.forEach((chunk, i) => {
        const pre =
          i === 0
            ? `begin;\n\ncreate table if not exists ${HELPER} (\n  id   text not null,\n  seq  int  not null,\n  body text not null,\n  primary key (id, seq)\n);\nalter table ${HELPER} enable row level security;\ndrop policy if exists "paste chunks" on ${HELPER};\ncreate policy "paste chunks" on ${HELPER} for all using (true) with check (true);\ndelete from ${HELPER} where id = '${unit.fn}';  -- a re-run starts clean\n\n`
            : "";
        pastes.push({
          source: unit.file,
          label: `${unit.fn} chunk ${i + 1}/${chunks.length}`,
          // Every chunk part commits its own insert — a part without commit
          // rolls back when the editor session ends and the next chunk then
          // finds no helper table.
          sql: `${pre}insert into ${HELPER} (id, seq, body) values ('${unit.fn}', ${i + 1},\n'${chunk}');\n\ncommit;\n`,
        });
      });
      const lengths = chunks.map((c) => c.length);
      pastes.push({
        source: unit.file,
        label: `${unit.fn} assembler`,
        sql: `begin;\n\ndo $$\ndeclare\n  v_b64   text;\n  v_src   text;\n  v_short text;\nbegin\n  select string_agg(body, '' order by seq) into v_b64 from ${HELPER} where id = '${unit.fn}';\n  if v_b64 is null then\n    raise exception '${unit.fn}: paste the chunk parts first';\n  end if;\n  select string_agg(x.seq::text, ', ' order by x.seq) into v_short\n  from (\n    select e.seq, e.expected, length(regexp_replace(c.body, '[^A-Za-z0-9+/=]', '', 'g')) as got\n    from unnest(array[${lengths.join(",")}]) with ordinality as e(expected, seq)\n    left join ${HELPER} c on c.id = '${unit.fn}' and c.seq = e.seq\n  ) x\n  where coalesce(x.got, -1) <> x.expected;\n  if v_short is not null then\n    raise exception '${unit.fn}: chunk % did not land intact — re-paste just that part and run this again', v_short;\n  end if;\n\n  v_b64 := regexp_replace(v_b64, '[^A-Za-z0-9+/=]', '', 'g');\n  v_src := convert_from(decode(v_b64, 'base64'), 'UTF8');\n  if md5(v_src) <> '${md5}' then\n    raise exception '${unit.fn}: checksum mismatch (md5 %) — a chunk was corrupted', md5(v_src);\n  end if;\n  if strpos(v_src, 'create or replace function ${unit.fn}') <> 1 then\n    raise exception '${unit.fn}: decoded text does not start with the CREATE statement';\n  end if;\n\n  -- plpgsql binds late: refuse the swap if a column the function reads is missing.\n  if not exists (\n    select 1 from information_schema.columns\n    where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_code_locked_until'\n  ) then\n    raise exception '${unit.fn}: orders.delivery_code_locked_until missing — run the delivery_pin_lockout parts first';\n  end if;\n\n  execute v_src;\n  raise notice '${unit.fn} replaced — % characters, md5 ${md5}', length(v_src);\nend $$;\n\ndrop table if exists ${HELPER};\n\ncommit;\n`,
      });
      continue;
    }
    if (size && size + unit.block.length > MAX_PART_BYTES) {
      flushSql(bucket);
      bucket = [];
      size = 0;
    }
    bucket.push(unit);
    size += unit.block.length;
  }
  flushSql(bucket);
}

// ---------------------------------------------------------------------------
// Write parts
// ---------------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const pad = (n) => String(n).padStart(2, "0");
const rows = [];
pastes.forEach((paste, idx) => {
  const label = paste.label ? paste.label.replace(/[^a-zA-Z0-9._-]+/g, "-") : `sql`;
  const name = `${pad(idx + 1)}_${shortName(paste.source)}-${label}.sql`;
  const isB64 = Boolean(paste.label);
  const header = [
    `-- PASTE ${idx + 1}/${pastes.length} · ${name}`,
    `-- Source: supabase/migrations/${paste.source}`,
    isB64
      ? paste.label.includes("assembler")
        ? `-- Assembler: decodes the base64 chunks and CREATEs the function.`
        : `-- Base64 chunk — copy the WHOLE insert; nothing may be dropped.`
      : `-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.`,
    `-- Repeat-safe: re-running any part is harmless.`,
    ``,
  ].join("\n");
  const bytes = Buffer.byteLength(header + paste.sql);
  if (bytes > 8000) throw new Error(`${name}: part too big for a safe paste (${bytes} bytes)`);
  writeFileSync(join(OUT, name), header + paste.sql);
  rows.push(`| ${pad(idx + 1)} | ${name} | ${paste.source} | ${paste.label ?? "readable SQL"} |`);
  console.log(`wrote ${name} (${bytes} bytes)`);
});

writeFileSync(
  join(OUT, "README.md"),
  `# 2026-09-25 rider/dispatch fixes — safe pastes

The SQL Editor cuts big pastes; a cut inside a function body then runs as
top-level SQL and reports \`ERROR: 42P01: relation "v_order" does not exist\`
(v_order is a plpgsql **variable**, not a table — that error always means a
paste got truncated, never that a migration is wrong).

Paste the ${pastes.length} files here **in order** (01 → ${pad(pastes.length)}), one whole
file per paste, RUN after each. Parts marked **base64 chunk** must land whole
(the assembler refuses to run until every chunk checks out). Every part is
repeat-safe: not sure how far a previous attempt got? Start again from 01.

After the last part, run \`supabase/diagnose.sql\` — rows **37…37i must all
show \`present = true\`**.

| # | paste file | source migration | what |
|---|---|---|---|
${rows.join("\n")}
`,
);
console.log(`\n${pastes.length} parts + README written to ${OUT}`);
