// The two wallet follow-up migrations (go-live steps 21 and 22) are small — 83
// and 171 lines, three functions in total — and they still did not land when
// pasted as readable SQL. Same channel that finally worked for ps_place_order:
// BASE64 + md5. The SQL Editor cuts a paste into statements itself and does not
// reliably store what was pasted, so these parts carry the exact statement text
// as base64 and the last part proves the checksum before it runs anything.
//
//   node scripts/fn-base64-parts.mjs
//
// Writes supabase/paste-parts/wallet-followups/01…04 (+ README) and refuses to
// write unless every part is lexically sound, survives both splitter models, and
// the base64 re-read from disk decodes to the migration text byte for byte.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "supabase", "paste-parts", "wallet-followups");
const HELPER = "_mig_paste_chunks"; // same helper the ps_place_order parts used
const WRAP = 100; // base64 characters per line
const B64_ONLY = (col) => `length(regexp_replace(${col}, '[^A-Za-z0-9+/=]', '', 'g'))`;

// what to install, in go-live order
const JOBS = [
  { fn: "ps_rider_deliver", step: 21, file: "supabase/migrations/202609140006_wallet_delivery_cash.sql",
    why: "a bKash/Nagad order must credit the rider ZERO cash — the customer already paid the shop wallet at checkout" },
  { fn: "ps_advance_order", step: 22, file: "supabase/migrations/202609140007_wallet_cancel_payment_settle.sql",
    why: "cancelling a pending wallet order records the payment as rejected, and fulfilment stays gated until the shop verifies" },
  { fn: "ps_verify_payment", step: 22, file: "supabase/migrations/202609140007_wallet_cancel_payment_settle.sql",
    why: "the shop Verify / Reject decision — reject cancels the order and releases the stock" },
];

// ---------------------------------------------------------------------------
// lexer: statements, comments, '' strings, dollar tags
// ---------------------------------------------------------------------------
function statements(text) {
  const out = [];
  let cur = "", i = 0, depth = 0, quote = null, dollar = null, comment = null;
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2);
    if (comment === "line") { cur += c; if (c === "\n") comment = null; i++; continue; }
    if (comment === "block") { cur += c; if (two === "*/") { comment = null; cur += "*"; i += 2; continue; } i++; continue; }
    if (quote === "'") { cur += c; if (two === "''") { cur += "'"; i += 2; continue; } if (c === "'") quote = null; i++; continue; }
    if (dollar) { cur += c; if (text.startsWith(dollar, i)) { cur += dollar.slice(1); i += dollar.length; dollar = null; continue; } i++; continue; }
    if (two === "--") { comment = "line"; cur += two; i += 2; continue; }
    if (two === "/*") { comment = "block"; cur += two; i += 2; continue; }
    if (c === "'") { quote = "'"; cur += c; i++; continue; }
    const dm = text.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dm) { dollar = dm[0]; cur += dm[0]; i += dm[0].length; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === ";" && depth === 0) { if (cur.trim()) out.push(cur + ";"); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const norm = (s) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const md5 = (s) => createHash("md5").update(Buffer.from(s, "utf8")).digest("hex");

// drop the leading comment block so the payload starts at the CREATE itself
const trimHead = (s) => s.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");

// the body PostgreSQL stores: the text between the function's dollar tags
function prosrcOf(stmt) {
  const tags = [...stmt.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)?\$/g)];
  if (tags.length < 2) throw new Error("no dollar-quoted body found");
  const open = tags[0][0];
  const from = tags[0].index + open.length;
  const close = stmt.indexOf(open, from);
  if (close < 0) throw new Error(`unterminated ${open}`);
  return stmt.slice(from, close);
}

