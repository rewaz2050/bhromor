#!/usr/bin/env node
/**
 * Split the migrations that are TOO BIG TO PASTE into the Supabase SQL Editor
 * into small parts that can be pasted one by one.
 *
 * THE EDITOR SPLITS ON `;` AND ONLY KNOWS `$$` QUOTING.
 * Confirmed the hard way: a first version of this wrapped each chunk in a
 * custom tag ($c1$ … $c4$). Chunk 1 ran (it happens to contain the function's
 * own `as $$`, which switched the editor's splitter into "inside a dollar
 * quote" mode and protected the rest of the paste); chunk 2 contains no `$$`
 * at all, so the editor cut it at every `;` and tried to RUN the function's
 * text as SQL — `ERROR: 42P01: relation "v_zone" does not exist` (v_zone is a
 * plpgsql variable on line 3 of that chunk). So every literal here is wrapped
 * in plain `$$`, and the assembled function's own quoting is written `$fn$`
 * instead of `$$` (an arbitrary tag: prosrc — the stored body — is identical,
 * verified below). The `do` block in the assembler is `$$` for the same reason.
 *
 *   node scripts/split-paste.mjs        # writes supabase/paste-parts/NN_*.sql
 *
 * Why this is not just "cut the file in half":
 *
 * 1. FOUR of the pending files re-create the SAME function (ps_place_order),
 *    each one a strict superset of the previous:
 *      202609130008 (growth)  373 lines  → superseded
 *      202609140004 (wallet)  402 lines  → superseded
 *      202609140008 (return)  444 lines  → superseded (the WHOLE file)
 *      202609140015 (plus)    463 lines  → FINAL, the only one worth pasting
 *    Verified by diff: each version only ADDS lines to the previous one, so
 *    applying the last version is identical to applying all four in order.
 *    Same story for ps_advance_order / ps_verify_payment: 202609140004 creates
 *    them and 202609140007 re-creates both with additions — so only the 0007
 *    file (171 lines, pastes fine on its own) is needed.
 *    That removes ~1,220 lines of pointless pasting.
 *
 * 2. The FINAL ps_place_order is ONE SQL statement of 463 lines and it cannot be
 *    cut in half, so it travels as BASE64: 4 chunks into a helper table
 *    (_mig_paste_chunks), then the last part decodes, md5-checks and EXECUTEs
 *    the CREATE. Base64 because the SQL Editor splits a paste into statements
 *    itself and only ever recognised the plain dollar-dollar tag — readable SQL
 *    arrived there in pieces and got executed ("relation v_zone does not
 *    exist"), and even a dollar-dollar wrapper left the payload to chance (the
 *    chunks landed several times too long). The base64 alphabet holds no
 *    semicolon, quote, dollar sign or double dash, so nothing can cut inside
 *    it, and the md5 proves the installed body is byte-identical to the file.
 *    The assembler also refuses if a column/table the function needs is
 *    missing, which would otherwise break every checkout quietly (plpgsql
 *    binds late, so the CREATE itself would have succeeded).
 *
 * Every part is its own begin;…commit; and every statement in them is
 * idempotent (IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS), so re-running a
 * part — or the whole set — is safe.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIG = "supabase/migrations";
const OUT = "supabase/paste-parts";
const FN_ID = "ps_place_order";
const HELPER = "_mig_paste_chunks";

const read = (p) => readFileSync(p, "utf8");
const slice = (file, from, to) =>
  read(join(MIG, file)).split("\n").slice(from - 1, to).join("\n");

// ---------------------------------------------------------------------------
// What the plan actually needs
// ---------------------------------------------------------------------------
const GROWTH = "202609130008_growth_promos_gift_referral.sql";
const WALLET = "202609140004_wallet_payments.sql";
const RETURN = "202609140008_return_order_restore.sql";
const PLUS = "202609140015_plus_membership.sql";
const REMAINING = "202609090017_delivery_remaining.sql";

// line ranges were read off the files (grep -n on the statement starts)
const BLOCKS = {
  growthDdl: { file: GROWTH, from: 22, to: 96 }, // tables + orders columns + RLS
  creditReferrer: { file: GROWTH, from: 475, to: 538 }, // ps_credit_referrer
  walletDdl: { file: WALLET, from: 20, to: 32 }, // payment columns + constraint
  plusDdl: { file: PLUS, from: 21, to: 49 }, // memberships + orders.is_plus + RLS
  finalFn: { file: PLUS, from: 52, to: 518 }, // THE ps_place_order (one statement)
  returnCols: { file: REMAINING, from: 5, to: 9 }, // contingency, see part 00b
};

// ---------------------------------------------------------------------------
// Derive what the final function needs at RUNTIME (plpgsql binds late, so a
// missing column would not fail the CREATE — it would fail every checkout).
// ---------------------------------------------------------------------------
const createdTables = new Set();
for (const f of [
  "supabase/schema.sql",
  ...readdirSync(MIG).filter((n) => n.endsWith(".sql")).map((n) => join(MIG, n)),
]) {
  const t = read(f);
  for (const m of t.matchAll(
    /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi,
  )) createdTables.add(m[1].toLowerCase());
  for (const m of t.matchAll(
    /create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi,
  )) createdTables.add(m[1].toLowerCase());
}

function requirements(fnText) {
  const tables = new Set();
  for (const m of fnText.matchAll(/\b(?:from|join|update|into)\s+([a-z_][a-z0-9_]*)/gi)) {
    const n = m[1].toLowerCase();
    if (createdTables.has(n)) tables.add(n);
  }
  for (const m of fnText.matchAll(/\b([a-z_][a-z0-9_]*)%rowtype/gi)) {
    const n = m[1].toLowerCase();
    if (createdTables.has(n)) tables.add(n);
  }
  const ins = fnText.match(/insert\s+into\s+orders\s*\(([^)]*)\)\s*values/is);
  const orderCols = ins
    ? [...new Set(ins[1].split(",").map((s) => s.trim()).filter(Boolean))]
    : [];
  return { tables: [...tables].sort(), orderCols };
}

const fnText = slice(BLOCKS.finalFn.file, BLOCKS.finalFn.from, BLOCKS.finalFn.to);
const NEED = requirements(fnText);
const q = (arr) => arr.map((s) => `'${s}'`).join(", ");

// ---------------------------------------------------------------------------
// Comment/string sanitizer — the SQL Editor's splitter is dumber than the server
// ---------------------------------------------------------------------------
// Observed behaviour: it toggles "inside a dollar quote" on the exact tag $$,
// cuts the paste on every ';' outside that, and knows NOTHING about comments or
// strings. So a ';' or a stray $$ sitting in a -- comment is enough to cut a
// part in the wrong place and hand the server a fragment of English prose.
// Outside $$ regions this rewrites comment text to be splitter-inert ('; ' → ',',
// apostrophe → U+02BC, "$$" → the word) and THROWS on a ';' inside a string
// literal, which has to be fixed in the generator instead.
const APO = "\u02bc"; // modifier letter apostrophe — looks like ', is not SQL
function sanitize(text) {
  let out = "";
  let inDollar = false, inComment = false, inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (inDollar) {
      if (two === "$$") { inDollar = false; out += "$$"; i++; continue; }
      out += c; continue;
    }
    if (inComment) {
      if (c === "\n") { inComment = false; out += c; continue; }
      if (two === "$$") { out += "dollar-quoted"; i++; continue; }
      if (c === ";") { out += ","; continue; }
      if (c === "'") { out += APO; continue; }
      out += c; continue;
    }
    if (inQuote) {
      if (text.startsWith("''", i)) { out += "''"; i++; continue; }
      if (c === "'") { inQuote = false; out += c; continue; }
      if (c === ";") {
        throw new Error(`a ';' inside a string literal would be cut by the editor splitter: …${text.slice(Math.max(0, i - 60), i + 20)}…`);
      }
      if (two === "$$") {
        throw new Error(`a "$$" inside a string literal closes the editor dollar-mode early: …${text.slice(Math.max(0, i - 60), i + 20)}…`);
      }
      out += c; continue;
    }
    if (two === "--") { inComment = true; out += two; i++; continue; }
    if (two === "$$") { inDollar = true; out += two; i++; continue; }
    if (c === "'") { inQuote = true; out += c; continue; }
    out += c;
  }
  return out;
}

// A "$" left in a comment outside a dollar region would open a quote for any
// splitter that DOES understand custom tags — so the parts must not have one.
function assertNoDollarInComments(name, text) {
  let inDollar = false, inComment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], two = text.slice(i, i + 2);
    if (inDollar) { if (two === "$$") { inDollar = false; i++; } continue; }
    if (inComment) {
      if (c === "\n") inComment = false;
      else if (c === "$") throw new Error(`${name}: a comment still holds a "$" — ${text.slice(Math.max(0, i - 50), i + 30)}`);
      continue;
    }
    if (two === "--") { inComment = true; i++; continue; }
    if (two === "$$") { inDollar = true; i++; continue; }
    if (c === "'") { while (i < text.length && !(text[i] === "'" && text[i + 1] !== "'")) { if (text[i] === "'" && text[i + 1] === "'") i++; i++; } }
  }
}

// The editor's own (crude) split, used to PROVE a part survives it: outside $$
// it cuts on every ';' and ignores comments/quotes entirely.
function editorSplit(text) {
  const out = [];
  let cur = "", inDollar = false;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith("$$", i)) { inDollar = !inDollar; cur += "$$"; i++; continue; }
    if (text[i] === ";" && !inDollar) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += text[i];
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ---------------------------------------------------------------------------
// Part writer
// ---------------------------------------------------------------------------
// only the generated .sql parts are wiped — README.md and anything else a human
// put in the folder survives a re-run
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".sql")) rmSync(join(OUT, f));
const written = [];
const part = (name, body) => {
  writeFileSync(join(OUT, name), sanitize(body.trimStart() + "\n"));
  written.push(name);
  return name;
};
const TOTAL_PLACEHOLDER = "@@TOTAL@@";
const header = (file, title, note) =>
  `-- PASTE @@N@@/${TOTAL_PLACEHOLDER} · file ${file}\n` +
  `-- ${title}\n` +
  `-- Run the files IN ORDER (00 → 09), one paste each, in the Supabase SQL Editor.\n` +
  (note ? `--\n${note.split("\n").map((l) => `-- ${l}`).join("\n")}\n` : "");

// ---------------------------------------------------------------------------
// 00 — pre-flight: what the FINAL function needs must already exist
// ---------------------------------------------------------------------------
part("00_preflight-check.sql", `${header(
  "00_preflight-check.sql",
  "PRE-FLIGHT (read-only — changes nothing)",
  `The last paste swaps in the FINAL ps_place_order (from ${PLUS}). It writes
orders columns that earlier migrations added, and plpgsql binds LATE: a missing
column would not fail the CREATE — it would fail every checkout afterwards.
So run this first: every row must say present = true (false rows sort to the
top). orders.is_return / return_status missing? → paste 00b too. Anything else
missing → apply that migration first (docs/go-live.md step list) or ask me to
split it the same way.`,
)}
select 'table' as kind, x.name as object,
       exists (select 1 from information_schema.tables t
               where t.table_schema = 'public' and t.table_name = x.name) as present
from unnest(array[${q(NEED.tables)}]) as x(name)
union all
select 'orders column' as kind, x.name as object,
       exists (select 1 from information_schema.columns c
               where c.table_schema = 'public'
                 and c.table_name = 'orders' and c.column_name = x.name) as present
from unnest(array[${q(NEED.orderCols)}]) as x(name)
order by present, kind, object;
`);

// ---------------------------------------------------------------------------
// 00b — contingency: the return columns (only if the pre-flight asked for them)
// ---------------------------------------------------------------------------
part("00b_only-if-return-columns-missing.sql", `${header(
  "00b_only-if-return-columns-missing.sql",
  "OPTIONAL — ONLY if the pre-flight listed orders.is_return / return_status",
  `Source: ${REMAINING} lines ${BLOCKS.returnCols.from}–${BLOCKS.returnCols.to}
(that file is 350 lines; this is the only piece the FINAL function needs from
it — its own ps_place_order is superseded). If the pre-flight said NOTHING
MISSING, SKIP this part.`,
)}
begin;

${slice(BLOCKS.returnCols.file, BLOCKS.returnCols.from, BLOCKS.returnCols.to)}

commit;
`);

// ---------------------------------------------------------------------------
// 01–04 — the small, statement-sized pieces of the three big files
// ---------------------------------------------------------------------------
part("01_step15a_growth-tables-columns-rls.sql", `${header(
  "01_step15a_growth-tables-columns-rls.sql",
  `go-live step 15a — ${GROWTH}`,
  `Lines ${BLOCKS.growthDdl.from}–${BLOCKS.growthDdl.to}: price_watches, referral_codes,
referral_rewards, the gift/promo/referral columns on orders, and their RLS.
The file's own ps_place_order (lines 98–473) is SKIPPED ON PURPOSE — steps 19,
23 and 30 each re-create it and the step-30 version (part 05–09) is a strict
superset of all of them.`,
)}
begin;

${slice(BLOCKS.growthDdl.file, BLOCKS.growthDdl.from, BLOCKS.growthDdl.to)}

commit;
`);

part("02_step15b_ps-credit-referrer.sql", `${header(
  "02_step15b_ps-credit-referrer.sql",
  `go-live step 15b — ${GROWTH}`,
  `Lines ${BLOCKS.creditReferrer.from}–${BLOCKS.creditReferrer.to}: ps_credit_referrer(order_id) —
mints the referrer's coupon when the friend's order is delivered. Only defined
here, never re-created later, so it is NOT skippable.`,
)}
begin;

${slice(BLOCKS.creditReferrer.file, BLOCKS.creditReferrer.from, BLOCKS.creditReferrer.to)}

commit;
`);

part("03_step19_wallet-payment-columns.sql", `${header(
  "03_step19_wallet-payment-columns.sql",
  `go-live step 19 — ${WALLET}`,
  `Lines ${BLOCKS.walletDdl.from}–${BLOCKS.walletDdl.to}: orders.payment widened to cod|bkash|nagad
+ payment_ref / payment_status / payment_verified_at.
That file's three functions are SKIPPED ON PURPOSE: its ps_place_order is
superseded by step 30 (part 05–09), and its ps_advance_order / ps_verify_payment
are superseded by ${"202609140007_wallet_cancel_payment_settle.sql"} (171 lines —
paste that whole file normally, it is go-live step 22).`,
)}
begin;

${slice(BLOCKS.walletDdl.file, BLOCKS.walletDdl.from, BLOCKS.walletDdl.to)}

commit;
`);

part("04_step30a_plus-memberships-table.sql", `${header(
  "04_step30a_plus-memberships-table.sql",
  `go-live step 30a — ${PLUS}`,
  `Lines ${BLOCKS.plusDdl.from}–${BLOCKS.plusDdl.to}: the memberships ledger, orders.is_plus,
and the admin-only RLS on memberships. Must exist BEFORE the FINAL
ps_place_order is created (it reads memberships and writes is_plus).`,
)}
begin;

${slice(BLOCKS.plusDdl.file, BLOCKS.plusDdl.from, BLOCKS.plusDdl.to)}

commit;
`);

// ---------------------------------------------------------------------------
// 05…08 — the FINAL ps_place_order, carried as base64
// ---------------------------------------------------------------------------
// Two attempts at pasting the function as readable SQL both died in the SQL
// Editor. A custom dollar tag is invisible to its statement splitter, so the
// function text was RUN as SQL ("relation v_zone does not exist"), and even a
// plain two-dollar-sign wrapper still left the payload at the mercy of how the
// editor pairs tags and quotes — the chunks landed several times too long.
//
// Base64 ends the argument. The alphabet is A-Za-z0-9+/= : no semicolon, no
// quote, no dollar sign, no double dash. NOTHING a splitter looks for occurs
// inside the payload, so no splitter however naive can cut it, and the payload
// needs no escaping of its own. What is installed is therefore byte-identical
// to the migration file — no tag swapping, no comment rewriting, nothing
// hand-edited — and the assembler proves it with an md5 checksum before it runs.
const PAYLOAD = fnText; // the exact statement, dollar quoting and all
const PAYLOAD_BYTES = Buffer.from(PAYLOAD, "utf8");
const PAYLOAD_CHARS = [...PAYLOAD].length; // PG length() counts characters
const PAYLOAD_MD5 = createHash("md5").update(PAYLOAD_BYTES).digest("hex");
// prosrc — what PostgreSQL stores — is the text between the two dollar tags
const PROSRC = PAYLOAD.slice(PAYLOAD.indexOf("$$") + 2, PAYLOAD.lastIndexOf("$$"));
const PROSRC_MD5 = createHash("md5").update(Buffer.from(PROSRC, "utf8")).digest("hex");

const B64 = PAYLOAD_BYTES.toString("base64");
const B64_CHUNKS = 4;
const wrap = (s) => {
  const out = [];
  for (let i = 0; i < s.length; i += 100) out.push(s.slice(i, i + 100));
  return out.join("\n");
};
const B64_ONLY = (col) => `length(regexp_replace(${col}, '[^A-Za-z0-9+/=]', '', 'g'))`;
const perChunk = Math.ceil(B64.length / B64_CHUNKS);
const chunks = [];
for (let i = 0; i < B64.length; i += perChunk) chunks.push(wrap(B64.slice(i, i + perChunk)));

const setup = `create table if not exists ${HELPER} (
  id   text not null,
  seq  int  not null,
  body text not null,
  primary key (id, seq)
);
alter table ${HELPER} enable row level security;
drop policy if exists "paste chunks" on ${HELPER};
create policy "paste chunks" on ${HELPER} for all using (true) with check (true);
delete from ${HELPER} where id = '${FN_ID}';  -- a re-run starts clean`;

chunks.forEach((body, i) => {
  const isFirst = i === 0;
  const isLast = i === chunks.length - 1;
  const name = `0${5 + i}_step30b_fn-chunk-${i + 1}of${chunks.length}.sql`;
  part(name, `${header(
  name,
  `go-live step 30b — FINAL ps_place_order, base64 chunk ${i + 1}/${chunks.length}`,
  isFirst
    ? `Payload: ${PLUS} lines ${BLOCKS.finalFn.from}–${BLOCKS.finalFn.to} — ONE 463-line statement,
so it cannot be cut as SQL. Each chunk stores a slice of its BASE64 into
${HELPER}, and paste ${5 + chunks.length} decodes, checksums and runs the CREATE.
Nothing is created until that last paste.
Why base64: the SQL Editor cuts a paste into statements itself and does not
understand dollar tags or comments, so readable SQL arrived there in pieces and
was executed. The base64 alphabet holds no semicolon, no quote, no dollar sign
and no double dash, so there is nothing for a splitter to cut on.
Copy the block as it is. Line breaks inside it do not matter (they are stripped
before decoding), but nothing may be dropped: this chunk must land as
${B64.slice(i * perChunk, (i + 1) * perChunk).length} base64 characters, and the assembled payload must
decode to ${PAYLOAD_CHARS} characters with md5 ${PAYLOAD_MD5}.`
    : `Base64 chunk ${i + 1} of ${chunks.length} — must land as ${B64.slice(i * perChunk, (i + 1) * perChunk).length} base64 characters (line
breaks do not matter, missing characters do). The reason for base64 is on
chunk 1 and in the README.`,
)}
begin;

${isFirst ? setup + "\n\n" : ""}insert into ${HELPER} (id, seq, body) values ('${FN_ID}', ${i + 1}, '${body}')
on conflict (id, seq) do update set body = excluded.body;  -- re-pasting is safe

commit;

select seq, ${B64_ONLY("body")} as b64_chars from ${HELPER} where id = '${FN_ID}' order by seq;${
  isLast ? `\n-- expect ${chunks.map((c, k) => `${k + 1}=${c.replace(/[^A-Za-z0-9+/=]/g, "").length}`).join(", ")}` : ""
}
`);
});

// ---------------------------------------------------------------------------
// 09 — decode, checksum, guard, execute, verify
// ---------------------------------------------------------------------------
part(`0${5 + chunks.length}_step30b_fn-assemble-and-create.sql`, `${header(
  `0${5 + chunks.length}_step30b_fn-assemble-and-create.sql`,
  "go-live step 30b — decode the chunks and CREATE the FINAL ps_place_order",
  `Runs only if all ${chunks.length} chunks landed at their exact lengths, the decoded text
is ${PAYLOAD_CHARS} characters with md5 ${PAYLOAD_MD5}, and every
table and orders column the function touches exists. Then it EXECUTEs the
CREATE OR REPLACE and drops the helper table.`,
)}
begin;

do $$
declare
  v_chunks  int;
  v_b64     text;
  v_src     text;
  v_short   text;
  v_missing text;
begin
  select count(*), string_agg(body, '' order by seq)
    into v_chunks, v_b64
  from ${HELPER}
  where id = '${FN_ID}';

  if coalesce(v_chunks, 0) <> ${chunks.length} then
    raise exception 'expected ${chunks.length} chunks of ${FN_ID}, found % — paste parts 05 to 08 first',
      coalesce(v_chunks, 0);
  end if;

  -- name the chunk that did not land, so the fix is exactly one re-paste
  select string_agg(x.seq::text, ', ' order by x.seq) into v_short
  from (
    select e.seq, e.expected, ${B64_ONLY("c.body")} as got
    from unnest(array[${chunks.map((c) => c.replace(/[^A-Za-z0-9+/=]/g, "").length).join(", ")}])
           with ordinality as e(expected, seq)
    left join ${HELPER} c on c.id = '${FN_ID}' and c.seq = e.seq
  ) x
  where coalesce(x.got, -1) <> x.expected;

  if v_short is not null then
    raise exception 'chunk % did not land intact (base64 characters, line breaks ignored) — re-paste just that part, it overwrites cleanly, then run this again',
      v_short;
  end if;

  v_b64 := regexp_replace(v_b64, '[^A-Za-z0-9+/=]', '', 'g');
  v_src := convert_from(decode(v_b64, 'base64'), 'UTF8');

  if length(v_src) <> ${PAYLOAD_CHARS} then
    raise exception 'decoded % characters, expected ${PAYLOAD_CHARS} — the paste was truncated',
      length(v_src);
  end if;

  if md5(v_src) <> '${PAYLOAD_MD5}' then
    raise exception 'checksum mismatch, md5 % — the decoded text is not ${PLUS}', md5(v_src);
  end if;

  if strpos(v_src, 'create or replace function ${FN_ID}') <> 1 then
    raise exception 'the decoded text does not start with the CREATE statement';
  end if;

  -- plpgsql binds late: a missing column would NOT fail the CREATE, it would
  -- fail every checkout afterwards. So refuse the swap instead.
  select string_agg(x.need, ', ' order by x.need) into v_missing
  from (
    select 'table ' || t as need
    from unnest(array[${q(NEED.tables)}]) as t
    where not exists (select 1 from information_schema.tables k
                      where k.table_schema = 'public' and k.table_name = t)
    union all
    select 'orders.' || c
    from unnest(array[${q(NEED.orderCols)}]) as c
    where not exists (select 1 from information_schema.columns k
                      where k.table_schema = 'public'
                        and k.table_name = 'orders' and k.column_name = c)
  ) x;

  if v_missing is not null then
    raise exception 'REFUSING to swap ${FN_ID} — this database is missing: %', v_missing;
  end if;

  execute v_src;
  raise notice '${FN_ID} replaced — % characters, md5 %', length(v_src), md5(v_src);
end $$;

drop table if exists ${HELPER};

commit;

-- verify: the FINAL version carries every era marker, and the stored body
-- checksums against the migration file
select 'installed body is byte-identical to the migration' as check_,
       case when exists (
              select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = '${FN_ID}'
                and md5(p.prosrc) = '${PROSRC_MD5}')
       then 'OK' else 'MISMATCH or not swapped — re-run parts 05 to 09' end as state
union all
select '${FN_ID} is the FINAL version',
       case when exists (
              select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = '${FN_ID}'
                and p.prosrc like '%v_plus%'                     -- step 30 (PLUS waiver)
                and p.prosrc like '%return_parent_id required%'  -- step 23 (returns)
                and p.prosrc like '%pending_verification%'       -- step 19 (wallet)
                and p.prosrc like '%v_ref_credit%'               -- step 15 (referral)
                and p.prosrc like '%v_flash_discount%')          -- step 15 (flash, bundle)
       then 'OK' else 'NOT SWAPPED — re-run parts 05 to 09' end
union all
select 'ps_credit_referrer exists',
       case when exists (select 1 from pg_proc where proname = 'ps_credit_referrer')
       then 'OK' else 'MISSING — run part 02' end
union all
select 'growth tables',
       case when exists (select 1 from information_schema.tables where table_name = 'price_watches')
             and exists (select 1 from information_schema.tables where table_name = 'referral_codes')
             and exists (select 1 from information_schema.tables where table_name = 'referral_rewards')
       then 'OK' else 'MISSING — run part 01' end
union all
select 'wallet columns on orders',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'orders' and column_name = 'payment_status')
       then 'OK' else 'MISSING — run part 03' end
union all
select 'memberships and orders.is_plus',
       case when exists (select 1 from information_schema.tables where table_name = 'memberships')
             and exists (select 1 from information_schema.columns
                         where table_name = 'orders' and column_name = 'is_plus')
       then 'OK' else 'MISSING — run part 04' end
union all
select 'helper table dropped',
       case when not exists (select 1 from information_schema.tables where table_name = '${HELPER}')
       then 'OK' else 'STILL THERE — run: drop table ${HELPER}' end
order by 1;
`);

// ---------------------------------------------------------------------------
// fix up the "PART n/N" headers now that N is known
// ---------------------------------------------------------------------------
const total = written.length;
written.forEach((name, idx) => {
  const text = read(join(OUT, name))
    .replace(/@@N@@/g, String(idx + 1))
    .replace(/@@TOTAL@@/g, String(total));
  writeFileSync(join(OUT, name), text);
  console.log(
    `✓ ${OUT}/${name}  ${String(text.split("\n").length).padStart(4)} lines  ` +
      `${String(Math.round([...text].length / 1024)).padStart(3)} KB`,
  );
});

// lexical guard: every emitted part must be balanced (quotes, dollar tags,
// parens, comments) — a truncated paste is exactly what this catches, and it is
// the one failure mode the SQL Editor reports as a confusing syntax error.
function lexCheck(name, text) {
  let i = 0, depth = 0, stmts = 0, quote = null, dollar = null, comment = null;
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2);
    if (comment === "line") { if (c === "\n") comment = null; i++; continue; }
    if (comment === "block") { if (two === "*/") { comment = null; i += 2; continue; } i++; continue; }
    if (quote === "'") {
      if (two === "''") { i += 2; continue; }
      if (c === "'") quote = null;
      i++; continue;
    }
    if (dollar) {
      if (text.startsWith(dollar, i)) { const len = dollar.length; dollar = null; i += len; continue; }
      i++; continue;
    }
    if (two === "--") { comment = "line"; i += 2; continue; }
    if (two === "/*") { comment = "block"; i += 2; continue; }
    if (c === "'") { quote = "'"; i++; continue; }
    const dm = text.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dm) { dollar = dm[0]; i += dm[0].length; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === ";" && depth === 0) stmts++;
    i++;
  }
  const problems = [];
  if (quote) problems.push("unterminated ' string");
  if (dollar) problems.push(`unterminated ${dollar} quote`);
  if (comment) problems.push("unterminated comment");
  if (depth !== 0) problems.push(`paren depth ${depth}`);
  if (problems.length) throw new Error(`${name}: ${problems.join(", ")}`);
  return stmts;
}
for (const name of written) {
  const text = read(join(OUT, name));
  assertNoDollarInComments(name, text);
  const n = lexCheck(name, text);
  // a trailing comment after the last ';' is its own fragment for the editor's
  // splitter — harmless (an empty query), so it does not count
  const crude = editorSplit(text).filter(
    (piece) => !piece.split("\n").every((l) => l.trim() === "" || l.trim().startsWith("--")),
  ).length;
  if (crude !== n) {
    throw new Error(
      `${name}: the SQL Editor's splitter would cut this into ${crude} pieces, not ${n} — ` +
        `something outside a $$ region still holds a ';' or a '$' apostrophe`,
    );
  }
  console.log(`  ${name} — ${n} statement(s), balanced, survives the editor's splitter`);
}

