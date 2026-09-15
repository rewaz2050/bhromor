# `supabase/paste-parts/` — the too-big-to-paste migrations, pre-split

The Supabase SQL Editor is a browser text editor: the biggest migrations do not
paste reliably into it (the text gets cut, and a cut `$$`-quoted function comes
back as a confusing `syntax error at or near "$"`). This folder holds the four
pending big files re-cut into **11 small pastes**, in order, each one its own
`begin; … commit;`.

Regenerate any time with:

```bash
node scripts/split-paste.mjs
```

The generator prints a lexical balance check per part, and refuses to finish
unless the re-assembled function text is **character-identical** to its source.

## The order

| # | file | paste | what it does |
|---|---|---|---|
| 1 | `00_preflight-check.sql` | 24 lines | read-only: every table/column the FINAL `ps_place_order` writes must already exist |
| 2 | `00b_only-if-return-columns-missing.sql` | 19 lines | **only if** the pre-flight listed `orders.is_return` / `return_status` — the 5 columns from `202609090017` |
| 3 | `01_step15a_growth-tables-columns-rls.sql` | 90 lines | step 15: `price_watches`, `referral_codes`, `referral_rewards`, the gift/promo/referral columns on `orders`, their RLS |
| 4 | `02_step15b_ps-credit-referrer.sql` | 77 lines | step 15: `ps_credit_referrer(order_id)` — mints the referrer's coupon on delivery |
| 5 | `03_step19_wallet-payment-columns.sql` | 29 lines | step 19: `orders.payment` widened to `cod\|bkash\|nagad` + `payment_ref` / `payment_status` / `payment_verified_at` |
| 6 | `04_step30a_plus-memberships-table.sql` | 42 lines | step 30: `memberships` ledger, `orders.is_plus`, admin-only RLS |
| 7 | `05_step30b_fn-chunk-1of4.sql` | 107 lines | helper table + **base64** chunk 1 |
| 8 | `06_step30b_fn-chunk-2of4.sql` | 87 lines | base64 chunk 2 |
| 9 | `07_step30b_fn-chunk-3of4.sql` | 87 lines | base64 chunk 3 |
| 10 | `08_step30b_fn-chunk-4of4.sql` | 88 lines | base64 chunk 4 |
| 11 | `09_step30b_fn-assemble-and-create.sql` | 134 lines | decode → md5 → guards → `EXECUTE` the `CREATE OR REPLACE` → drops the helper → prints 7 checks |

Pastes 1–6 change schema only; checkout keeps working throughout (the running
`ps_place_order` stays the flat-delivery one until paste 11 swaps it). If you
stop halfway, nothing is half-broken: every statement here is idempotent
(`IF NOT EXISTS` / `OR REPLACE` / `DROP … IF EXISTS` / `ON CONFLICT`), so
re-running any paste — or all of them — is safe.

## Why ~1,700 lines of the source files are NOT in here

Four pending files re-create the **same** function, each a strict superset of
the previous (verified by diff — every hunk is an addition or a widening):

```
202609120007_flat_delivery.sql              ps_place_order  (already applied, step 14)
202609130008_growth_promos_gift_referral    ps_place_order  373 lines  → superseded
202609140004_wallet_payments                ps_place_order  402 lines  → superseded
202609140008_return_order_restore           ps_place_order  444 lines  → superseded (the WHOLE file is that one function)
202609140015_plus_membership                ps_place_order  463 lines  → FINAL, the only one worth pasting
```

Applying the last one is identical to applying all four in order, so the three
older bodies (1,219 lines) and the whole of `202609140008_return_order_restore.sql`
are skipped. Same story one level down:

* `202609140004` also creates `ps_advance_order` + `ps_verify_payment`, and
  `202609140007_wallet_cancel_payment_settle.sql` (171 lines — pastes fine as a
  whole file, go-live step 22) re-creates **both** with additions. Only step 22
  is needed; from step 19 only the columns are.
* `ps_credit_referrer` is created once (step 15) and never re-created, so it IS
  included here.

Everything else that is still pending (steps 16–18, 20–22, 24–29) is under 300
lines and pastes as a whole file — see `docs/go-live.md`.

## The chunk loader (pastes 7–11) — base64, on purpose

A `CREATE FUNCTION` is one statement; it cannot be cut in half as SQL. So the
chunks store the statement in `_mig_paste_chunks (id, seq, body)` and paste 11
decodes, checksums and runs it.