// ---------------------------------------------------------------------------
// build the payloads straight out of the migration files
// ---------------------------------------------------------------------------
const payloads = JOBS.map((job) => {
  const text = readFileSync(join(ROOT, job.file), "utf8");
  const hits = statements(text).filter((s) => norm(s).startsWith(`create or replace function ${job.fn}(`));
  if (hits.length !== 1) throw new Error(`${job.file}: found ${hits.length} definitions of ${job.fn}, expected 1`);
  const stmt = trimHead(hits[0]).trim();
  const body = prosrcOf(stmt);
  return {
    ...job,
    stmt,
    stmtChars: [...stmt].length,
    stmtMd5: md5(stmt),
    prosrcChars: [...body].length,
    prosrcMd5: md5(body),
    b64: Buffer.from(stmt, "utf8").toString("base64"),
  };
});
for (const p of payloads) {
  p.b64Chars = p.b64.length;
  p.b64Wrapped = p.b64.replace(new RegExp(`.{1,${WRAP}}`, "g"), "$&\n").replace(/\n$/, "");
}

// anything interpolated into a SQL comment must not carry a ';' or a quote —
// that is what made the Editor cut earlier pastes in the wrong place
const cmt = (s) => s.replace(/;/g, ",").replace(/['"]/g, "");

// ---------------------------------------------------------------------------
// parts 01…03 — helper table + one base64 payload each
// ---------------------------------------------------------------------------
const parts = [];
payloads.forEach((p, k) => {
  const n = k + 1;
  const isFirst = n === 1;
  const head = `-- PASTE ${n}/4 · step ${p.step} — ${p.fn}, as base64
-- Run the four files IN ORDER (01 → 04), one paste each, in the Supabase SQL
-- Editor. Nothing is created until paste 04.
--
-- Why base64 and not the readable migration: the Editor cuts a paste into
-- statements itself, and readable SQL has arrived there mangled before — once
-- executed as SQL (relation "v_zone" does not exist), once stored several times
-- too long. The base64 alphabet holds no semicolon, no quote, no dollar sign and
-- no double dash, so there is nothing for a splitter to cut on, and line breaks
-- inside it do not matter because they are stripped before decoding.
--
-- Payload: the ONE statement from ${p.file}
-- that creates ${p.fn} — ${p.stmtChars} characters, md5 ${p.stmtMd5}.
-- ${cmt(p.why)}.
-- This chunk must land as ${p.b64Chars} base64 characters.
`;
  const body = `
begin;

${isFirst ? `create table if not exists ${HELPER} (
  id   text not null,
  seq  int  not null,
  body text not null,
  primary key (id, seq)
);

alter table ${HELPER} enable row level security;

drop policy if exists "paste chunks all" on ${HELPER};
create policy "paste chunks all" on ${HELPER}
  for all using (true) with check (true);

` : ""}insert into ${HELPER} (id, seq, body) values ('${p.fn}', 1, '${p.b64Wrapped}')
on conflict (id, seq) do update set body = excluded.body;  -- re-pasting is safe

commit;

select id, seq, ${B64_ONLY("body")} as b64_chars from ${HELPER} order by id, seq;
-- expect ${payloads.slice(0, n).map((x) => `${x.fn}/1=${x.b64Chars}`).join(", ")}
`;
  parts.push({ name: `${String(n).padStart(2, "0")}_${p.fn.replace(/_/g, "-")}.sql`, text: head + body });
});

// ---------------------------------------------------------------------------
// part 04 — decode, checksum, create, verify
// ---------------------------------------------------------------------------
const expectRows = payloads
  .map((p) => `    ('${p.fn}', ${p.b64Chars}, ${p.stmtChars}, '${p.stmtMd5}', ${p.prosrcChars}, '${p.prosrcMd5}')`)
  .join(",\n");

parts.push({
  name: "04_assemble-and-create.sql",
  text: `-- PASTE 4/4 · decode the base64, prove it, then create the three functions
-- Runs only if all ${payloads.length} payloads landed at their exact length and decode to their
-- exact md5 — so what is installed is byte-identical to the migration files,
-- nothing rewritten. It then re-reads md5(prosrc) from the catalog and prints
-- one row per function.
--
-- Steps 21 and 22 of docs/go-live.md. Both are CREATE OR REPLACE, so re-running
-- is safe. Note that ps_rider_deliver gained a p_proof_url parameter in step 21,
-- which means PostgreSQL keeps the old 2-argument overload beside the new one —
-- that is expected, and the app always calls the 3-argument version.

begin;

do $$
declare
  v_row    record;
  v_b64    text;
  v_src    text;
  v_got    int;
begin
  if to_regclass('public.${HELPER}') is null then
    raise exception 'the helper table does not exist — paste parts 01 to 03 first, one at a time';
  end if;
  select count(*) into v_got from ${HELPER};
  if v_got = 0 then
    raise exception 'the helper table is empty — paste parts 01 to 03 first';
  end if;

  for v_row in
    select * from (values
${expectRows}
    ) as x(fname, b64_chars, stmt_chars, stmt_md5, prosrc_chars, prosrc_md5)
  loop
    select string_agg(body, '' order by seq) into v_b64
    from ${HELPER} where id = v_row.fname;

    if v_b64 is null then
      raise exception '% has no stored payload — paste that part, then run this again', v_row.fname;
    end if;

    v_b64 := regexp_replace(v_b64, '[^A-Za-z0-9+/=]', '', 'g');
    if length(v_b64) <> v_row.b64_chars then
      raise exception '% did not land intact — % base64 characters stored, % expected. Re-paste that part, it overwrites cleanly',
        v_row.fname, length(v_b64), v_row.b64_chars;
    end if;

    v_src := convert_from(decode(v_b64, 'base64'), 'UTF8');
    if length(v_src) <> v_row.stmt_chars then
      raise exception '% decoded to % characters, expected % — the payload was truncated',
        v_row.fname, length(v_src), v_row.stmt_chars;
    end if;
    if md5(v_src) <> v_row.stmt_md5 then
      raise exception '% checksum mismatch, md5 % — the decoded text is not the migration', v_row.fname, md5(v_src);
    end if;
    if position('create or replace function ' || v_row.fname in lower(v_src)) = 0 then
      raise exception '% payload does not start with its CREATE statement', v_row.fname;
    end if;

    execute v_src;
    raise notice '% replaced — % characters, body md5 %', v_row.fname, length(v_src), v_row.prosrc_md5;
  end loop;
end $$;

drop table if exists ${HELPER};

commit;

select x.fname,
       x.step,
       x.expected_body_chars,
       (select string_agg(length(p.prosrc)::text, ', ' order by length(p.prosrc))
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = x.fname)          as installed_chars,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = x.fname)           as overloads,
       case
         when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname = x.fname)
           then 'MISSING'
         when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = x.fname
                         and md5(p.prosrc) = x.expected_body_md5)
           then 'OK — latest body installed'
         else 'WRONG BODY — an older generation is still the newest one found'
       end                                                             as verdict
from (values
${payloads.map((p) => `    ('${p.fn}', ${p.step}, ${p.prosrcChars}, '${p.prosrcMd5}')`).join(",\n")}
) as x(fname, step, expected_body_chars, expected_body_md5)
order by x.step, x.fname;
`,
});

// ---------------------------------------------------------------------------
// guarantees, identical to split-paste.mjs
// ---------------------------------------------------------------------------
function lexCheck(text) {
  let i = 0, depth = 0, stmts = 0, quote = null, dollar = null, comment = null;
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2);
    if (comment === "line") { if (c === "\n") comment = null; i++; continue; }
    if (comment === "block") { if (two === "*/") { comment = null; i += 2; continue; } i++; continue; }
    if (quote === "'") { if (two === "''") { i += 2; continue; } if (c === "'") quote = null; i++; continue; }
    if (dollar) { if (text.startsWith(dollar, i)) { const L = dollar.length; dollar = null; i += L; continue; } i++; continue; }
    if (two === "--") { comment = "line"; i += 2; continue; }
    if (two === "/*") { comment = "block"; i += 2; continue; }
    if (c === "'") { quote = "'"; i++; continue; }
    const dm = text.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dm) { dollar = dm[0]; i += dm[0].length; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth < 0) throw new Error("unbalanced ')'");
    if (c === ";" && depth === 0) stmts++;
    i++;
  }
  if (quote) throw new Error("unterminated string literal");
  if (dollar) throw new Error(`unterminated dollar quote ${dollar}`);
  if (comment) throw new Error("unterminated comment");
  if (depth !== 0) throw new Error(`unbalanced parentheses, depth ${depth}`);
  return stmts;
}
const naiveSplit = (t) => {
  const out = []; let cur = "", d = false;
  for (let i = 0; i < t.length; i++) {
    if (t.startsWith("$$", i)) { d = !d; cur += "$$"; i++; continue; }
    if (t[i] === ";" && !d) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += t[i];
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
const onlyComments = (p) => p.split("\n").every((l) => l.trim() === "" || l.trim().startsWith("--"));

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".sql")) rmSync(join(OUT, f));