// the base64 on disk must decode to the migration text, byte for byte
{
  let b64 = "";
  for (let i = 1; i <= chunks.length; i++) {
    const f = written.find((n) => n.includes(`fn-chunk-${i}of`));
    const m = read(join(OUT, f)).match(
      /values \('ps_place_order', \d+, '([\s\S]*?)'\)\non conflict/,
    );
    if (!m) throw new Error(`${f}: could not find the chunk literal`);
    b64 += m[1];
  }
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  if (clean !== B64) throw new Error("the base64 on disk is not the base64 that was generated");
  const decoded = Buffer.from(clean, "base64").toString("utf8");
  if (decoded !== PAYLOAD) throw new Error("the on-disk base64 does not decode to the migration text");
  const md5 = (t) => createHash("md5").update(Buffer.from(t, "utf8")).digest("hex");
  if (md5(decoded) !== PAYLOAD_MD5) throw new Error("payload md5 mismatch");
  if (md5(PROSRC) !== PROSRC_MD5) throw new Error("prosrc md5 mismatch");
  console.log(
    `  on-disk base64 re-verified: ${clean.length} chars → ${PAYLOAD_CHARS} characters of ${FN_ID}, md5 ${PAYLOAD_MD5}`,
  );
  console.log(`  prosrc (what PostgreSQL stores) md5 ${PROSRC_MD5} — the verify query checks this`);
}

console.log(
  `\n${chunks.length} base64 chunks + 1 assembler carry ${FN_ID} from ${PLUS} lines ${BLOCKS.finalFn.from}–${BLOCKS.finalFn.to}`,
);
console.log(`skipped on purpose: 3 superseded ${FN_ID} versions + ${RETURN} (whole file)`);
