# Bug-fix pass — PROSANTI (bhromor)

Reported: *"menu open hoy na"* + "aro 100 ta bugs ase". This is what was found
and fixed. Everything below is a real defect that was reproducible in the
running app, not a style preference.

`npm run lint`, `npm run typecheck`, `npm test` (98 tests) and `npm run build`
all pass.

---

## 1. The menu bug (root cause)

The site header is `sticky` and uses `backdrop-blur`. **Any element with a
`backdrop-filter` becomes the containing block for its `position: fixed`
descendants**, so the mobile drawer — rendered inside the header — was clipped
to the 64 px header strip. React state flipped correctly; the panel was simply
painted inside an invisible 64 px box. It looked like the menu never opened.

Fix: a new shared `src/components/ui/drawer.tsx` renders through a **portal
into `<body>`**, escaping that containing block for good. It also fixes what
the old drawer never had:

| # | Fix |
|---|-----|
| 1 | Menu renders outside the blurred header (visible again) |
| 2 | `Escape` closes it |
| 3 | Background scroll is locked while open (with scrollbar-width compensation, so the page does not jump) |
| 4 | Focus moves into the panel on open, returns to the trigger on close |
| 5 | `Tab` is trapped inside the dialog |
| 6 | Hamburger exposes `aria-expanded` / `aria-haspopup` / `aria-controls` |
| 7 | Menu auto-closes on navigation (it used to stay open over the next page) |
| 8 | The scrim is a click-away layer hidden from screen readers (it used to be a second, duplicate "Close menu" button) |
| 9 | Desktop nav marks the current page (`aria-current` + underline) |
| 10 | **The admin panel had no mobile navigation at all** — 15 sidebar links stacked above every page. It is a hamburger + drawer below `lg` now |
| 11 | Admin drawer closes on navigation |
| 12 | `/#collections` (and `#story`) landed under the sticky header — `scroll-mt` added |

## 2. Shop & catalog

| # | Fix |
|---|-----|
| 13 | Price bands ignored their **lower** bound — "৳1,000–৳1,500" also matched a ৳390 gamcha. Every band behaved like "under X" |
| 14 | "Newest" sort just reversed the array; it now puts real new arrivals first with a stable secondary order |
| 15 | Filters never reacted to URL changes — from `/shop?category=men`, the header's "New Arrivals" link did nothing |
| 16 | The shop route only recognised three hard-coded category ids, so any category added later silently fell back to "all" |
| 17 | Size filter options were hard-coded → derived from the catalog (ordered XS→XXXL) |
| 18 | Colour filter options were hard-coded → derived from the catalog |
| 19 | The sidebar and drawer copies of the filter panel shared radio-group names and fought over the browser's grouping |
| 20 | The mobile "Filters" button showed an anonymous dot; it now shows how many filters are active |
| 21 | Result count is announced to screen readers (`aria-live`) |
| 22 | "Clear all filters" appears when only a search term is active, and clearing also resets the search |
| 23 | Search now matches the category name too |
| 24 | Mobile filter drawer gained Escape / scroll-lock / focus handling (same `Drawer`) |

## 3. Product page

| # | Fix |
|---|-----|
| 25 | Products without colours produced the variant label `" · L"` (dangling separator) and a mismatched cart line |
| 26 | Gallery thumbnails were keyed by image `src` — repeated images collided as React keys |
| 27 | Gallery index was not clamped; a shorter media list blanked the main image |
| 28 | Quick-add timer fired after unmount (filtering the grid) |
| 29 | Purchase-panel confirmation timer fired after unmount |
| 30 | Missing product media crashed the card (`media[0].src`) |
| 31 | The hover swap image duplicated the alt text for screen readers |
| 32 | "Added to cart" is announced (`role="status"`) |
| 33 | Quantity − is disabled at 1, + is disabled at the maximum |

## 4. Cart, checkout & money

| # | Fix |
|---|-----|
| 34 | The cart invented a flat ৳70 "sample" delivery fee — it now quotes the cheapest **active** zone from the shared store |
| 35 | The cart promised free delivery over ৳2,000; checkout charged the full fee anyway. Both now use one rule (`src/lib/delivery.ts`) |
| 36 | Checkout shows "Free" with the struck-through charge, and how much more unlocks it |
| 37 | Totals are clamped at ≥ 0 (a large fixed coupon could go negative) |
| 38 | The stored order records the charge actually payable (waived delivery included) |
| 39 | Line quantity had no ceiling in the cart (product page capped at 9, cart at nothing) → shared `MAX_LINE_QTY` |
| 40 | Corrupt/legacy `localStorage` cart entries produced `NaN` totals; they are filtered out |
| 41 | Quantity buttons got per-product accessible names, and the quantity is announced |
| 42 | Category-restricted coupons were validated against the whole subtotal — a code for "women" applied to a cart with none |
| 43 | An applied coupon was never re-validated when the cart changed; a stale discount survived onto the order |
| 44 | The coupon success message states the actual amount off |
| 45 | Double-submit race: two submits in the same tick both passed the `submitting` state check → ref guard |
| 46 | The order-placement timer is cleared on unmount |
| 47 | The area datalist wrote `"Kandirpar · Zone A"` into the customer's address record |
| 48 | Phone fields rejected `+8801…` numbers (checkout, tracking, contact) |

## 5. Order tracking

| # | Fix |
|---|-----|
| 49 | The timeline marked the **next** step as "Current" — a pending order claimed it was already being confirmed |
| 50 | Cancelled orders no longer show progress steps, and get an explicit notice |
| 51 | Lookup failed for anyone who typed the `+88` country code |
| 52 | Free delivery displayed as "৳0" |

## 6. Reviews & other forms

| # | Fix |
|---|-----|
| 53 | Review "thanks" timer fired after unmount |
| 54 | The validation error stayed on screen after it was fixed |
| 55 | The newsletter kept the address after subscribing, never re-armed, and did not announce success |

## 7. State stores — the crash / infinite-loop class

`useSyncExternalStore` compares snapshots by identity. A `getSnapshot` that
builds a new object per call makes React re-render forever
("*The result of getServerSnapshot should be cached*").

| # | Fix |
|---|-----|
| 56 | `getZonesServer()` returned a fresh array every call (checkout) |
| 57 | `getNotifsServer()` re-seeded with `Date.now()` every call — loop **and** nondeterministic hydration (admin shell) |
| 58 | `getMedia()` returned a freshly merged array every call (`/admin/media`) |
| 59 | `getMediaServer()` — same |
| 60 | The media base scan was cached forever, so newly added product images never appeared; it is now keyed on the catalog |
| 61 | Store mutations that pass empty lists could wipe that scan |
| 62 | `advanceOrderInStore` wrote to storage and woke every subscriber even for **illegal** transitions (`.map()` always returns a new array, so the old `next !== current` check was always true) |
| 63 | The wishlist did not sync across tabs |
| 64 | The cart did not sync across tabs — two open tabs overwrote each other |

## 8. Admin panel

| # | Fix |
|---|-----|
| 65 | **Inventory data loss**: pressing Save on an untouched row wrote `stock = 0` (`Number(undefined) \|\| 0`) |
| 66 | Inventory drafts are cleared after save; flash timers no longer leak |
| 67 | Coupons: non-numeric minimum/usage values entered the store as `NaN` and rendered "৳NaN" at checkout |
| 68 | Coupons: an invalid row edit silently did nothing — it now explains why |
| 69 | Coupons: errors raised while editing a row were rendered inside the (closed) "new coupon" panel |
| 70 | Coupons: invalid end dates are rejected |
| 71 | Zones: row inputs kept stale values after "Reset demo zones" |
| 72 | Zones: deleting the last zone asked for confirmation and *then* failed with an alert |
| 73 | Zones: saved-flash timer cleanup |
| 74 | Product editor: duplicate slugs were allowed — two products, one `/product/[slug]` URL |
| 75 | Product editor: duplicate SKUs were allowed |
| 76 | Product editor: an empty SKU saved as `""` and showed as "SKU " in the cart |
| 77 | Product editor: a non-numeric compare-at price saved as `NaN` |
| 78 | Product editor: a compare-at price below the selling price (fake discount) was allowed |
| 79 | Product editor: a blank/zero price was accepted |
| 80 | Product editor: non-numeric stock was accepted |
| 81 | Order detail masked the customer's phone (`017****78`) — staff could not call to confirm a COD order. Full number, `tel:` link |
| 82 | Customers list: same masking problem |
| 83 | Admin header overflowed on small screens (title truncates, hamburger added) |
| 84 | Categories / homepage / media / settings leaked flash timers → shared `useTransientValue` hook |

## 9. Homepage

| # | Fix |
|---|-----|
| 85 | The collections grid listed **every** category — including archived and empty ones — directly contradicting its own copy ("only categories that hold products appear here"). It now filters, and hides itself when nothing qualifies |

---

## 10. Follow-up: admin "This page couldn't load" after login

