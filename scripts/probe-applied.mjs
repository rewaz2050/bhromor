// Build a READ-ONLY probe that answers "which go-live migrations are actually
// applied in this Supabase project?" — one paste, no writes, no risk.
//
// Why this exists: the SQL Editor could not swallow the big migrations, so they
// went in as paste-parts and a few statements were skipped on purpose
// (superseded function versions). After that, nobody can tell from memory which
// of the 30 go-live steps landed — and for a function, "it exists" does not say
// WHICH generation is installed. So this asks the catalog: object existence for
// every step, and a body checksum for every function more than one migration
// defines.
//
//   node scripts/probe-applied.mjs [--dry]
//
// --dry prints the attribution table and writes nothing.
//
// Attribution rule: an object is credited to the FIRST step that creates it, so
// step 22 redefining ps_advance_order does not make step 19 look applied. Each
// step contributes up to MAX_PER_STEP signature objects, behaviour-bearing kinds
// first.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_A = join(ROOT, "supabase", "paste-parts", "99a_whats-applied-probe.sql");
const OUT_B = join(ROOT, "supabase", "paste-parts", "99b_function-versions-probe.sql");
const MAX_PER_STEP = 6;
const DRY = process.argv.includes("--dry");
const PROSRC_MD5_FINAL = "31f48d113cceeb5d3238d000b708932e"; // ps_place_order, step 30 (body as of PR #28)

// ---------------------------------------------------------------------------
// 1. the go-live order, straight out of docs/go-live.md
// ---------------------------------------------------------------------------
const doc = readFileSync(join(ROOT, "docs", "go-live.md"), "utf8");
const section1 = doc.slice(0, doc.indexOf("## 2. Environment"));
const STEPS = [];
for (const line of section1.split("\n")) {
  const m = line.match(/^(\d+)\.\s+(?:\*\*)?`?(supabase\/[^`\s]+\.sql)`?(?:\*\*)?/);
  if (m) STEPS.push({ step: Number(m[1]), file: m[2] });
}
if (STEPS.length < 30) throw new Error(`expected at least 30 go-live steps, found ${STEPS.length}`);
STEPS.forEach((s, k) => { if (s.step !== k + 1) throw new Error(`step numbering gap at ${s.file}`); });

// ---------------------------------------------------------------------------
// 2. statements, with a lexer that knows comments, '' strings and dollar tags
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
    if (c === ";" && depth === 0) { if (cur.trim()) out.push(cur); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const stripComments = (s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, " ");
const norm = (s) => stripComments(s).replace(/\s+/g, " ").trim().toLowerCase();
const md5 = (s) => createHash("md5").update(Buffer.from(s, "utf8")).digest("hex");

// ---------------------------------------------------------------------------
// 3. what does a statement create?  (+ the exact body of a function)
// ---------------------------------------------------------------------------
const RANK = { table: 0, function: 1, view: 2, trigger: 3, column: 4, policy: 5, index: 6 };
const SCHEMA = `(?:public\\.)?`;

function objectsOf(statement) {
  const s = norm(statement);
  const found = [];
  const add = (kind, obj) => { if (obj && !obj.includes("'") && !obj.includes('"')) found.push({ kind, obj }); };

  let m;
  if ((m = s.match(new RegExp(`^create table (?:if not exists )?"?${SCHEMA}"?([a-z0-9_]+)"?`)))) add("table", m[1]);
  if ((m = s.match(new RegExp(`^create (?:or replace )?(?:materialized )?view "?${SCHEMA}"?([a-z0-9_]+)"?`)))) add("view", m[1]);
  if ((m = s.match(new RegExp(`^create (?:or replace )?function "?${SCHEMA}"?([a-z0-9_]+)"?\\s*\\(`)))) add("function", m[1]);
  if ((m = s.match(/^create (?:constraint )?trigger "?([a-z0-9_]+)"?/))) add("trigger", m[1]);
  if ((m = s.match(/^create policy (?:if not exists )?"?([^"]+?)"? on (?:public\.)?"?([a-z0-9_]+)"?/))) add("policy", `${m[2]}.${m[1]}`);
  for (const mm of s.matchAll(/^create (?:unique )?index (?:if not exists |concurrently )+"?[a-z0-9_.]*?([a-z0-9_]+)"? on/gm)) add("index", mm[1]);
  const table = s.match(new RegExp(`^alter table (?:if exists )?(?:only )?"?${SCHEMA}"?([a-z0-9_]+)"?`));
  if (table) for (const mm of s.matchAll(/add column (?:if not exists )?"?([a-z0-9_]+)"?/g)) add("column", `${table[1]}.${mm[1]}`);
  return found;
}