The payload is **base64**, not readable SQL, and that is not aesthetics. The SQL
Editor does not hand a paste to PostgreSQL as one string — it cuts it into
statements itself. Two attempts at readable SQL proved how little it takes:

* chunks wrapped in a custom tag (`$c1$ … $c1$`) — the splitter does not know
  custom tags, so it cut the chunk on every `;` *inside the function body* and
  the editor then **ran the function's text as SQL**:
  `ERROR: 42P01: relation "v_zone" does not exist` (`v_zone` is a plpgsql
  variable, third line of that chunk).
* chunks wrapped in plain `$$` — the payload survived, but the editor still did
  not store what was pasted: the assembler reported
  `assembled 114749 of 21247 characters`.

Base64 ends the argument. Its alphabet is `A-Za-z0-9+/=`: no semicolon, no
quote, no dollar sign, no double dash — nothing any splitter looks for, however
naive. Line breaks inside the payload do not matter either (they are stripped
before decoding), so a copy that re-wraps is still correct.

What paste 11 does before it creates anything:

1. all 4 chunks present, each exactly **7,090** base64 characters (line breaks
   excluded) — a failure names the chunk to re-paste;
2. decodes and requires **21,242** characters and
   `md5 = 7d407986fbf6bada85963ffd3024cc7e` — so the statement is
   **byte-identical to `202609140015_plus_membership.sql` lines 52–514**, with
   its original `$$` quoting and comments, nothing rewritten or swapped;
3. every table and every `orders` column the function touches exists. This one
   matters because plpgsql binds late: a missing column would *not* fail the
   `CREATE`, it would fail every checkout afterwards, quietly;
4. `EXECUTE`s the `CREATE OR REPLACE`, drops the helper table, then prints 7
   checks — the first is `md5(prosrc) = a2ef2cc2ae969020c1f519858e168564`, the
   checksum of the body PostgreSQL actually stored.

The helper table has RLS on with one permissive policy (its rows are function
source, no personal data), inserts are `ON CONFLICT … DO UPDATE` so re-pasting a
chunk overwrites it, and paste 11 drops the table. If it is ever left behind:
`drop table _mig_paste_chunks;`.

`scripts/split-paste.mjs` proves all of this before it finishes: it re-lexes
every part, simulates two different statement splitters (one that only knows
`$$`, one that is a proper lexer) and requires both to agree with the real
statement count, refuses a `;`/`'`/`$` left in a comment or a `;`/`$$` left in a
string outside a dollar region, and re-reads the base64 off disk to check that
it decodes to the migration text with the right md5.

## After paste 11

Paste 11 ends with its own 7-row verify (`OK` × 7), the first of which is the
`md5(prosrc)` of the body PostgreSQL stored. Then, for the P2 batch:
`supabase/verify-p2.sql`. For the whole database: `supabase/diagnose.sql`.

## Is it all applied? `99a` and `99b` — read-only

"Did everything land?" should not be a memory question, and for a function that
more than one migration defines, existence proves nothing. Two probes answer it
from the catalog. Both are a single read-only statement; run them any time, in
any order, as often as you like.

* **`99a_whats-applied-probe.sql`** — one row per signature object of each of the
  30 go-live steps, plus a verdict per step: `APPLIED`, `PARTIAL`, `NOT APPLIED`,
  or `nothing to check` (the step only redefines functions or seeds data). Each
  object is credited to the **first** step that creates it, so step 22
  redefining `ps_advance_order` cannot make step 19 look applied. Up to 6
  objects per step are sampled, behaviour-bearing kinds first (table, function,
  view, trigger, column, policy, index); the rows under a verdict name the exact
  object that is missing.
* **`99b_function-versions-probe.sql`** — 6 functions are defined by more than
  one migration, and `ps_place_order` alone has **9 generations** (steps 4, 5,
  10, 12, 14, 15, 19, 23, 30). This compares `md5(prosrc)` of what is installed
  against the newest definition in `supabase/migrations/` and answers `latest`,
  `OUTDATED — installed body is from step NN`, or `MISSING`. That is the only
  reliable way to know which generation is running.

`scripts/probe-applied.mjs` regenerates both from `docs/go-live.md` and the
migration files — it parses every statement with the same lexer, credits objects
to their first author, checksums each function body, and refuses to write if a
part is unbalanced, if a comment still holds a `;` or a quote, or if the two
statement splitters disagree. It also asserts that the `ps_place_order` checksum
it embeds is the one `split-paste.mjs` proves, so the two tools cannot drift.