for (const part of parts) {
  const stmts = lexCheck(part.text);
  const naive = naiveSplit(part.text).filter((p) => !onlyComments(p));
  if (naive.length !== stmts) {
    throw new Error(`${part.name}: splitter disagreement — lexer sees ${stmts}, the naive editor splitter sees ${naive.length}`);
  }
  for (const line of part.text.split("\n")) {
    const c = line.indexOf("--");
    if (c >= 0 && /[;']/.test(line.slice(c))) throw new Error(`${part.name}: a comment still holds a ';' or quote: ${line.trim()}`);
  }
  // the base64 must be the only thing in its literal, and must decode back exactly
  for (const m of part.text.matchAll(/values \('[a-z_]+', 1, '([\s\S]*?)'\)\non conflict/g)) {
    const clean = m[1].replace(/[^A-Za-z0-9+/=]/g, "");
    const back = Buffer.from(clean, "base64").toString("utf8");
    const job = payloads.find((p) => part.name.includes(p.fn.replace(/_/g, "-")));
    if (!job) throw new Error(`${part.name}: cannot tell which payload this is`);
    if (back !== job.stmt) throw new Error(`${part.name}: the base64 does not decode to ${job.fn}'s statement`);
    if (md5(back) !== job.stmtMd5) throw new Error(`${part.name}: md5 mismatch after decode`);
  }
  writeFileSync(join(OUT, part.name), part.text);
  console.log(`✓ wallet-followups/${part.name}   ${part.text.split("\n").length} lines   ${Math.round(Buffer.byteLength(part.text) / 1024)} KB   ${stmts} statement(s)`);
}

const readme = `# steps 21 + 22 — the wallet follow-ups, as base64

Three functions, pasted in four parts. Same channel that finally worked for
\`ps_place_order\`: the statement text travels as base64, and paste 04 proves the
md5 before it creates anything.

| # | file | what it carries |
|---|---|---|
${payloads.map((p, k) => `| ${k + 1} | \`${parts[k].name}\` | ${k === 0 ? "helper table + " : ""}\`${p.fn}\` (step ${p.step}, ${p.stmtChars} chars)`).join("\n")} |
| 4 | \`04_assemble-and-create.sql\` | decode → md5 → \`EXECUTE\` all three → drop the helper → print a verdict per function |

One paste per file, in order, **Run** after each. Parts 1–3 only store text —
nothing is created until part 4. Every part is idempotent (\`ON CONFLICT … DO
UPDATE\`, \`CREATE OR REPLACE\`), so re-running any of them is safe.

Expected after part 4:

| function | body chars | md5 |
|---|---|---|
${payloads.map((p) => `| \`${p.fn}\` | ${p.prosrcChars} | \`${p.prosrcMd5}\` |`).join("\n")}

\`ps_rider_deliver\` gained a \`p_proof_url\` parameter in step 21, so PostgreSQL
keeps the older 2-argument overload beside the new one. That is expected and
harmless: \`src/lib/db/riders.ts\` always passes all three arguments, and only the
3-argument version can match. The verdict query counts overloads so the state is
visible rather than assumed.

Regenerate with \`node scripts/fn-base64-parts.mjs\` — it re-reads the migration
files, and refuses to write unless every part is lexically balanced, survives
both splitter models, keeps \`;\` and quotes out of comments, and the base64 on
disk decodes back to the statement byte for byte.
`;
writeFileSync(join(OUT, "README.md"), readme);
console.log(`✓ wallet-followups/README.md`);
console.log(
  `\n${payloads.length} functions from steps 21–22: ` +
  payloads.map((p) => `${p.fn} ${p.stmtChars}ch/b64 ${p.b64Chars}`).join(", "),
);
