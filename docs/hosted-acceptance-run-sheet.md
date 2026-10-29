# Hosted six-role acceptance — the run sheet

Everything below runs on a **real Supabase project with test accounts**. It is the
one verification that cannot be done from a checkout: local tests use real
PostgreSQL roles and RLS but stub the auth service, and the browser contracts
intercept their API responses. Until this sheet is signed off, "the permission
model works" means "it works against a stubbed auth service".

Nothing here writes to production data. Use one throwaway shop, one throwaway
rider and disposable orders; delete them afterwards.

## 0. Before you start

| Step | Command / action | Expected |
|---|---|---|
| 0.1 | Apply the thirteen migrations in `docs/go-live.md` order | each file answers `OK` |
| 0.2 | `supabase/check-migrations-all.sql` | **0 rows** |
| 0.3 | `GET /api/health` | `permissionProbeReady` … `pickupOverrideReady`, `financeQuorumReady` all `true`, `nextSteps` names no migration |
| 0.4 | `select public.ps_health_probes()` in the SQL editor as the **service role** | 11 keys, all `true` |
| 0.5 | `select public.ps_health_probes()` with the **anon** key | `permission denied for function` (must not be callable from a browser) |

Record the project ref, the date and who ran it. Do not paste keys or PINs into
the record.

## 1. Accounts to create (all disposable)

| Role | How | What it is for |
|---|---|---|
| Shop Owner | Admin → Shops → create + approve | owns the test shop |
| Shop Staff | shop Owner → Team → invite | default grants only |
| Rider | Admin → Riders → create + approve, link a login | own offers/wallet |
| Manager | `npm run grant-admin -- <email> --role manager` | operations, no money |
| Admin | `npm run grant-admin -- <email> --role admin` | approvals + exceptions |
| Super Admin | `npm run grant-admin -- <email> --role super_admin` | platform/security |

Two Admins are needed for the self-dealing rows (the second one decides the
first one's money). Two Staff are needed if you want to check the collusion note
in §7.

## 2. Shop Owner — own business only

| # | Action | Expected |
|---|---|---|
| 2.1 | Shop → Orders: Confirm, then Ready | both succeed; the customer sees the new status |
| 2.2 | Try `/admin/settings` and `/admin/money` | 403 / redirected, no data rendered |
| 2.3 | Try to record a payout for **their own** shop (`/admin/money` → payouts) | refused: *cannot record a payout for your own shop* |
| 2.4 | Approve their own payout request in the DB (`ps_admin_decide_shop_payout`) | must fail — a second Admin has to do it |
| 2.5 | Shop → Team: grant **cashier** to Staff | succeeds; the change appears in the permission audit |
| 2.6 | Shop → Team: grant **finance** or **team** | not offered / refused (Owner-only capabilities) |

## 3. Shop Staff — default three steps, nothing else

| # | Action | Expected |
|---|---|---|
| 3.1 | Orders: Confirm → Preparing → Ready | succeeds **before** any grant |
| 3.2 | Catalog edit / price change | refused until the Owner grants **catalog** |
| 3.3 | Cashier / payment verification | refused until the Owner grants **cashier** |
| 3.4 | Cancel an order | refused until the Owner grants **cancellation** |
| 3.5 | Open a *different* shop's order (URL with its id) | 404/403, no rows |
| 3.6 | `GET /api/admin/orders` with the staff token | must not list other shops |

## 4. Rider — own work only

| # | Action | Expected |
|---|---|---|
| 4.1 | Accept an offer, mark pickup, mark delivered **with** the customer PIN | succeeds |
| 4.2 | Mark delivered with a wrong PIN five times | locked 15 minutes, no status change |
| 4.3 | `/rider/earnings` | own wallet only |
| 4.4 | `select earnings_balance from riders` via REST with the rider token | **denied** (`permission denied`) |
| 4.5 | `select earnings_balance from ps_read_riders()` | only own row, other riders absent |
| 4.6 | Approve or adjust their own settlement/claim | refused |

## 5. Manager — operations, no money

| # | Action | Expected |
|---|---|---|
| 5.1 | Dispatch board, rider scorecards, support threads | work |
| 5.2 | Confirm a shop's order from the platform | refused: *shop fulfilment belongs to the shop* (override needs a reason **and** Admin) |
| 5.3 | `/admin/money`, payout decide, rider wallet credit | refused |
| 5.4 | `select * from shop_ledger`, `rider_earnings`, `rider_payout_requests` | **denied** (restrictive policy) |
| 5.5 | Change a staff role | refused |

## 6. Admin and Super Admin — approvals and audited exceptions

| # | Action | Expected |
|---|---|---|
| 6.1 | Confirm a shop's order **with** a 10–300 char reason | succeeds; timeline shows `[Shop fulfilment override] …` and the actor |
| 6.2 | Same, with no reason | refused (*override reason required*) |
| 6.3 | Close a **counter pickup** with the correct PIN | succeeds; note is `Customer PIN verified at Traffic Point` |
| 6.4 | Close a counter pickup with **no** PIN, using *Customer lost the confirmation?* and a reason | succeeds; timeline shows `[Pickup override — PIN not verified] …` + the actor |
| 6.5 | Try 6.4 as **Manager** and as **Shop Owner** | the panel is absent, and the RPC answers `forbidden` if called directly |
| 6.6 | `select delivery_code from orders` as Admin | **denied** — the stored PIN is unreadable at every role |
| 6.7 | Super Admin: change a role | succeeds, audited, last-Super-Admin protected |
| 6.8 | Super Admin: try to grant themselves Super Admin again / delete `staff_role_audit` | refused |
| 6.9 | Admin A approves a payout belonging to Admin A's own rider row | refused (*cannot decide your own money*); **Admin B** succeeds |
| 6.10 | With **Two-Admin rule** off (default): Admin A records a large payout | succeeds alone — today's behaviour, unchanged |
| 6.11 | Set the rule to ৳5,000, then Admin A records a payout above it | refused (*finance quorum required*); nothing is marked paid |
| 6.12 | Admin A presses *Confirm as 2nd Admin*, then records it | still refused — the confirmer cannot also decide |
| 6.13 | Admin B presses *Confirm as 2nd Admin* with the same amount, then Admin A records it | succeeds; the payout is paid and both actors are attributable |
| 6.14 | Set the rule back to 0 | one Admin can decide again immediately |

## 7. Things this sheet deliberately does **not** cover

- **Two people colluding.** The single-actor case is closed. The built-in
  four-eyes control (§6.10–6.14) makes collusion a *recorded, attributable act*
  above the owner's threshold — but it cannot stop two Admins who both intend
  to. The conflict-of-interest declaration remains a policy option in
  `docs/go-live.md`.
- **Realtime, storage, auth-provider quirks** (magic-link delivery, storage CORS).
  Watch the browser console during §2–§6; anything red is a hosted-only finding.
- **Payment gateways.** No real money is moved by any row here.

## 8. Sign-off

```
Project ref:        __________
Date / who:         __________
0.2 rows:           0 / ____________
0.4 keys:           11 / ____________
Failures:           __________  (row number → what happened)
```

Any failure is a real finding: add it to
`docs/audit/shop-rider-permissions-progress-2026-10-25.md` with the row number,
then fix it with a migration, never by hand-editing RLS in the dashboard.