// a DO block hides its DDL in dynamic SQL — scan the raw text for those
function objectsInDynamic(text) {
  const found = [];
  const t = text.toLowerCase();
  for (const mm of t.matchAll(/alter table (?:if exists )?(?:public\.)?([a-z0-9_]+) add column (?:if not exists )?([a-z0-9_]+)/g)) found.push({ kind: "column", obj: `${mm[1]}.${mm[2]}` });
  for (const mm of t.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z0-9_]+)/g)) found.push({ kind: "table", obj: mm[1] });
  for (const mm of t.matchAll(/create (?:or replace )?function (?:public\.)?([a-z0-9_]+)\s*\(/g)) found.push({ kind: "function", obj: mm[1] });
  return found;
}

// the body PostgreSQL would store: the text between the function's dollar tags
function prosrcOf(statement) {
  const tags = [...statement.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)?\$/g)];
  if (tags.length < 2) return null;
  const open = tags[0][0];
  const from = tags[0].index + open.length;
  const close = statement.indexOf(open, from);
  if (close < 0) return null;
  return statement.slice(from, close);
}

// ---------------------------------------------------------------------------
// 4. credit objects to the FIRST step that creates them; collect every function
//    body so a redefined function can be recognised by checksum
// ---------------------------------------------------------------------------
const seen = new Map();
const perStep = new Map();
const fnDefs = new Map(); // name -> [{step, md5, chars}]
const redefines = new Map(); // step -> [names it redefines from an earlier step]

for (const { step, file } of STEPS) {
  const text = readFileSync(join(ROOT, file), "utf8");
  const candidates = [];
  for (const st of statements(text)) {
    const n = norm(st);
    if (n === "begin" || n === "commit") continue;
    const objs = objectsOf(st);
    if (!objs.length && n.startsWith("do ")) candidates.push(...objectsInDynamic(stripComments(st)));
    for (const o of objs) {
      candidates.push(o);
      if (o.kind === "function") {
        const body = prosrcOf(st);
        if (body !== null) {
          const list = fnDefs.get(o.obj) ?? [];
          list.push({ step, md5: md5(body), chars: [...body].length });
          fnDefs.set(o.obj, list);
        }
      }
    }
  }
  const mine = [];
  const re = [];
  for (const o of candidates) {
    const key = `${o.kind}:${o.obj}`;
    if (seen.has(key)) {
      if (o.kind === "function" && !re.includes(o.obj)) re.push(o.obj);
      continue;
    }
    seen.set(key, step);
    mine.push(o);
  }
  mine.sort((a, b) => (RANK[a.kind] - RANK[b.kind]) || a.obj.localeCompare(b.obj));
  perStep.set(step, mine.slice(0, MAX_PER_STEP));
  if (re.length) redefines.set(step, re);
}

// ---------------------------------------------------------------------------
// 5. emit the probe
// ---------------------------------------------------------------------------
const shortName = (file) =>
  file.replace("supabase/migrations/", "").replace("supabase/", "").replace(/\.sql$/, "");
