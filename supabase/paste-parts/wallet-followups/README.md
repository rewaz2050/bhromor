# steps 21 + 22 — the wallet follow-ups, as base64

Three functions, pasted in four parts. Same channel that finally worked for
`ps_place_order`: the statement text travels as base64, and paste 04 proves the
md5 before it creates anything.

| # | file | what it carries |
|---|---|---|
| 1 | `01_ps-rider-deliver.sql` | helper table + `ps_rider_deliver` (step 21, 2323 chars)
| 2 | `02_ps-advance-order.sql` | `ps_advance_order` (step 22, 3042 chars)
| 3 | `03_ps-verify-payment.sql` | `ps_verify_payment` (step 22, 2736 chars) |
| 4 | `04_assemble-and-create.sql` | decode → md5 → `EXECUTE` all three → drop the helper → print a verdict per function |

One paste per file, in order, **Run** after each. Parts 1–3 only store text —
nothing is created until part 4. Every part is idempotent (`ON CONFLICT … DO
UPDATE`, `CREATE OR REPLACE`), so re-running any of them is safe.

Expected after part 4:

| function | body chars | md5 |
|---|---|---|
| `ps_rider_deliver` | 2117 | `9eadbbb709b8a800b85171939461ed2c` |
| `ps_advance_order` | 2843 | `63ddc0164133ef06de57dd0c35f64576` |
| `ps_verify_payment` | 2551 | `728b7e633af09eebc038275f52a796a1` |

`ps_rider_deliver` gained a `p_proof_url` parameter in step 21, so PostgreSQL
keeps the older 2-argument overload beside the new one. That is expected and
harmless: `src/lib/db/riders.ts` always passes all three arguments, and only the
3-argument version can match. The verdict query counts overloads so the state is
visible rather than assumed.

Regenerate with `node scripts/fn-base64-parts.mjs` — it re-reads the migration
files, and refuses to write unless every part is lexically balanced, survives
both splitter models, keeps `;` and quotes out of comments, and the base64 on
disk decodes back to the statement byte for byte.