Same snapshot-identity class as §7, but in the **admin catalog store**, which the
dashboard reads on `/admin` — so login worked and the dashboard instantly
crashed with "Maximum update depth exceeded" (surfaced by Next as *This page
couldn't load. Reload to try again, or go back*).

| # | Fix |
|---|-----|
| 86 | `getCatalog()` returned a fresh `{ products, categories }` object every call → infinite re-render on `/admin` (dashboard) |
| 87 | `getCouponsServer()` re-seeded coupons every call (`/admin/coupons`) |
| 88 | `getReviewsServer()` re-seeded reviews every call (`/admin/reviews`) |

Fixes memoise the snapshot (new identity only on real mutations), with
regression tests in `src/lib/__tests__/store-snapshots.test.ts`.

---

## 11. Live ordering dead-end + account session flip (2026-09-11 report)

Reported (bn): *"order dekhay na — 'Online ordering is not set up yet…' bole
fade; signup shesh holeo signup page-e-i thake; login korle dashboard-e ney
na"*. Three real defects:

| # | Fix |
|---|-----|
| 89 | **Checkout dead-ended whenever Supabase was configured but never seeded** — `/api/orders` answered 503 `NOT_SEEDED` and the customer could not order at all. The route now *self-heals*: it upserts the launch catalog in place (same rows/natural keys as `scripts/seed-supabase.mjs`, derived from `src/lib/catalog.ts` so the two can't drift), then places the order as a **real** DB order. Carts carrying demo ids (`p1…p7`) are bridged to the seeded uuid rows by slug — the same bridge `storefront_saved_items` uses. The seeder only ever writes into a products table with ZERO rows (an all-draft catalog is admin intent and is left alone), and if the database itself refuses (missing schema, outage), the response degrades to `{ demoMode: true }` so the order completes through the browser-local flow — the storefront never shows a "call us to order" wall to a customer holding a filled bag. |
| 90 | **Live signup/login "did nothing"** — the account panel read `customer` from one `useCustomer()` instance while `refresh()` updated a *second* instance's private `useState`. In demo mode both happened to share a store, so it worked locally but froze on the production site: after signup the page stayed on the signup form, and login never flipped to the dashboard. The live session (mode/customer/checked) now lives in the shared observable store in `customer-session.ts` — every consumer (account panel, wishlist provider, smart card, checkout strip) flips together, and the store is snapshot-identity-stable (the §7/§10 class again). |
| 91 | Login now behaves like navigation: on success the panel switches to the signed-in dashboard *in place*, `/account?next=/checkout` (linked from the checkout Smart-Card strip) returns the customer to where they were, a "phone already has an account" error auto-selects the login tab, and a live login whose session doesn't stick reports an honest error instead of a fake "success" with a dead form. |
| 92 | **Cart emptied itself on cutover** — carts hold product ids, and once live rows serve (including the ids seeded by the auto-fix above), demo ids like `p1` matched nothing and every line silently vanished from `/cart` and `/checkout`. `resolveCatalogProduct` now bridges legacy ids through their launch-catalog slug to the live row (at LIVE prices — never stale seed prices), so a cart built before seeding survives the switch; ids matching neither side still drop quietly, as before. |
| 93 | **Sign-up silently died when the accounts tables were never migrated** — `GET /api/account/me` kept answering "live" while `/api/account/signup` 500-ed on the missing `customers` table, so the panel froze on the form with no useful error. All three account routes now detect the PostgREST 42P01 ("relation does not exist", same classifier `staff-auth.ts` uses) and degrade to `{ demoMode: true }`: the customer gets a working browser-local account, and the server logs name the migration file to run. |

New files: `src/lib/db/auto-seed.ts` (idempotent launch-catalog upsert + seed-id
bridge). New tests: `src/app/api/__tests__/orders-route.test.ts` (9 — seed→real
order, bridge, demo degrade, seeded store untouched),
`src/lib/db/__tests__/auto-seed.test.ts` (6 — empty-guard, write order, remap),
`src/lib/__tests__/customer-session-live.test.ts` (5 — shared-store contract,
stable identity), `src/components/account/__tests__/account-view-live.test.tsx`
(4 — signup flips to dashboard with the real hooks; no stuck form), plus
42P01-degradation cases in `src/app/api/__tests__/customer-routes.test.ts`.

## 12. Checkout outage — "Could not place the order" on every order (2026-09-16 report)

Reported from `proshanti.rahatahmed.site/checkout`: every order, plain COD
included, ended in the generic *"অর্ডার প্লেস করা যায়নি — Could not place the
order — please try again."* while `/api/health` said `live: true`.

Reproduced offline by running `supabase/bootstrap-fresh.sql` end-to-end on a
fresh Postgres and calling `ps_place_order` with the exact checkout payload
(gift off, `gift_wrap: "none"`, `tip_amount: 0`, `payment_method: "cod"`):

| # | Fix |
|---|-----|
| 94 | **`orders.gift_wrap` NOT NULL vs. the RPC writing NULL** — `202609130008` created `gift_wrap text not null default 'none'`, and every `ps_place_order` from that file onward (growth → wallet → return-restore → PROSANTI+ FINAL, the bootstrap, `pending-p2-final`) inserts `nullif(v_gift_wrap, 'none')`. Result: SQLSTATE **23502** on every non-gift order; `placementErrorFrom` only maps `P0001`, so it fell through to the generic 503. New **`supabase/migrations/202609160002_order_insert_repair.sql`** drops the NOT NULL (NULL = not a gift, which is what the RPC means). |
| 95 | **Phase-1 guard triggers never updated** — once #94 is lifted, `ps_check_order_totals` (`202609080002`, `total = subtotal − discount + delivery_charge`) still rejected any tip or gift-wrap fee ("order total does not reconcile") and zero-total return orders, and `ps_check_order_insert` rejected bKash/Nagad ("only cash on delivery is enabled") although `orders_payment_check` had been widened. Both are re-created for the current order model (tip + gift fee, `is_return` waived, `cod\|bkash\|nagad`); the trigger names stay, the "pending only / name / area / discount ≤ subtotal" rules stay. Verified on three database shapes (full bootstrap, flat-delivery-only, base schema + guards) — 8 checkout scenarios OK, return order OK, and a hand-written unreconciled/`card` INSERT is still refused. |
| 96 | **"live" lied** — `/api/health` only proved the RPC *exists*. The repair ships `ps_checkout_health()` (service-role only); the probe now reports `checks.checkoutRepair` + the raw `checkoutRepair` object, `live` is false until the INSERT path works, and `nextSteps` names the file. The admin dashboard banner turns red with the one file to paste instead of showing a green LIVE chip over a dead checkout. |
| 97 | **Undiagnosable 503** — `placeLiveOrder` now logs the raw RPC failure (`code`/`message`/`details`/`hint`) plus a `schemaGap` line naming the migration; `schemaGapFor` classifies 23502 / 42703 / 42P01 / PGRST202 and the two stale guard raises as *schema gaps*, so the customer gets an honest "temporarily unavailable — database update" 503 (never the SQL text, never a fake success) rather than being told to "try again" forever. Read-back failure after a committed RPC is logged too. |

Also: `bootstrap-fresh.sql` (+ `bootstrap-parts/09`) carries the repair as
its last section, so a fresh project cannot re-hit it; `diagnose.sql` gained
rows 33–33d; `paste-parts/99a/99b` regenerated (the ps_place_order checksum
there had drifted from the PR #28 body, so PROBE B would have called the
correct function "a body no migration contains" — fixed); `docs/go-live.md`
steps 31–32.

New tests: `src/lib/db/__tests__/placement-errors.test.ts` (+4 — schema-gap
classification, no internals leak, genuine raises untouched),
`src/app/api/__tests__/health-route.test.ts` (3 — missing probe → not live,
old guards → not live, repaired → live).

---

## 13. Admin "Confirm" does nothing — no order could be moved (2026-09-16 follow-up)

Reported right after #12: orders now arrive in Admin → Orders, but *Mark
confirmed* has no effect (the page shows "Could not update the order.").
Reproduced by running `bootstrap-fresh.sql` end-to-end in an embedded
Postgres, inserting a real `admin_users` row and calling every post-order RPC
as staff, vendor, rider and service role. Three independent database defects,
plus two app-side honesty gaps:

| # | Fix |
|---|-----|
| 98 | **Every status UPDATE raised 22P02** — `ps_write_shop_ledger` (`202609090017`, fired by `trg_orders_ledger_on_delivered` on *every* `UPDATE OF status`) tested `coalesce(old.status, '') <> 'delivered'`; `orders.status` is the enum `ps_order_status` and `''` is not a label, so the comparison itself raised — for Confirm, Preparing, Ready, Courier, Out-for-delivery, Delivered **and** Cancel, staff and vendor alike. A per-trigger bisect (all user triggers off → OK; only this one on → fails) and a `pg_proc` scan of every plpgsql body confirmed it is the sole such comparison. New **`supabase/migrations/202609160003_order_status_update_repair.sql`** re-creates the trigger with `old.status is distinct from new.status`, keeping the 0017 ledger columns/upsert and reading tip/surcharge/`is_return` through `jsonb` so it also runs on older schemas. Verified: pending → … → delivered as staff (history tagged, ledger 59900/8985/50915), cancel releases reserved stock (2 → 1), illegal moves and non-staff still refused. |
| 99 | **bKash/Nagad Verify/Reject never succeeded** — `ps_verify_payment` (`202609140004`/`202609140007`) ends with `return (select * from orders where id = p_order_id);`, which plpgsql evaluates as a *scalar* subquery → 42601 "subquery must return only one column"; the body ran, the RETURN raised, the whole call rolled back. Re-created with identical rules and `select * into v_order`. Verified: verify → `payment_status='verified'` and the gated `preparing` step then passes; reject → `cancelled` + stock back; second decision refused. |
| 100 | **Rider "Delivered" (and more) answered `forbidden`** — `trg_riders_guard_self_update` (`202609090005`) rejects any non-staff `riders` write that is not the online switch. It predates everything that later writes that table from inside our own `SECURITY DEFINER` code: `ps_track_rider_load` (`current_load`/`total_deliveries`), the `cash_in_hand` update in `ps_rider_deliver`, `ps_rider_update_location`, the shift columns. Proven fallout: rider deliver, rider reject-offer, GPS, `setRiderAvailability`, `ps_expire_stale_offers` (called before **every** rider job list and the admin Deliveries board → both break once any offer is > 90 s old), and the *vendor's* "Ready for pickup" whenever an eligible rider exists (auto-dispatch bumps the load). Inside a security-definer function or trigger `current_user` is the owner (`postgres`), a direct RLS write runs as `authenticated` — the guard now restricts only that direct path, and restricts it *harder* (nothing but `is_online` may change; before, `current_load`/`total_deliveries`/`lat`/`lng` were not in its list). Also drops the stale 2-arg `ps_rider_deliver` overload (a 2-key PostgREST payload would get 300 "not unique"). Verified as `authenticated`/`service_role`: all 7 rider RPCs OK, rider still cannot zero their own cash or change their status, service role can flip online/shift, stale-offer sweep re-offers, vendor reaches ready-for-pickup, return leg (approve → offer → accept → pickup → deliver → `refunded`, ledger −50915) and warranty eligibility OK. |
| 101 | **Silent generic 422** — `advanceOrderAsStaff`, `verifyPaymentAsStaff` (and the vendor advance) folded *any* RPC failure into "Could not update the order." with no log line. New `orderFlowSchemaGap` classifies 22P02-on-enum / 42601 / PGRST202 / 42703 / 42P01 as *schema gaps*: the raw `code`/`message`/`details`/`hint` + `schemaGap` go to the server log, and staff get an honest **503** "the database refused this change — the order was NOT updated — run `202609160003…`" instead of a generic that reads like a bad click. Rule-based P0001 mappings (forbidden 403, illegal transition 422, payment gate 422, already decided 409) unchanged. `deliverRiderAssignment` logs its raw failure too. |
| 102 | **"live" lied again** — `/api/health` was green while nothing could move. `ps_checkout_health()` now also reports `status_update_ok`, `payment_verify_ok`, `rider_guard_ok` (positive probes on the named function bodies — the previous negative probe would have matched its own source); the route exposes `checks.orderFlowRepair`, `live` requires it, `nextSteps` names the file, and the admin dashboard banner turns red with the one file to paste. |

Also: `bootstrap-fresh.sql` (+ new `bootstrap-parts/10`) carries the repair as
its last section (a fresh project passes the whole walk without the
migration; re-applying the file on top is a no-op — idempotent);
`diagnose.sql` rows 34–34d; `docs/go-live.md` step 33.

New tests: `src/lib/db/__tests__/order-flow-errors.test.ts` (10 — schema-gap
classification, 503 + log line + "NOT updated" wording, rule mappings kept,
verify path), `src/app/api/__tests__/health-route.test.ts` (+2 — 0002-only →
not live and names 0003; partial 0003 → not live; full → live).

---

## 14. Full-site audit — security lock on the public key (2026-09-16)

The audit (`docs/AUDIT-2026-09-16.md`) replayed `bootstrap-fresh.sql` in an
embedded Postgres and queried every table and RPC as the `anon` and
`authenticated` roles with Supabase's default grants. Three holes, no feature
involved:

| # | Fix |
|---|-----|
| 103 | **`memberships` had no RLS** — `202609140015` created the PROSANTI+ table with an `admin all` policy but never ran `enable row level security`, so the policy was inert: the browser key could `select phone, trxid` from every request and `update … set status = 'active'`. Verified in the replay (1 row read, 1 row updated as `anon`). New **`supabase/migrations/202609160004_rpc_grants_rls_repair.sql`** enables it (the existing policy then applies). |
| 104 | **Nine service-only RPCs were callable with the anon key** — `ps_place_order`, `ps_use_coupon`, `ps_book_delivery_slot`, `ps_return_action`, `ps_create_return_request`, `ps_assign_batch_to_rider`, `ps_credit_referrer`, `ps_expire_stale_offers`, `ps_shop_rating_recompute` are `SECURITY DEFINER`, check nothing about their caller (they trust our API, which always calls them with the service key) and inherited Supabase's default `EXECUTE` for `anon`/`authenticated`. Replay as `anon`: 20 × `ps_book_delivery_slot` → `booked_orders 20/20` (a day's scheduled delivery closed), 3 × `ps_use_coupon` → limit exhausted. 0004 revokes them from `public`/`anon`/`authenticated` and grants `service_role`; the user-session RPCs (`ps_rider_*`, `ps_advance_order`, `ps_verify_payment`, `ps_offer_order`, …) all self-check `ps_is_admin()` / `ps_rider_id()` / `ps_vendor_shop()` and are untouched. Every app caller was confirmed to use the service client (`grep -rn '.rpc("ps_' src`). |
| 105 | **`delivery_slots` writable by everyone** — `202609090017`'s "admin all" policy was `using (true) with check (true)`. Replay as `anon`: block/delete every slot. 0004 rewrites it to `ps_is_admin()`; the public read policy stays. |
| 106 | **Probe + banner** — `ps_checkout_health()` reports `rpc_grants_locked` / `memberships_rls`; `/api/health` exposes `checks.securityRepair` and a next step naming 0004. It does **not** gate `live` (orders flow without it); the admin dashboard shows an amber "security lock pending" note under the green chip instead. `diagnose.sql` rows 35–35c (`function_locked` / `table_rls` kinds); `docs/go-live.md` step 34; bootstrap + `bootstrap-parts/10` carry it as the last section. |

Tests: `src/app/api/__tests__/health-route.test.ts` (+1, one adjusted —
live-but-unlocked names 0004; locked needs both flags).

Two staff routes called the now service-only RPCs on the staff's RLS-bound
JWT client and would have started failing with "permission denied for
function" the moment 0004 was applied: `POST /api/admin/orders/[id]/return`
(`ps_return_action`) and `GET /api/admin/deliveries` (`ps_expire_stale_offers`
via `listDispatchJobs`). Both now run the RPC on the service client *after*
`staffRoute` has verified the session (the same pattern the advance route
already used for `ps_credit_referrer`): the return route answers an honest
503 naming `SUPABASE_SERVICE_ROLE_KEY` if the key is missing; the dispatch
board treats the sweep as best-effort (the rider job feed runs the same
sweep) so a missing key never blanks the board.
`src/app/api/__tests__/service-only-rpc-routes.test.ts` (4) pins which
client each RPC runs on.

### Broken features found by the same audit

| # | Fix |
|---|-----|
| 107 | **Live delivery map never showed the rider; reschedule never worked** — `/api/track/rider-location` and `/api/track/reschedule` looked the order up with `.or("id.eq.<ref>,order_no.eq.<ref>")`. The storefront only ever has the order *number* (`mapOrder` publishes `order_no` as `id`), and PostgREST compiles `id.eq.PS-…` to `'PS-…'::uuid` → SQLSTATE 22P02, so every call answered 404 "order not found" and the map's `if (!res.ok) return` swallowed it. Tests passed because the mock's `.or()` returned the row. New `src/lib/db/order-lookup.ts` (`findOwnedOrder`: order_no match, uuid only when the value is one, phone proof, strict reference charset) used by both routes; the test mock now raises on a non-uuid `id` filter like Postgres does and pins order_no matching, uuid matching and case-folding. Same pattern in `POST /api/reviews` (`id.eq.<slug>`) — now `eq(isUuid ? "id" : "slug")`. |
| 108 | **Rider proof-photo upload always failed** — the rider page signed via the staff-only `/api/media/sign` (`staffRoute` → 403 for a rider session) and reported "Cloudinary is not configured". New `POST /api/rider/media/sign` (`riderRoute`, folder pinned to `prosanti/delivery-proofs`, body ignored) on a shared `src/lib/cloudinary-sign.ts`; the staff route uses the same helper. Rider page: typed response, honest 503 vs. unavailable copy, uses the returned `uploadUrl`. `rider-media-sign.test.ts` (3). |
| 109 | **Dead `DeliveryRating`** — imported by the track view but never rendered; had it been, it posted `{orderId}` to `/api/reviews`, which requires a product → 400 with no error UI. Removed with its import. |

### Admin resilience (audit M4/M5)

| # | Fix |
|---|-----|
| 110 | **Admin pages went quiet on API failure** — dashboard, customers, payments, settings and growth never rendered their hook's `error`, so a failed load looked like "no orders" / default settings and a failed save looked like success (the exact reason "Confirm did nothing" was hard to diagnose). New `src/components/admin/admin-data-error.tsx` (`role=alert` strip with Retry/Dismiss) wired into all five pages plus the orders list. |
| 111 | **Staff-session probe swallowed its failure** — `useStaffLive` turned a network error / 5xx from `/api/admin/me` into plain `live: false`, and every hook then served empty data with no message. The hook now returns `error` (via `staffProbeError`, which distinguishes 401 / unreachable / 5xx) and `retry()`; `AdminGate` renders it once above every admin page. `use-staff-live.test.tsx` (5). |
| 112 | **Order list capped at 200 rows with no way to older orders** — `listOrders` had a flat `limit(200)` and loaded the whole `coupons` + `delivery_zones` tables on every call. Now keyset-paginated (`created_at desc, id desc`; opaque base64url cursor validated as ISO timestamp + uuid before it is embedded in the filter; search value quoted so `,` `.` `"` cannot break the PostgREST `or`), zones/coupons looked up only for the page. `GET /api/admin/orders` accepts `limit` (≤500) and `cursor`, returns `nextCursor`. Client: `useOrders({q})` holds the newest 200, `loadMore()` appends older pages, the 10s poll re-walks opened pages, orders page has a "Load older orders" button and a debounced server-side search; new `useOrder(orderNo)` falls back to `/api/admin/orders/[orderNo]` so a detail link to an old order no longer says "Order not found". `list-orders-page.test.ts` (6), `use-orders.test.tsx` (7). |
| 113 | **Delivery offers could not be re-issued (rider job feed 503, Reject impossible)** — `delivery_assignments` carried `UNIQUE (order_id)` from `202609090005` while every re-offer path (`ps_expire_stale_offers`, `ps_rider_reject`, `ps_offer_order`) inserts a *second* row for the same order. Reproduced on a fresh bootstrap (PGlite): the first expired offer with a second eligible rider online raises `23505`, and since the sweep runs first in `GET /api/rider/jobs`, every rider's job list answered 503 from then on. `supabase/migrations/202609160005_dispatch_reoffer_repair.sql` replaces the constraint with a partial unique index over the live states (`delivery_assignments_one_live_offer`) — still exactly one active offer per order, history retained — plus `idx_assignments_order_offered` for the "latest assignment" readers. `ps_checkout_health()` gains `dispatch_reoffer_ok`; `/api/health` exposes it as `checks.dispatchRepair` with a `nextSteps` line, and the admin dashboard shows an amber note until it runs. `health-route.test.ts` (7). |
| 114 | **Admin Batch assign never worked** — `ps_assign_batch_to_rider` (`202609090017`) called a `ps_assign_order_to_rider` that does not exist and read a `rider_assignments` table that does not exist, so it always failed with `42P01`; the route then looped over the same phantom RPC per order and — if that failed too — returned the SQL error, so the UI showed a raw "relation does not exist". Migration 0005 rewrites the function as a direct 90-second `offered` row to the chosen rider (rider must be active + online, orders must be `ready-for-pickup`/`courier-assigned`/`out-for-delivery`, other riders' live offers are cancelled, a picked-up parcel is never moved, returns the count). `POST /api/admin/deliveries/batch` validates ids, calls the RPC once, surfaces the function's own rule (`rider not available`) as 409, names the 0005 file as 503 if the phantom is still in the database, and the panel lists only dispatchable orders and reports assigned/skipped counts. `service-only-rpc-routes.test.ts` (+4). |
| 115 | **Stale unit tests pinned the old delivery pricing** — after the zone-based delivery change (#92-era) four specs still asserted the flat `৳60` base, the "shop does not serve zone" checkout block and the fixed para list; they failed on every run, masking real regressions. Updated to the current rules (zone `charge` is the base, shop `zoneIds` no longer blocks checkout, para is free text). Full suite: 103 files / 702 tests green. |
| 116 | **Lint debt hid a hydration bug and a dead component** — `npx eslint .` reported 118 problems (88 errors / 30 warnings) (`any` on rider/order rows, unused imports and params, hooks with missing/unnecessary deps, `Date.now()` during render). All cleared: `DbRider` gained `lat/lng/last_location_at/current_load/total_deliveries` and `Order` gained `isPickup/pickupSlot/tipAmount/weightKg/surchargeWeight` so admin pages stop casting; the SLA/track/live-map views read the clock through new `src/lib/use-now.ts` (a `useSyncExternalStore` ticker that returns the same value on server and first client render, so the countdowns no longer produce hydration mismatches); `summarize(lines, pool)` takes the catalog snapshot it resolves against so the cart memo's dependency is real; the style-match query is memoised; `signature-canvas.tsx` (unused since the proof-photo flow) is deleted; Retry buttons on the notifications/reviews/shops/zones/riders admin pages are wired to their hooks' `refresh`. `tsc` 0, `eslint` 0. |
| 117 | **Canonical/OG URLs pointed at the wrong domain** — `src/app/layout.tsx` hard-coded `metadataBase: https://prosanti.store` while the store is served from `proshanti.rahatahmed.site`, so every `og:url`/canonical tag named a host the page is not on (the sitemap/robots already used `siteBaseUrl()`). `metadataBase` now comes from `siteBaseUrl()` (`NEXT_PUBLIC_SITE_URL` → Vercel production domain → fallback); `.env.example` documents the variable and go-live §2 lists it. Owner: set `NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site` on Vercel. |
| 118 | **Unknown product/shop slugs answered HTTP 200** — `loading.tsx` streams the shell before the page's `notFound()` runs, so `/product/<nope>` was a "soft 404" (correct 404 body + `noindex`, wrong status). `generateMetadata` now throws `notFound()` too, which is resolved before the shell for crawlers with blocking metadata; browsers still get the streamed 200 + 404 body (framework limit, `noindex` stays as the safety net). |
| 119 | **No baseline security headers, `X-Powered-By: Next.js` exposed** — `next.config.ts` sets `poweredByHeader: false` and `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that allows only what the app uses (geolocation + camera for checkout pin / rider app), HSTS, and — on Vercel only, so the sandbox iframe preview keeps working — `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`. A full CSP is deliberately deferred (inline hydration scripts, Cloudinary/OSM/YouTube embeds need their own tested rollout). |
| 120 | **`middleware` file convention deprecated in Next 16** — `src/middleware.ts` → `src/proxy.ts` (`export function proxy`), same matcher and Supabase-cookie refresh; the build banner now reads `ƒ Proxy` with no deprecation warning. |
| 121 | **Two public routes had no rate limit** — `POST /api/track/reschedule` (phone is the only ownership proof → guessable without a cap) now shares the track lookup's per-IP budget (10/min), and `POST /api/account/logout` (a database delete per call) allows 30/min; both answer 429 + `Retry-After`. The limiter is still in-memory per instance (documented in `rate-limit.ts`). |
| 122 | **`/api/health` exposed counts and setup state to anyone** — anonymous callers now get only `{ live, now }` (enough for an uptime monitor); the full report (per-table counts, seeded flags, repair checks, `nextSteps`) requires a staff session (cookie or bearer — the admin dashboard banner and the owner's tab keep working) or `x-health-token: $HEALTH_TOKEN` for an external monitor. `health-route.test.ts` (+3). |
| 123 | **Bottom nav lit no tab on `/product/*`, `/shops/*`, `/shop?…`; desktop header had no Account link** — `activeTab()` is section-aware (Home exact, Shop owns product/shops/style/campaign/live, other tabs own their sub-routes); the header gains an account icon link (`sm+` only — the phone bottom bar's Menu already lists it), with `header.account` in both languages. `bottom-nav-active.test.ts` (4). |

### Round-2 audit (2026-09-17, `docs/AUDIT-2026-09-17.md`) — Batch A: two-tap order flow

| # | Fix |
|---|-----|
| 124 | **Every order cost the shop three taps and showed the customer six steps** — `ps_advance_order` enforced strictly +1 positions on the 8-state enum, so staff had to click *Confirm → Start preparing → Ready* before a rider could even be offered the order, and `/track` mirrored the database (Placed, Confirmed, Preparing, Courier Assigned, Out for Delivery, Delivered). Now **two taps** and **four milestones**, with the enum, ledger, dispatch trigger, rider RPCs, payment gate and returns untouched. *DB* — `supabase/migrations/202609170001_two_tap_order_flow.sql` re-creates `ps_advance_order` with the single extra allowance `confirmed → ready-for-pickup` (verified on a fresh PGlite bootstrap: the skip works, `pending → ready`, `confirmed → courier-assigned/out-for-delivery/delivered`, backwards moves and cancel-from-ready are still refused, unverified bKash still blocked, auto-dispatch still fires) and adds `two_tap_flow_ok` to `ps_checkout_health()`; 2 × OK verify. *Domain* — `TRANSITIONS.confirmed` = `[ready-for-pickup, preparing, cancelled]` (primary first), `ACTION_LABEL` (button copy: "Confirm order", "Ready — call rider"), `PUBLIC_STEPS` (placed / confirmed / picked-up / delivered with `statuses` + `doneAt`), `publicPhase` / `publicStepDone` / `publicStepsDone`; `STATUS_META` labels speak rider language ("Ready for rider", "Picked up — on the way"). *Admin* — order detail offers **Confirm** then **Ready — call rider** (the optional "Start preparing" sits behind *More…*), rider-owned states show who has the parcel instead of a button, the Journey rail is the four milestones with the internal states + times listed under each; the orders list has six chips (All · New · Confirmed · With rider · Delivered · Cancelled) summing the internal counts; dashboard pipeline + KPI cards follow the same phases. *Vendor* — same two buttons (+ optional preparing), pills renamed. *Customer* — `/track` renders `PUBLIC_STEPS` with "Picked up" ticking only at `out-for-delivery` and an honest in-progress sub-line ("Packed — calling the nearest rider" / "Rider X is heading to the shop"), all copy in `translations.ts` (`track.*`, en + bn: অর্ডার হয়েছে · কনফার্ম · রাইডার নিয়েছে · ডেলিভারি হয়েছে); FAQ/About copy updated. *Compat* — until the migration is pasted the live RPC answers `illegal transition confirmed -> ready-for-pickup`; `advanceOrderAsStaff` / `advanceVendorOrder` detect exactly that message and take the two internal steps themselves (note kept on the final step, second-step failures still surfaced, no retry for any other refusal), warning with the file name; `/api/health` exposes `checks.twoTapFlow` + a `nextSteps` line and the admin banner shows an amber note. Tests: `orders.test.ts` (+5), `track-steps.test.ts` (5, new), `order-flow-errors.test.ts` (+5), `health-route.test.ts` (+1, 2 updated). go-live step 36. |

### Round-2 audit (2026-09-17) — Batch B: server-side speed (P1.1–P1.5)

| # | Fix |
|---|-----|
| 125 | **Every storefront visit re-read the whole catalog from Dhaka via iad1 five times, every order/coupon check counted the entire orders table, and every rider/dispatch/vendor list ran ~9 queries per order** — the audit's "round trips, not bytes" finding. *P1.1 CDN caching* — new `src/lib/public-cache.ts`: `publicJson()` answers `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300` (+ the same `CDN-Cache-Control`) so Vercel's edge serves `/api/products`, `/api/zones`, `/api/shops?zone=`, `/api/homepage` for a minute and refreshes in the background; only 200s use it — every error/503 and every per-user route (`apiJson`/`apiError`) stays `no-store`, `/api/promo` is untouched (its payload carries a server clock). *P1.2 shared data cache* — `fetchLiveCatalog()` wraps the seven-query read in `unstable_cache` (key `live-catalog-v1`, 60 s, tags `catalog`/`zones`/`shops`) through a new cookie-less `getSupabaseAnon()` client, so the entry is exactly the anon RLS view whoever warms it and `cookies()` is never touched inside the cache scope; `/api/homepage` likewise (tag `homepage`); without an incremental cache (tests, CLI) both fall back to the direct read. Every catalog write invalidates with `revalidateCatalogCaches(tag…)` = `revalidateTag(tag, { expire: 0 })`: admin products POST/PATCH, categories POST (upsert + move), zones POST/DELETE, shops POST + link-vendor, homepage PATCH, settings PATCH (`ops`), vendor products POST/PATCH and vendor shop PATCH — staff see their edit on the next reload, not "within a minute". *P1.3 batched order mapper* — `toDomainMany(db, rows)` in `src/lib/db/orders.ts` maps N orders in **two rounds** of chunked `.in()` reads (items, history, zones, coupons, return children/parents, latest assignment → products, first image, riders; 100 ids per request) and keeps every enrichment of the old per-order `toDomain` (which is now `toDomainMany([row])[0]`); `listRiderJobs`, `listDispatchJobs`, `listAwaitingDispatchOrders` and `listVendorOrders` use it — a 100-order board is ~10 requests instead of ~900. *P1.4 scoped checkout snapshot* — `loadOrderSnapshot(hints)`: `/api/coupons/best|validate` pass `scope: "pricing"` (catalog + coupons only — no shops, ops, referral or phone reads); `/api/orders` passes the payload's phone + referral code, so the referral ledger is read only when a well-formed code was typed and only for that code / this phone, the first-order proof is a phone-prefiltered read (`ilike` digit needle, exact `normalizePhone` compare in JS) instead of 5000 rows, and the global `count(*)` is gone (`totalOrders` is now optional; nothing priced from it). `countOrdersForPhone` (Smart Card) gets the same server-side prefilter. *P1.5 indexes* — `supabase/migrations/202609170002_perf_indexes.sql` (7 × `create index if not exists`, verified on a fresh PGlite bootstrap: idempotent, 7 × OK, and `explain` shows Admin → Orders switching to `idx_orders_status_created` at 30k rows). Tests: `public-cache.test.ts` (6, new), `order-domain-batch.test.ts` (6, new), `order-snapshot-scope.test.ts` (4, new), `public-routes.test.ts` (+2 header assertions), `catalog-sales.test.ts` mock moved to `getSupabaseAnon`. go-live step 37. **Owner:** paste `202609170002_perf_indexes.sql` (7 × OK); Vercel region `sin1`/`bom1` + Cloudinary `f_auto,q_auto` transforms remain the Batch D to-do. |

### Round-2 audit (2026-09-17) — Batch C: client-side speed (P2.1–P2.6)

| # | Fix |
|---|-----|
| 126 | **Every visitor downloaded the Supabase auth library and a smooth-scroll engine they could not use, the homepage fetched its own settings twice, `/shop` and product pages re-fetched the catalog they had just rendered, and six API calls raced the hero image on load** — measured on the home page's shipped script tags: **1042 KB across 15 chunks → 766 KB across 13** (−276 KB, −26 %); `/admin` 662 KB. *P2.2 supabase-js off the storefront* — `@supabase/ssr`/`supabase-js` (253 KB chunk) reached the public bundle through two static import chains: `referral-card` → `admin-api` and `(site)/page` / `announcement-bar` → `use-cms` → `use-staff-live` → `admin-auth` → `supabase-browser`. `admin-api.ts` and `admin-auth.ts` now load the browser client with a lazy `import("./supabase-browser")` gated on the `prosanti.admin.session.v1` flag (a visitor who never signed in as staff cannot hold a staff JWT, so nothing is attached and nothing is downloaded); the referral card uses a plain `fetch` (a 401 there must not sign the *admin* out either); new `src/lib/use-home-settings.ts` is a shared-store reader for the published homepage row (**one** `/api/homepage` per page for any number of consumers, browser-default cache so the 60 s CDN copy is reused) and `useCms()` is now the staff editor built on top of it (`publishHomeSettings()` pushes a saved row to every reader). The chunk is still built — it loads on demand for `/admin/*`, `/vendor/*`, `/rider/*`. *P2.3 lenis* — `SmoothScroll` imports `lenis` dynamically, only on `(hover: hover) and (pointer: fine)` devices with motion allowed, and only after `requestIdleCallback` (2.5 s ceiling); phones scroll natively (the 1.8× touch multiplier fought the browser and cost a permanent rAF loop); the 18 KB chunk is no longer in any page's initial script list. *P2.1 SSR seeds the client catalog* — `hydrateLiveCatalog(seed)` in `src/lib/live-catalog.ts` + `<CatalogHydrator>` (layout effect, so it runs before any consumer's `ensureLiveCatalog()`) mounted on `/shop`, `/product/[slug]`, `/shops/[slug]`: the bag, purchase panel, header search and quick-add resolve products from the rows the page already rendered, and the client `/api/products` fetch is skipped (zones too when the page had them); the client fetches drop `cache: "no-store"` so back/forward navigation reuses the CDN copy. *P2.4 Reveal* — never hides content on mount any more: blocks already inside the viewport stay exactly as painted (first paint = final paint), only below-the-fold blocks get `.reveal-pending` and a compositor-only CSS transition (opacity + translate, no `blur()` filter, no per-card Web Animation), classes removed after the transition. *P2.5 idle boot* — new `src/lib/defer.ts` `afterFirstPaint()` (rAF → `requestIdleCallback` with a 1.5 s ceiling, timer fallback for Safari, synchronous under SSR/tests) schedules `/api/account/me`, `/api/promo` (both hooks) and `/api/live` after the first frame; `/api/products` and `/api/homepage` stay immediate because they paint content. *P2.6 admin round trips* — `apiGet` sends `Authorization: Bearer` like `apiSend` (so `requireStaff()` verifies the header JWT instead of the cookie → Auth round trip), and `requireStaff()` memoises a **positive** `admin_users` role for 60 s per user in-process (misses/403s are never cached; `grantStaffRole`/`revokeStaffRole` call `forgetStaffRole(id)` so a change applies on the next request). Tests: `admin-api-bearer.test.ts` (4, new), `staff-role-cache.test.ts` (5, new), `live-catalog-hydrate.test.ts` (4, new), `catalog-hydrator.test.tsx` (2, new), `defer.test.ts` (4, new), `use-home-settings.test.tsx` (4, new — includes an import-graph guard that fails if a storefront file imports `use-cms`/`admin-api`/`admin-auth`/`supabase-browser` again), `reveal.test.tsx` rewritten (4). Full suite: 114 files / 765 tests green. No migration. |

### Round-3 customer UX audit (2026-09-18) — Batch E: P0 #1–#7, the order form

| # | Fix |
|---|-----|
| 127 | **Ordering was possible but not easy** — the checkout was eleven sections in one 2 000-line scroll, the delivery charge was promised three different ways ("ফ্ল্যাট ৳৬০ সব জায়গায়" in the bag, "মাত্র ৳৬০" in the cart, "৳50 – ৳130" on the product page) before the real ৳60 / ৳120 / ৳150 appeared at checkout, the outside-Sadar minimum was ৳৫০০ in the copy, ৳৬০০ in the client/server check and ৳500 in the database, the "সন্ধ্যায়" slot never reached the shop or the rider as a time, the receipt's *Track* button opened an empty form, server errors arrived as raw English at the bottom of the page, and opening `/checkout` or `/cart` directly flashed "Nothing to check out" while the catalog was still loading. *P0 #1 three steps, one form* — `checkout-view.tsx` is now ① আপনার তথ্য (phone · name · address ladder) → ② ডেলিভারি ও পেমেন্ট (home delivery / store pickup as two big radios instead of a buried checkbox, slot chips, payment) → ③ দেখে নিন ও অর্ডার করুন (summary card on phones, bag warnings, assurance, the button), with a progress rail ("ধাপ ১ / ৩", tap to jump), everything optional (coupon · gift · referral · rider tip · address label · note) folded into one "আরও অপশন" `<details>` that shows what is already set while collapsed, and a sticky "মোট ৳X · অর্ডার করুন" bar on phones that appears once the real button scrolls away (`.sticky-buy-bar` pattern, above the bottom nav, `inert` while hidden). Every input stays mounted inside the same `<form>` — the existing test contract (`/Place Order/i`, the placeholders, `data-testid="gift-step"`, the POST body) holds unchanged. New `checkout-ui.tsx` (`CheckoutProgress`, `StepSection`, `MoreOptions`, `OrderErrorBanner`, `StickyOrderBar`). *P0 #2 one delivery promise* — `DELIVERY_CHARGE_PROMISE_BN/EN` ("ডেলিভারি ৳৬০ থেকে — ঠিকানা দিলে সঠিক চার্জ দেখাবে") + `DELIVERY_CHARGE_LADDER_BN` in `src/lib/delivery.ts` are the only sentences the bag drawer, cart, checkout banner, product page (`purchase.zoneChargeText`), `/delivery` page + its metadata and the admin settings note use; the "flat ৳60 everywhere" and "৳50–৳130" copy is gone. *P0 #3 one minimum* — `MIN_ORDER_OUTSIDE_SADAR_PAISA = bdt(500)` (the number `ps_place_order` enforces) replaces the 60000 in the client and in `order-validation.ts` (`MIN_ORDER_OUTSIDE_PAISA` re-exports it); the check now skips pickup (the RPC does too); the checkout says "আর ৳X যোগ করলে অর্ডার করা যাবে" the moment a non-Sadar district is picked and disables the button until the basket clears it — no wasted tap. *P0 #4 the evening slot reaches the shop* — new `src/lib/delivery-slots.ts`: "সন্ধ্যায়" posts `scheduled_at` = today 18:00 Asia/Dhaka (before 18:00), nothing extra during 18–21 (it *is* evening), tomorrow 18:00 after 21:00; the chip's sub-line says which ("আজ ৬–৯ PM" / "আগামীকাল ৬–৯ PM"); scheduled windows post their start hour instead of the raw picker string; the date bounds use the Dhaka calendar (the old `toISOString().slice(0,10)` rolled the day at 06:00 Dhaka). `deliverySlotSummary()` prints one label ("Evening (6–9 PM) · 18 Sep, 6:00 pm") on the receipt, `/track`, admin order detail (+ a "customer asked for a delivery slot" box), admin list, rider card (Bangla) and vendor list; `AdminSlaAlerts` no longer counts a slot order as late while its window is still ahead. Because `scheduled_at` is now set, `ps_book_delivery_slot` applies (20 per window) — its "Delivery slot full" refusal is mapped to Bangla and points at the slot chips. *P0 #5 receipt → track* — the receipt shows the order number large with a one-tap **Copy** button and a screenshot hint, its Track button is `/track?id=…&phone=…`; `/track` reads the query after mount, prefills both fields and looks the order up by itself (still a static page — no Suspense bailout), and new `src/lib/last-order.ts` remembers the order for a week so `/track` offers "আপনার শেষ অর্ডার → ট্র্যাক করুন" on that device (dismissable; the server still requires id + phone). *P0 #6 errors in Bangla, on the field* — new `src/lib/checkout-errors.ts` maps every RPC/422/route message (`only N left of "…"`, `coupon minimum not met`, `Zone D requires minimum ৳500 order`, `Delivery slot full`, `"Shop" is closed right now`, the 422 field strings, rate limit, 503…) to an actionable Bangla sentence with the English original kept under it, decides which input each belongs to (`fieldForServerError`) and scrolls to the first one *in form order* (`firstErrorField`); the banner is a `role="alert"` at the button with a "লাল চিহ্নিত ঘরগুলো ঠিক করুন" jump, inputs get `aria-invalid` + inline copy, coupon problems are translated too, "Use my location" outside Sunamganj now says so instead of silently clamping the pin. *P0 #7 no empty flash* — `CartProvider` exposes `ready` (storage read AND catalog settled, or the bag is empty); `/cart` and `/checkout` paint `BagSkeleton` until then and the empty state only when it is true. Tests: `checkout-batch-e.test.tsx` (9, new — held catalog → skeleton not empty state, three steps in one form, min-order gate, evening `scheduled_at`, receipt link + copy + last-order, Bangla RPC/422/local errors), `track-prefill.test.tsx` (5, new), `delivery-slots.test.ts` (12, new), `checkout-errors.test.ts` (10, new), `last-order.test.ts` (5, new). Full suite: 119 files / 806 tests green; `next build` clean. No migration, no server change. |

### Round-3 customer UX audit (2026-09-18) — Batch F: P1 #8–#17, from product page to account

| # | Fix |
|---|-----|
| 128 | **The shop spoke English first to a Bangla town, a phone could not switch language or reach the card buttons, "Select a size" was a dead button, the size helpers were three competing widgets, bKash/Nagad payers had to retype the number and guess the amount, the coupon appeared twice, "Cancel" existed only on the receipt as a promise, the account knew nothing about the customer's orders, repeat customers retyped everything, and Zone D promised "60–80 min" for a courier trip.** *P1 #8 Bangla first* — `LanguageProvider` takes `initialLang`; the storefront layout passes `"bn"` (staff surfaces and tests keep English), a device that ever chose is still honoured (`readStoredLanguage()` = localStorage → cookie), `<html lang>` follows; new `variant="toggle"` on `LanguageSwitcher` (one 44 px "EN"/"বাং" button, `aria-label` in the *other* language) sits in the header **on phones** (`flex sm:hidden`), the wishlist icon moves to `sm+` so the header stays four items wide. *P1 #9 cards on phones* — the `.product-card-actions` overlay (Quick add / heart) was `opacity:0` until hover, which never happens on touch: on `(hover:none)` it is now a static row under the image, still overlay-on-hover on desktop. *P1 #10 the size tap teaches* — `PurchasePanel`: a missing size is no longer a `disabled` CTA. Both the inline button and the sticky bar stay tappable, and a tap with no size calls `nudgeSize()` — scrolls `#purchase-size` into view, pulses the pill row (`size-nudge` keyframes, reduced-motion aware), focuses the first pill, adds nothing (`hardStop` = closed shop / sold out is still truly disabled); while no size is chosen the sticky bar shows the sizes themselves (`data-testid="sticky-size-pills"`) so the phone shopper never has to scroll back up. *P1 #11 one size help* — Size finder · Size guide · Ask the stylist are one "সাইজ সাহায্য" disclosure row (`size-help-toggle`, `aria-expanded`, `hidden` panel) — each keeps its own name and behaviour inside; the "Best for you" line still shows on top when a profile exists. *P1 #12 wallet block* — `WalletPaySteps`: the shop's number and the **exact whole-taka total** each get a copy button (`copy-wallet-number` / `copy-wallet-amount`, "কপি হয়েছে ✓" feedback, digits-only amount so it pastes into the bKash field), three numbered steps, TRXID input is mono + auto-uppercase + strips spaces, warns under 8 characters (`trxid-hint`), and the placeholder/`ref` contract from #6 is untouched. *P1 #13 coupon once* — the summary card's duplicate coupon chip + its second "Remove" are gone (`onRemoveCoupon` prop removed on both sides); the code shows once as a price line in the summary and once as an "applied ✓ · Remove" row (`coupon-applied`) beside the input. *P1 #14 customer cancel* — new `POST /api/track/cancel` (`{orderId, phone, reason?}`; rate-limited 10/min per IP; `findOwnedOrder` → 404 when the phone does not match; already cancelled → `{already:true}`; only `CUSTOMER_CANCELLABLE` = pending / confirmed / preparing — the same set `ps_advance_order` accepts, exported from `src/lib/orders.ts` with `canCustomerCancel()` — else 409 `{code:"too_late"}`; the update is guarded by `.in("status", …)` so a rider grabbing the parcel between read and write also yields 409; a bKash/Nagad `pending_verification` payment is settled `rejected` with `payment_verified_at`; `order_status_history` gets "Cancelled by customer (reason)" and `notifyStaff` pings the admins with a link) + new `CancelPanel` on `/track` (two taps: "অর্ডার বাতিল করুন" → reason (optional) + "হ্যাঁ, বাতিল করুন" / "অর্ডার রাখুন"; on success the timeline flips to cancelled in place; packed/with-rider orders get "already packed — WhatsApp the shop" with the real contact number; delivered/cancelled/return orders show no panel); the track receipt line now says Total (bKash/Nagad/COD) instead of always COD. *P1 #15 account* — new `GET /api/account/orders` (cookie session via `resolveCustomer`, no phone in the URL; `listOrdersForPhone()` in `db/orders.ts` = prefiltered `ilike` needle + exact `normalizePhone` compare, one batched `order_items` read for count + first item) and `OrderHistory` at the top of the dashboard (order no · public milestone badge in the customer's language · bKash/Nagad "verifying" pill · first item + count · placed time + slot summary · total · **Track** → `/track?id=…&phone=…`; empty → "Shop →"; failure → retry); the login tab gains a "পাসওয়ার্ড ভুলে গেছেন?" disclosure that tells the truth (no OTP on this site) and links the shop's WhatsApp from `/api/contact` with the typed number in the message. *P1 #16 saved address pre-fills* — on an untouched form the last saved address fills name/phone/para/house/road/address/note/zone, restores the map pin, and says so ("সংরক্ষিত ঠিকানা ব্যবহার হয়েছে" chip, `address-prefilled`, one tap to pick another); `address-book.ts` now stores district/upazila too and de-duplicates on phone + house + para + district (re-saving updates instead of stacking). *P1 #17 courier honesty* — `COURIER_ZONE_ID`/`courierEta(lang)`/`isCourierZone()` in `delivery.ts`: everywhere the ETA is printed for Zone D — checkout summary title + delivery row (`courier-eta`), product page courier note, `/track` delivery card ("Outside Sadar · Courier" pill) + live map ETA fallback, shop delivery checker, `/delivery` promise copy + zone table — reads "কুরিয়ারে ১–৩ দিন" / "1–3 days by courier" instead of "60–80 min" (rider zones unchanged; the DB seed's `eta_label` is left as-is and overridden in the UI). Translations: `purchase.sizeHelp*`/`courier*`, `checkout.copy*`/`sendExactly`/`trxid*`/`savedAddressUsed`/`useSavedAddress`/`courierEta`, `track.cancel*`/`history*`/`forgot*`, `language.switchTo*` (en + bn). Tests: `cancel-route.test.ts` (7, new — 400/404/200 COD/bKash rejected/409 late/409 race/idempotent), `cancel-panel.test.tsx` (5, new), `purchase-panel-size-nudge.test.tsx` (3, new), `checkout-batch-f.test.tsx` (5, new — copy buttons + TRXID hint, single coupon UI, saved-address prefill + dedupe, courier ETA on district change), `order-history.test.tsx` (3, new). Full suite: 124 files / 829 tests green; `next build` clean; smoke: every storefront page 200, home renders `lang`-toggle "EN" with the Bangla `aria-label`, `/delivery` prints no "60–80 min". No migration, no server change. |

### Round-3 customer UX audit (2026-09-18) — Batch G: P2 #18–#25, the polish round

| # | Fix |
|---|-----|
| 129 | **The receipt ended at "Track" with no idea of what came next, the bag drawer offered three equal buttons, the homepage never said whether the shop comes to your para, `/track` rendered a rider map and a security PIN for pickup / courier / cancelled / delivered orders alike, search results and counts were English-only, the shop's zone picker read "Zone B — Sadar Core (1.5-2.5km)", the thumb bar had no way to reach an order, and a pasted "+880 17-…" phone number failed validation.** *P2 #18 "এরপর কী হবে"* — new `ReceiptNextSteps` (`checkout-ui.tsx`) on the receipt, built from THIS order (`placed.isPickup` / `isCourier` / `payment`): COD → "Confirmed (shop checks stock) → Picked up (rider; slot or ETA on the right) → Delivered (pay ৳X at the door + 4-digit PIN)"; bKash/Nagad → first step is "the shop matches your TRXID in its own wallet", last step "already paid — just the PIN"; other district → "Courier — 1–3 days" and never minutes; pickup → "Ready at Traffic Point — show the order number" and no delivery step; one footnote states the free-cancel window honestly. *P2 #19 one CTA in the bag* — the drawer footer is **Checkout** alone (`bag-checkout`); "View bag" and "Order this bag on WhatsApp" live behind a quiet "অর্ডারের আরও উপায়" `<details>` (`bag-more-ways`, still one tap, same testids). *P2 #20 home trust + para check* — new `HomeDeliveryCheck` directly under the hero: four linked pills (COD · ডেলিভারি ৳৬০ থেকে · ৪-সংখ্যার PIN · ৭ দিনের রিটার্ন — each links to the page that proves it) and a one-field "আপনার পাড়ায় ডেলিভারি হয়?" check that quotes the real zone charge + ETA from the same zone table the checkout prices from (`findZoneForPara`: exact then contains), sets the "deliver to" zone so `/shop` opens scoped, says "কুরিয়ারে ১–৩ দিন" for Zone D and, for an unknown para, the courier fallback + ৳500 minimum + WhatsApp instead of a dead end. *P2 #21 status-conditional tracker* — new `OrderNowBanner` + `orderStage()` (cancelled / delivered / verifying / pending / confirmed / ready / assigned / out — a wallet payment under verification wins over the status, never over cancelled/delivered) prints the one line that is true right now ("রাইডার {name} দোকান থেকে নিচ্ছেন", "পথে আছে — ফোন কাছে রাখুন আর PIN তৈরি রাখুন", pickup/courier variants, "ডেলিভারি হয়েছে — ৭ দিন রিটার্ন খোলা", "বাতিল — কিছু দিতে হবে না") and shows the **PIN exactly when it will be asked for** (our rider out for delivery — not courier, not pickup, not a return); `showsRiderMap()` mounts `LiveDeliveryMap` only while a rider can actually come (not pickup, courier, delivered or cancelled); the old cancelled banner shrinks to a `role=note` with the shop's number. *P2 #22 search in Bangla* — result rows lead with `nameBn` when the UI is Bangla (English under it) and show the Bangla name as a sub-line in English; "{n} matches for", "View all {n} results", "Sold out" and the hint line are translated. *P2 #23 zone names for humans* — the shop's "Deliver to" options read "Zone A · Boropara, Shologhar, Ukilpara … · ৳60 · 30–40 min" (Zone D: "কুরিয়ারে ১–৩ দিন"); the results line shows the short name; sort/filters/close aria-labels translated. *P2 #24 "অর্ডার" tab* — the bottom bar's Wishlist slot becomes Orders (`bottom-nav-orders`): `/account` when signed in (order history), `/track` for a guest (remembers the last order); `activeTab` lights it on `/track`, `/account`, `/returns`; Wishlist stays in the header (sm+) and the menu. *P2 #25 phone + autofill* — `tidyPhoneInput()` in `src/lib/phone.ts` (checkout, `/track`, account): Bangla-keyboard digits → ASCII, "+880 17-1234 5678" → `01712345678`, capped at 11 digits so a typo cannot slip through; `autoComplete` on name/tel/address-level1 (district)/address-level3 (para)/address-line1 (house)/address-line2 (road)/street-address, TRXID `autoComplete="off"`; the phone hint is now a translation key. Tests: `checkout-batch-g.test.tsx` (4, new), `phone-input.test.ts` (5, new), `home-delivery-check.test.tsx` (4, new), `order-now-banner.test.tsx` (9, new), `bag-drawer-cta.test.tsx` (1, new), `bottom-nav-active.test.ts` (+1), `shop-browser.test.tsx` (+1), `cancel-panel.test.tsx` (2 assertions moved to `order-now` stage). Full suite: 130 files / 854 tests green; `tsc` + `eslint` clean; `next build` clean; smoke: every storefront page 200, home renders the trust strip + para check + Orders tab (`/track` for a guest). No migration, no server change. **This closes the round-3 UX list (#1–#25).** |
| 130 | **Operators worked blind and four taps deep (Batch H, ops UX, 2026-09-18)** — (a) *Admin "Assign rider" / "Batch assign" never worked on the live site*: both dispatch routes demanded a uuid, but the admin UI only ever holds the PUBLIC order number (`Order.id` = `order_no`, §70), so every press answered 422. `resolveOrderRowIds` (`db/riders.ts`) accepts either form and 404s on a miss (a typo can never offer a different order). (b) *The shop could not verify its own bKash/Nagad money*: `ps_verify_payment` has always authorised the owning shop, but only the staff route existed — every wallet order sat at "verify" until PROSANTI looked. New `POST /api/vendor/orders/[orderNo]/payment` + `verifyPaymentAsVendor` (same rule mapping as staff, schema gap → 503 "NOT updated"); `PaymentCard` gained `actor="vendor"` and is mounted on the vendor detail. (c) *Rider card said "collect ৳X" on every order — including bKash orders already paid*: `payment-labels.ts` (`paymentSummary`, `cashToCollect`) is now the one answer on the rider card (COD amount vs "paid by bKash — take no money" vs return), admin list/detail (`PaymentChip`, "Total · bKash ✓"), vendor header (was hard-coded "Cash on delivery") and the dispatch board. (d) *Every Confirm cost four taps*: `order-actions.ts` `primaryAction` gives one next tap per order to the admin list rows (`OrderRowActions`: Confirm / Ready — call rider / Handed to customer / Cancel), the vendor queue (inline Confirm/Ready + per-filter counts + "Needs action" chips) and the SLA list; an unverified wallet order shows "Verify the bKash payment first" instead of a Ready button that the database would refuse. (e) *Counter pickups were sent to riders*: `listAwaitingDispatchOrders` and the batch panel drop `is_pickup` rows; staff close a ready pickup with "Handed to customer" — the server walks the rider states for a pickup row only (`counterHandover`, withdraws any live offer first). (f) *Polling never stopped*: `usePoll` pauses `useOrders` (10 s), `useNotifications` (15 s), the dispatch board (15 s, was load-once), the rider job feed (15 s, was load-once — riders reloaded the page to see an offer) and the vendor queue (20 s, was load-once) while the tab is hidden and refreshes on return/focus. (g) Dashboard cards are the doors to their queues (`/admin/orders?status=action`) with the OLDEST waiting age and a rose ring past 15/30 min; wallet-pending banner; SLA list on the dashboard with each order's next step; rider offers show a live countdown, a Google Maps link (pin or address) and the customer's note; dev copy ("(free)", "OSM map free, Cloudinary free tier", "Sunamganj Sadar live!") removed. +4 test files / +56 tests (134 files / 910 green). |
| 131 | **Dispatch board rows linked to a 404 and the live map painted every parcel "unassigned" (Batch H.1, 2026-09-18)** — `listDispatchJobs`/`listRiderJobs` exposed `orderId` as the ROW uuid while every consumer treats `Order.id` as the public order number (§70): the board's `#<id>` link went to `/admin/orders/<uuid>` (detail reads by order number → 404) and `AdminLiveMap` joined `deliveries.orderId === order.id`, which never matched, so every pinned order stayed red. Both feeds now carry `order.id`. Same identity bug on the vendor ledger: the "Order" column showed the first 8 hex of a uuid — `listVendorEarnings` left-joins `orders(order_no)` (left, so a ledger row can never disappear) and the cell links to the vendor order page; the header copy claiming a "Cloudinary-tracked settlement" and a "slice 5" ledger writer is gone — the trigger `trg_orders_ledger_on_delivered` has been live all along. Remaining raw `setInterval` pollers moved to `usePoll` (pause hidden, catch up on return): home live banner (60 s), `/live` (45 s), the customer tracking map's rider-position read (15 s, only while out-for-delivery). The dispatch board's rider roster (online/load/cash) was read once per visit — `useRiders(RIDERS_POLL_MS)` refreshes it every 30 s there (riders page unchanged). Admin header date was `new Date()` in render (impure, never rolled past midnight) → `useNow`. +5 tests (job-feed identity ×2, tracking poll ×3). |
| 132 | **Every one-field product update was refused, the vendor could not publish, and the CSV lied about money (Batch I — catalog, inbox, reports, 2026-09-18)** — (a) *Feature / Archive / Restore on the staff product list never worked*: `updateProduct` ran the full validator over a body without `price`, which sanitised to -1 → "Price must be 0 or more" on every partial PATCH (the vendor and staff PATCH routes are documented as partial). Price and compare-at now fall back to the stored row like name/sku/category already did, and `status` is sanitised (an arbitrary string can no longer reach the enum column). (b) *Vendor product list was a name and a badge*: rewritten around one shelf model (`product-shelf.ts`: Live / Low stock / Sold out / Draft / Archived — the buyer's answer, not the row's flags) with per-state counts, search (Bangla name + SKU), cover photo, "N sold", a Restock link for out/low rows and inline **Publish / Unpublish / Archive / Restore** (`ShelfRowActions`, shared with the staff list); Publish is disabled with the reason when the card would go live without a photo or price; `?shelf=` deep link from the dashboard's restock line. Staff list adopts the same states (a sold-out piece used to hide inside "Published"; the stock column guessed 3/12 units for rows without a count). (c) *Vendor list = 3 queries per product*: `listVendorProducts` read each product bundle separately (200 pieces → 600 round trips on every visit and after every save) → three batched reads. (d) *Inbox*: Unread filter with counts, Today/Yesterday/Earlier groups, "Mark read" on link-less notices, a 4th attention card for wallet payments awaiting verification, cards deep-link to their filtered queues, timestamps tick via `useNow`; `inboxHref` repairs legacy notices whose `href` carried the order ROW uuid (detail reads by order number → 404) using the order number in the title/body; the customer-cancel notice now writes the order number. (e) *Reports*: "By payment method" (cash bag vs bKash vs Nagad — booked, collected under the summary's own rule, awaiting-verification count with a link), Orders CSV + Daily CSV for the selected window, and an honest banner + "Load older orders" when the loaded pages do not cover the window (the old page presented a partial total as All time). (f) *CSV* (`csv.ts`): the export wrote paisa as if taka (`120000` for ৳1,200), broke on a quoted name and opened as mojibake in Excel (no BOM); now RFC-4180 quoting, formula-injection guard, taka with 2 decimals, local time, items / payment / rider / type columns, BOM + CRLF. +5 test files / +31 tests (139 files / 946 green). |

---

## New files

- `src/lib/product-shelf.ts` — shelf state (Live/Low/Sold out/Draft/Archived), counts, publish blockers, row actions
- `src/lib/csv.ts` — RFC-4180 order export (taka, BOM, formula guard)
- `src/components/admin/shelf-row-actions.tsx` — Publish / Unpublish / Archive / Restore from a product row
- `src/lib/use-poll.ts` — visibility-aware background refresh (pauses hidden, refreshes on return/focus)
- `src/lib/payment-labels.ts` — `paymentSummary` / `cashToCollect`: one payment answer for every operator screen
- `src/lib/order-actions.ts` — `primaryAction`: the one next tap per order (admin list, vendor queue, SLA list)
- `src/components/admin/order-row-actions.tsx`, `src/components/admin/payment-chip.tsx` — inline row actions + payment chip
- `src/app/api/vendor/orders/[id]/payment/route.ts` — the shop's own bKash/Nagad decision
- `src/components/ui/drawer.tsx` — accessible, portalled drawer (menu, shop filters, admin nav)
- `src/components/layout/nav-links.tsx` — desktop nav with current-page state
- `src/lib/delivery.ts` — single source of truth for delivery charges & free-delivery
- `src/lib/use-transient-value.ts` — leak-free "flash" state

## New tests (24 net new — 74 → 98)

- `src/components/layout/__tests__/mobile-nav.test.tsx` — the menu opens, is portalled outside the header, locks scroll, closes on Escape / scrim / navigation, and takes focus
- `src/components/shop/__tests__/shop-browser.test.tsx` — price-band bounds, "Newest" ordering, URL→filter sync, derived facets, empty state
- `src/lib/__tests__/delivery.test.ts` — zone charge, free-delivery threshold, cheapest active zone, non-negative totals
- `src/lib/__tests__/store-snapshots.test.ts` — snapshot identity stability (the infinite-render class)
- plus phone-normalisation and cart-clamping cases in the existing suites