const esc = (s) => s.replace(/'/g, "''");

const objRows = [];
const sampled = [];
for (const { step, file } of STEPS) {
  const all = perStep.get(step) ?? [];
  const short = shortName(file).slice(0, 32);
  const re = redefines.get(step);
  const label = re && !all.length
    ? `${String(step).padStart(2, "0")} ${short} (redefines ${re.join(", ")})`.slice(0, 58)
    : `${String(step).padStart(2, "0")} ${short}`;
  if (!all.length) { objRows.push({ step, label, kind: null, obj: null }); continue; }
  if (all.length === MAX_PER_STEP) sampled.push(step);
  for (const o of all) objRows.push({ step, label, kind: o.kind, obj: o.obj });
}

const OBJECT_VALUES = objRows
  .map((r) =>
    r.kind === null
      ? `    (${r.step}, '${esc(r.label)}', null, null)`
      : `    (${r.step}, '${esc(r.label)}', '${r.kind}', '${esc(r.obj)}')`,
  )
  .join(",\n");

// functions more than one migration defines: existence says nothing, the body does
const multi = [...fnDefs.entries()].filter(([, defs]) => defs.length > 1).sort((a, b) => a[0].localeCompare(b[0]));
const FN_VALUES = multi
  .flatMap(([name, defs]) => defs.map((d) => `    ('${esc(name)}', ${d.step}, '${d.md5}', ${d.chars})`))
  .join(",\n");

const HEAD_A = `-- PROBE A — which go-live migrations are applied? READ-ONLY, changes nothing.
-- One row per signature object, with the verdict for its step:
--
--   APPLIED      every signature object of that step exists
--   PARTIAL      some exist — the rows after the verdict show which are missing
--   NOT APPLIED  none exist — that migration still has to be run
--   nothing to check   the step only redefines functions or seeds data, and
--                      PROBE B covers those
--
-- Objects are credited to the FIRST step that creates them, so step 22
-- redefining ps_advance_order does not make step 19 look applied. Up to
-- ${MAX_PER_STEP} signature objects per step are sampled, behaviour-bearing kinds first
-- (table, function, view, trigger, column, policy, index).
-- Nothing here writes. Run it any time, as often as you like.

`;

const sqlA = `${HEAD_A}with objects (step, name, kind, obj) as (
  values
${OBJECT_VALUES}
),
checked as (
  select o.step, o.name, o.kind, o.obj,
         case
           when o.kind is null then null
           when o.kind = 'table' then exists (
             select 1 from information_schema.tables t
             where t.table_schema = 'public' and t.table_name = o.obj)
           when o.kind = 'view' then exists (
             select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = o.obj and c.relkind in ('v', 'm'))
           when o.kind = 'function' then exists (
             select 1 from pg_proc f join pg_namespace n on n.oid = f.pronamespace
             where n.nspname = 'public' and f.proname = o.obj)
           when o.kind = 'column' then exists (
             select 1 from information_schema.columns c
             where c.table_schema = 'public'
               and c.table_name = split_part(o.obj, '.', 1)
               and c.column_name = split_part(o.obj, '.', 2))
           when o.kind = 'index' then exists (
             select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = o.obj)
           when o.kind = 'policy' then exists (
             select 1 from pg_policies g where g.schemaname = 'public'
               and g.tablename = split_part(o.obj, '.', 1)
               and g.policyname = split_part(o.obj, '.', 2))
           when o.kind = 'trigger' then exists (
             select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
               join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and t.tgname = o.obj and not t.tgisinternal)
           else null
         end as present
  from objects o
)
select step, name,
       case
         when count(obj) = 0 then 'nothing to check'
         when count(obj) = count(obj) filter (where present) then 'APPLIED'
         when count(obj) filter (where present) = 0 then 'NOT APPLIED'
         else 'PARTIAL'
       end                                    as step_verdict,
       count(obj)                             as objects_checked,
       count(obj) filter (where present)      as present_count,
       kind, obj, present                     as this_object
from checked
group by grouping sets ((step, name), (step, name, kind, obj, present))
order by step, (kind is null) desc, present nulls first, kind, obj;
`;

const sqlB = `-- PROBE B — which GENERATION of each redefined function is installed?
-- READ-ONLY, changes nothing. Run PROBE A first.
--
-- ${multi.length} functions are defined by more than one migration, so "it exists" says
-- nothing — the body does. Each row compares md5(prosrc) of what is installed
-- with the NEWEST definition in supabase/migrations:
--
--   latest     the newest body is installed, nothing to do
--   OUTDATED   an older generation is in, and it names the step it came from
--   MISSING    the function does not exist at all
--
-- A signature change leaves the OLD overload behind, because CREATE OR REPLACE
-- matches on argument types — ps_rider_deliver gained p_proof_url in step 21,
-- so a database can legitimately hold two of them. That is why overloads and
-- stale_overloads are printed: the newest body must be in (verdict latest), and
-- a stale overload only matters if something still calls it with the old
-- argument list.
--
-- ps_place_order alone has ${fnDefs.get("ps_place_order").length} generations (steps ${fnDefs.get("ps_place_order").map((d) => d.step).join(", ")})
-- and only the newest is current — that is the one the paste-parts installed, and
-- its body md5 is a2ef2cc2ae969020c1f519858e168564.

with defs (fname, step, body_md5, body_chars) as (
  values
${FN_VALUES}
),
latest as (select fname, max(step) as step from defs group by fname),
installed as (
  select p.proname as fname,
         pg_get_function_identity_arguments(p.oid) as args,
         md5(p.prosrc)    as body_md5,
         length(p.prosrc) as body_chars
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select l.fname,
       d.step                                             as newest_step,
       d.body_chars                                       as expected_chars,
       (select count(*) from installed i where i.fname = l.fname)
                                                          as overloads,
       (select string_agg(i.body_chars::text, ', ' order by i.body_chars)
          from installed i where i.fname = l.fname)        as installed_chars,
       (select count(*) from installed i
         where i.fname = l.fname and i.body_md5 <> d.body_md5)
                                                          as stale_overloads,
       case
         when not exists (select 1 from installed i where i.fname = l.fname)
           then 'MISSING'
         when exists (select 1 from installed i
                       where i.fname = l.fname and i.body_md5 = d.body_md5)
           then 'latest'
         else 'OUTDATED — installed: ' || coalesce(
                (select string_agg(distinct 'step ' || lpad(d2.step::text, 2, '0'), ', ')
                   from defs d2 join installed i2
                     on i2.fname = l.fname and i2.body_md5 = d2.body_md5),
                'a body no migration contains')
       end                                                as verdict
from latest l
join defs d on d.fname = l.fname and d.step = l.step
order by (exists (select 1 from installed i
                   where i.fname = l.fname and i.body_md5 = d.body_md5)), l.fname;
`;

// ---------------------------------------------------------------------------
// 6. the guarantees split-paste.mjs gives every part: lexically sound, and the
//    same statement count under a proper lexer and under a naive splitter
// ---------------------------------------------------------------------------
function lexCheck(text) {
  let i = 0, depth = 0, stmts = 0, quote = null, dollar = null, comment = null;
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2);
    if (comment === "line") { if (c === "\n") comment = null; i++; continue; }
    if (comment === "block") { if (two === "*/") { comment = null; i += 2; continue; } i++; continue; }
    if (quote === "'") { if (two === "''") { i += 2; continue; } if (c === "'") quote = null; i++; continue; }
    if (dollar) { if (text.startsWith(dollar, i)) { dollar = null; i += dollar.length; continue; } i++; continue; }
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

const results = [];
for (const [file, sql] of [[OUT_A, sqlA], [OUT_B, sqlB]]) {
  const stmts = lexCheck(sql);
  const naive = naiveSplit(sql).filter((p) => !onlyComments(p));
  if (naive.length !== stmts) {
    throw new Error(`${file}: splitter disagreement — lexer sees ${stmts} statement(s), the naive editor splitter sees ${naive.length}`);
  }
  for (const line of sql.split("\n")) {
    const c = line.indexOf("--");
    if (c >= 0 && /[;']/.test(line.slice(c))) throw new Error(`${file}: a comment still holds a ';' or quote: ${line.trim()}`);
  }
  results.push([file, sql, stmts]);
}
// the ps_place_order checksum in result set 2 must be the one split-paste proves
const finalDefs = fnDefs.get("ps_place_order") ?? [];
const newest = finalDefs.at(-1);
if (!newest || newest.md5 !== PROSRC_MD5_FINAL) {
  throw new Error(`ps_place_order newest body md5 is ${newest?.md5}, expected ${PROSRC_MD5_FINAL}`);
}

if (DRY) {
  console.log(`go-live steps: ${STEPS.length}   probe object rows: ${objRows.length}`);
  for (const { step, file } of STEPS) {
    const objs = perStep.get(step) ?? [];
    const re = redefines.get(step);
    console.log(
      `${String(step).padStart(2, "0")} ${shortName(file).padEnd(46)} ` +
      (objs.length ? objs.map((o) => `${o.kind}:${o.obj}`).join(", ") : "(nothing unique)") +
      (re ? `   [redefines: ${re.join(", ")}]` : ""),
    );
  }
  console.log(`\nfunctions defined by more than one step (checksummed in result set 2):`);
  for (const [name, defs] of multi) console.log(`   ${name.padEnd(28)} ${defs.map((d) => `step ${String(d.step).padStart(2, "0")}/${d.chars}ch`).join("  ")}`);
  console.log(`\nstatements: ${results.map(([, , n]) => n).join(" + ")}, splitter agreement ✓`);
  console.log(`steps sampled at the ${MAX_PER_STEP}-object cap: ${sampled.join(", ") || "none"}`);
} else {
  mkdirSync(dirname(OUT_A), { recursive: true });
  for (const [file, sql, stmts] of results) {
    writeFileSync(file, sql);
    console.log(`✓ ${file.replace(ROOT + "/", "")}   ${sql.split("\n").length} lines   ${Math.round(Buffer.byteLength(sql) / 1024)} KB   ${stmts} statement(s), balanced, survives both splitter models`);
  }
  console.log(`  ${objRows.length} object rows over ${STEPS.length} steps + ${multi.length} redefined functions checksummed`);
}
