# Go-live playbook — from empty store to fully real (owner-run)

Production (`bhromor-zeta.vercel.app`) already talks to Supabase, but on
2026-09-09 the database had **no catalog seed**, so every live checkout
failed. This doc takes the shop from there to fully real: database →
seed → staff → verify. Every step is run by the deployment owner (you);
nothing here needs the sandbox.

> Local `npm run dev` without keys shows an honest empty storefront — no
> demo catalog is painted anymore — and every backend endpoint answers an
> explicit 503/unavailable. There is no browser-local fallback store.

## 0. What “real” now covers

| Surface | Before | Now (after this playbook) |
|---|---|---|
| Catalog / zones / coupons / reviews / orders / riders / shops | Live-capable, DB empty | Seeded live rows |
| Contact form | Fake “sent” screen | `contact_messages` + admin **Messages** inbox + staff notice |
| Newsletter footer | “Opening soon” | Table-based signup + admin **Newsletter** list/CSV/unsubscribe links |
| Homepage CMS | This-browser-only | Published row in `site_settings`; storefront reads it live |
| Media library “added” shelf | This-browser-only | `media_library` table shared by all staff |
| Notifications bell + inbox | Seeded samples | Per-staff rows written by order/review/application/message/signup events |
| Phone notifications (Web Push) | — | `push_subscriptions` + VAPID env; ON card at `/admin/notifications` (see README § “Realtime phone notifications”) |
| Low-stock threshold | This-browser-only | `site_settings['ops']`; dashboard + inventory use it live |
| Track page | No order lookup | Live orders tracked from the DB by id + phone |
| Admin “Reset demo” buttons | (removed) | No demo-reset controls exist; live data is never reset |
| Image upload | Add-by-URL only | Still add-by-URL until Cloudinary keys are set (step 6, optional) |

## 1. Apply the SQL (Supabase Dashboard → SQL editor)

Run **in this order, in one sequence** (skip files you already applied —
`schema.sql` must NOT be re-run on a database that has these tables):

> **First, find out what is missing.** Run
> `supabase/diagnose.sql` in the SQL editor — it lists every object with
> `present = true/false`. A **mix** of true/false means the database is
> partially applied: apply only the missing files, top to bottom.
> A fresh project (all false) can instead paste the single pre-ordered
> `supabase/bootstrap-fresh.sql` — one paste, the whole chain, in-order.
>
> **Why a paste can "run" yet save nothing:** each file is wrapped in its own
> `begin; … commit;`. If any one statement fails (almost always
> `relation X does not exist` — a file that needs an earlier file's tables),
> the whole file rolls back, so nothing appears saved. Read the red error —
> it names the missing relation, and that tells you which file to apply first.
>
> **A file too big to paste?** The SQL Editor is a browser text field and the
> biggest migrations do not survive the paste (the text is cut, and a cut
> `$$`-quoted function reports a nonsense syntax error). Steps **15, 19 and 30**
> are pre-split into 11 small pastes in
> [`supabase/paste-parts/`](../supabase/paste-parts/README.md) — regenerate with
> `node scripts/split-paste.mjs`. That set also **skips step 23 entirely** and
> skips the `ps_place_order` bodies inside steps 15 and 19: all four are
> re-creations of the same function and step 30's version contains every line
> they add, so only the last one is worth pasting. Read the paste-parts README
> before running them — it explains the order and the guards.

1. `supabase/schema.sql` — only if the project is fresh
2. `supabase/migrations/202609080001_storefront_saved_items.sql`
3. `supabase/migrations/202609080002_order_guards.sql`
4. `supabase/migrations/202609080003_place_order_rpc.sql`
5. `supabase/migrations/202609090004_marketplace_shops.sql`
6. `supabase/migrations/202609090005_riders.sql`
7. `supabase/migrations/202609090006_engagement.sql`
8. `supabase/migrations/202609090007_rider_dispatch.sql`
9. **`supabase/migrations/202609090008_dispatch_auto.sql`** —
   auto-offer trigger + admin assign/cancel RPCs (Phase 3 slice 7)
10. **`supabase/migrations/202609100003_per_user_first10_free.sql`** —
    SUPERSEDED by the flat model — skip (kept for history; never apply
    202609100001/202609100002 either)
11. **`supabase/migrations/202609110004_customer_accounts.sql`** — Smart Card
    accounts: `customers` (phone+password, no verification by design) +
    `customer_sessions`; service-role only via the /api/account/* routes
12. **`supabase/migrations/202609110005_launch_offer_free.sql`** —
    SUPERSEDED by the flat model — skip (kept for history)
13. **`supabase/migrations/202609110006_media_video.sql`** — product/library
    videos: adds the `video` media type + `media_library.media_type`.
    No transaction wrapper by design (run the file as-is). Needed before
    saving a product with a Cloudinary/Drive video — see
    [docs/media-setup.md](media-setup.md).
14. **`supabase/migrations/202609120007_flat_delivery.sql`** — FLAT
    DELIVERY: ৳60 everywhere, no launch offer / ৳1000+ threshold / per-user
    first-10-free. Flattens the zone charge column and re-creates
    `ps_place_order` with the flat rule. Run this one for the pricing rule.
15. **`supabase/migrations/202609130008_growth_promos_gift_referral.sql`** —
    *(540 lines — do not paste whole; use `supabase/paste-parts/` 01–02, which
    skip its superseded `ps_place_order`)* P0 growth levers: `price_watches`, `referral_codes`, `referral_rewards`,
    the gift + automatic-offer columns on `orders`, and a new
    `ps_place_order` that recomputes the flash discount from
    `site_settings['ops']`, bounds a bundle claim, prices gift wrap from
    settings and credits a referral only for a proven first order. Also adds
    `ps_credit_referrer(order_id)`, which mints the referrer's ৳50 as a real
    single-use coupon when the friend's order is delivered. Requires 14 (it
    rewrites the same function). See [docs/growth-levers.md](growth-levers.md).
16. **`supabase/migrations/202609140001_review_photos.sql`** — P1 #10 UGC:
    the `review_photos` table (up to 3 photos per review, each a Cloudinary
    URL or a compressed JPEG data URL). Public reads see photos of approved
    reviews only — a pending review's photos are hidden by RLS, exactly like
    the review itself.
17. **`supabase/migrations/202609140002_return_pickups.sql`** — P1 #13
    exchange at-home pickup: `ps_return_eligible` (7 days from the proven
    'delivered' history entry, one live return per parent),
    `ps_create_return_request` (the zero-charge reverse order via
    `ps_place_order`), `ps_return_action` (approve → ready-for-pickup so
    the normal rider dispatch carries the pickup leg; reject → cancelled;
    complete → refunded), and a trigger that mirrors the rider's
    pickup/drop events onto `return_status`.
18. **`supabase/migrations/202609140003_warranty_claims.sql`** — P1 #14
    warranty claims on accessories: `products.warranty_days` (the shop sets
    it per product in the product editor — null = nothing warranted), the
    `warranty_claims` table (admin-only RLS), and `ps_warranty_eligible`
    (order-bound: the item must be on the order, delivered, inside the
    warranty window from the proven 'delivered' history entry, and not
    already claimed). Customers claim from the track page (order number +
    phone, same proof as tracking); the shop reviews and approves/rejects
    with a note from the admin order page. After approval, the replacement
    or refund is the shop's offline handling, recorded in the claim's
    resolution.
19. **`supabase/migrations/202609140004_wallet_payments.sql`** —
    *(571 lines — use `supabase/paste-parts/` 03 for the columns; its three
    functions are superseded by steps 22 and 30)* P1 #8
    bKash/Nagad **without a merchant account**: `orders.payment` widens to
    `cod|bkash|nagad`, plus `payment_ref` (the customer's TRXID),
    `payment_status` and `payment_verified_at`. `ps_place_order` accepts the
    method + TRXID (wallet must be configured in the ops settings),
    `ps_advance_order` refuses to start fulfilment on an unverified wallet
    order, and `ps_verify_payment` is the shop's verify/reject decision
    (reject = cancel + stock released). The shop saves its own wallet numbers
    in Admin → Payments; a method with no number is never offered at
    checkout.
20. **`supabase/migrations/202609140005_live_shopping.sql`** — P1 #9
    live shopping: `live_sessions` (title, when, the shop's own live URL,
    scheduled→live→ended state, the one "on air" piece) +
    `live_session_products` (the pieces, in the order shown). The shop
    streams on its own platform (YouTube Live, Facebook Live, …) — the site
    is the shopping surface around that real stream: a YouTube link embeds
    in place, anything else is a "watch live" link. No video is stored or
    generated, and "LIVE" only shows between the shop's own Start and End
    taps.
21. **`supabase/migrations/202609140006_wallet_delivery_cash.sql`** — P1 #8
    follow-up: `ps_rider_deliver` is re-created wallet-aware. A COD order
    still credits the rider's cash_in_hand with the full total at delivery;
    a bKash/Nagad order credits **zero** (the customer already paid the
    shop's own wallet at checkout) and the history note says so. Run it
    AFTER step 19 — it re-creates the delivery-proof function from step 13.
22. **`supabase/migrations/202609140007_wallet_cancel_payment_settle.sql`** —
    *(172 lines — paste the whole file. This is the CURRENT `ps_advance_order`
    and `ps_verify_payment`. `supabase/paste-parts/` 03 carried step 19's
    columns but deliberately skipped its two older function bodies, so if this
    step never ran, `ps_verify_payment` does not exist at all and
    `ps_advance_order` is still the `schema.sql` one — wallet verification
    cannot work. `supabase/paste-parts/99b_function-versions-probe.sql` says
    which generation is installed.)*
    P1 #8 follow-up: cancelling a wallet order settles its payment. Before
    this, a bKash/Nagad order cancelled while still `pending_verification`
    stayed "under verification" on the customer's track page, and the shop
    could still tap Verify on a cancelled order. Now `ps_advance_order`
    records the payment as **rejected** when it cancels a pending wallet
    order, and `ps_verify_payment` refuses to decide on a cancelled order
    (also covers rows created before this file). Run it AFTER step 19 —
    it re-creates the two functions from step 19 with these additions.
23. **`supabase/migrations/202609140008_return_order_restore.sql`** —
    *(474 lines that are ONE statement — never paste this file. Step 30's
    `ps_place_order` is this exact body plus the PROSANTI+ waiver, so
    `supabase/paste-parts/` 05–09 installs it and this step needs no separate
    run.)* P1 #13 follow-up: `ps_place_order` re-created with the return-order
    handling restored. The flat/growth/wallet re-creations (steps 14/15/19)
    silently dropped the `is_return` mechanics, so customer return requests
    landed as full-price COD orders that could not be approved and could be
    requested without limit. This re-creates `ps_place_order` (the step-19
    wallet version) with zero-charge return orders again: parent must be
    delivered, no stock re-reservation, no ৳500 minimum, total ৳0, and
    `is_return`/`return_parent_id`/`return_status='requested'` written so
    `ps_return_eligible` and `ps_return_action` work. Run it AFTER step 19 —
    it is the newest version of the same function. If a return request was
    made before this step, cancel the stray full-price "Return pickup (…)"
    order from Admin → Orders (its note says so) and ask the customer to
    request the return again.
24. **`supabase/migrations/202609140009_product_sales_view.sql`** —
    P2 #1 best sellers: the `v_product_sales` view — eligible units sold per
    product (non-cancelled order units minus refunded return units), the
    only data source the storefront's "Best sellers" sort and "N sold" card
    badges may use. Read-only (granted to the service role for the catalog
    API); no order of application relative to the others, but it needs the
    base `orders`/`order_items`/return columns, so run it after the P1 files.
25. **`supabase/migrations/202609140010_stock_watches.sql`** —
    P2 #2 back-in-stock alerts: the `stock_watches` table (one row per
    product + phone). Written by the product-page form through
    `/api/stock-watch`; staff read it in Admin → Growth, and the moment a
    product is flipped back in stock the call list lands in the staff
    inbox once. Needs the base `products` table, so run it after the P1
    files.
26. **`supabase/migrations/202609140011_shop_rating_trigger.sql`** —
    P2 #3 shop ratings: the `ps_shop_rating_recompute` function + the
    trigger that keeps `shops.rating_avg`/`rating_count` equal to the
    average over APPROVED reviews. The storefront already renders the
    stars (shop card, shop page, PDP chip) — this is what finally feeds
    them. Needs `reviews.shop_id` (step 4), so run it after the
    marketplace migration. It also backfills the numbers for reviews
    that pre-date the trigger.
27. **`supabase/migrations/202609140012_fabric_transparency.sql`** —
    P2 #9 (brief #21) fabric columns on `products`
    (`fabric_gsm`, `fabric_composition`, `test_report_url`,
    `quality_checked`). Purely additive; until a shop declares a value in
    the editor, nothing renders on any product page.
28. **`supabase/migrations/202609140013_campaign_early_access.sql`** —
    P2 #8 (brief #20) campaign: adds the `campaign` tag column to
    `newsletter_subscribers` (early-access list + CSV export). The
    campaign document itself lives in `site_settings` (key `ops`) — no
    table to seed; Admin → Growth arms it with real dates.
29. **`supabase/migrations/202609140014_rider_availability.sql`** —
    P2 #10 (brief #22) rider shifts: `avail_days` (int[] 0–6, Sunday=0),
    `avail_from_hour`/`avail_to_hour` (0–23, wrap-over allowed) on `riders`
    + patched `ps_next_eligible_rider` which refuses to auto-dispatch to an
    on-duty rider outside her window. NULL/NULL = anytime — existing riders
    behave exactly as before this migration.
30. **`supabase/migrations/202609140015_plus_membership.sql`** —
    *(516 lines — use `supabase/paste-parts/` 04 + 05–09; paste 09 is what
    finally swaps in the FINAL `ps_place_order` for steps 15/19/23/30)* 
    P2 #5 (brief #17) PROSANTI+: `memberships` ledger (pending/active/
    rejected, one pending per phone, admin-only RLS), `orders.is_plus`
    stamp, and `ps_place_order` patched to zero delivery + surcharges when
    the order's phone holds an ACTIVE unexpired term. After applying: set
    the price/wallet path in Admin → Growth (PROSANTI+ card), approve the
    first test application, and place one order with that phone — the
    confirmation must show FREE 👑 and the inserted order row must carry
    `is_plus = true`. There is no auto-renew by design: the term ends on
    `expires_at` and the customer renews from their account page.
31. **`supabase/migrations/202609160001_checkout_delivery_pricing.sql`** —
    checkout repair 1 (2026-09-16): zone tier charges (৳60/120/150/150),
    every active shop serves every checkout zone, and the installed
    `ps_place_order` is patched in place (no 500-line paste). Safe after any
    generation of the RPC.
32. **`supabase/migrations/202609160002_order_insert_repair.sql`** — 🚨
    **checkout repair 2 (2026-09-16) — REQUIRED, or NO order can be placed.**
    Small file, pastes whole, takes seconds, safe to re-run. It fixes the
    order INSERT itself, which every `ps_place_order` since step 15 was
    failing on:
    * `orders.gift_wrap` was created **NOT NULL** (step 15) while the RPC
      writes `NULL` for every non-gift order → SQLSTATE 23502 on *every*
      plain COD order, surfaced as the generic "Could not place the order".
    * the step-3 guard triggers were never updated: `ps_check_order_totals`
      rejected any tip or gift-wrap fee ("order total does not reconcile")
      and `ps_check_order_insert` rejected bKash/Nagad ("only cash on
      delivery is enabled").

    The file drops the NOT NULL, re-creates both guards for the current
    order model (tip + gift fee, zero-total return orders, `cod|bkash|nagad`)
    and adds `ps_checkout_health()`, which `/api/health` now reads: `live`
    is **false** and the admin dashboard shows a red banner naming this file
    until it has run. The paste ends with a 3-row verify — expect 3 × OK.
    (Both repairs are also the last two sections of `bootstrap-fresh.sql`,
    so a fresh project gets them automatically.)
33. **`supabase/migrations/202609160003_order_status_update_repair.sql`** — 🚨
    **checkout repair 3 (2026-09-16) — REQUIRED, or NO order can be moved.**
    Small file, pastes whole, takes seconds, safe to re-run. Found while
    checking why Admin → Orders → *Mark confirmed* did nothing: three
    database defects, all reproduced on a fresh bootstrap:
    * `ps_write_shop_ledger` (step 13's ledger trigger, fires on **every**
      `UPDATE OF status`) compared the `ps_order_status` **enum** with `''`
      → SQLSTATE 22P02 on every status change: Confirm, Preparing, …,
      Delivered, Cancel — staff *and* vendor — all answered "Could not
      update the order."
    * `ps_verify_payment` (steps 24/28) ended with
      `return (select * from orders …)` — a scalar subquery → 42601, so no
      bKash/Nagad payment could ever be verified or rejected.
    * `trg_riders_guard_self_update` (step 6) raised `forbidden` for any
      non-staff write to `riders` other than the online switch — including
      the writes our own RPCs/triggers make (cash-in-hand, load counters,
      GPS, shift): rider *Delivered*, *Reject offer*, location, the
      stale-offer sweep (run before every rider job list and the admin
      Deliveries board) and the vendor's *Ready for pickup* all failed.

    The file re-creates the trigger with `old.status is distinct from
    new.status`, re-creates `ps_verify_payment` with a proper
    `select … into`, makes the riders guard apply only to a rider's own
    **direct** write (and then to nothing but `is_online`), drops the stale
    2-argument `ps_rider_deliver` overload, and extends
    `ps_checkout_health()` (`status_update_ok`, `payment_verify_ok`,
    `rider_guard_ok`) which `/api/health` reads as `checks.orderFlowRepair`.
    `live` stays **false** and the admin dashboard shows a red banner naming
    this file until it has run. Ends with a 4-row verify — expect 4 × OK.
    (Also a late section of `bootstrap-fresh.sql` / `bootstrap-parts/10`.)
34. **`supabase/migrations/202609160004_rpc_grants_rls_repair.sql`** — 🔒
    **security lock (2026-09-16 audit) — strongly recommended.** Small file,
    pastes whole, safe to re-run, changes no feature. Ordering keeps working
    without it, but until it runs the *public* anon key (shipped in every
    page) can reach three things directly through PostgREST:
    * nine SECURITY DEFINER write RPCs with no internal auth check and the
      Supabase default EXECUTE grant — `ps_place_order`, `ps_use_coupon`,
      `ps_book_delivery_slot` (20 calls = a day's slots full),
      `ps_return_action`, `ps_create_return_request`,
      `ps_assign_batch_to_rider`, `ps_credit_referrer`,
      `ps_expire_stale_offers`, `ps_shop_rating_recompute`;
    * `memberships` (step 30's PROSANTI+ table), created with an admin policy
      but **without** `enable row level security`, so every request's phone
      and trxid was readable and its status writable;
    * `delivery_slots`, whose "admin all" policy was `using (true)`.

    The file revokes those RPCs from `anon`/`authenticated` (service_role,
    i.e. every one of our API routes, keeps them), enables RLS on
    `memberships`, rewrites the slot policy to `ps_is_admin()`, and extends
    `ps_checkout_health()` (`rpc_grants_locked`, `memberships_rls`) which
    `/api/health` reads as `checks.securityRepair`. `live` is **not** gated
    on it; the admin dashboard shows an amber "security lock pending" note
    under the green chip until it has run. Ends with a 3-row verify —
    expect 3 × OK. (Also in `bootstrap-fresh.sql` / `bootstrap-parts/10`;
    `diagnose.sql` rows 35–35c.)

35. **`supabase/migrations/202609160005_dispatch_reoffer_repair.sql`** — 🛵
    **dispatch re-offer repair (2026-09-16 audit) — required before riders
    work a real day.** Small file, pastes whole, safe to re-run. Two defects
    in the delivery-offer chain, both reproduced against a fresh bootstrap:
    * `delivery_assignments` was created with `UNIQUE (order_id)`, but every
      re-offer path (`ps_expire_stale_offers`, `ps_rider_reject`,
      `ps_offer_order`) *inserts a second row* for the same order. So the
      moment ONE 90-second offer lapses while a second eligible rider is
      online, the sweep raises `23505` — and because the sweep runs at the
      top of `GET /api/rider/jobs`, **every rider's job feed answers 503**
      until that row is fixed by hand. A rider tapping Reject hit the same
      wall.
    * `ps_assign_batch_to_rider` called a `ps_assign_order_to_rider` that
      never existed and read a `rider_assignments` table that never existed
      — Admin → Deliveries → Batch assign has never assigned anything.

    The file drops the unique constraint and replaces it with a **partial**
    unique index (`delivery_assignments_one_live_offer`: one row per order
    in `offered`/`accepted`/`picked_up`, so history and the "already seen"
    rotation are kept), rewrites `ps_assign_batch_to_rider` as a direct
    90-second offer to the chosen rider (withdraws other riders' live
    offers, never touches a picked-up parcel, skips orders that are not
    ready, returns the count; rider must be active + online), keeps it
    service-only, and extends `ps_checkout_health()` with
    `dispatch_reoffer_ok` → `/api/health` `checks.dispatchRepair` + an amber
    note on the admin dashboard until it has run. Ends with a 3-row verify —
    expect 3 × OK. (Also the last section of `bootstrap-fresh.sql` /
    `bootstrap-parts/10`; `diagnose.sql` rows 36–36d.)

36. **`supabase/migrations/202609170001_two_tap_order_flow.sql`** — ⚡
    **two-tap order flow (2026-09-17 audit).** Tiny file, pastes whole, safe
    to re-run. Staff/vendor now move an order with **two taps** — *Confirm*
    (pending → confirmed) and *Ready — call rider* (confirmed →
    ready-for-pickup, which fires the existing auto-dispatch). Until this
    runs, `ps_advance_order` only accepts +1 steps, so the second button is
    served by the app as two internal RPC calls (confirmed → preparing →
    ready-for-pickup, with a `console.warn` naming this file). The migration
    re-creates `ps_advance_order` with that single extra allowance
    (`confirmed → ready-for-pickup`); every other rule is untouched — no
    other skips, no backwards moves, cancel only from pending / confirmed /
    preparing, vendors limited to their own shop's confirmed / preparing /
    ready / cancelled, bKash/Nagad still blocked past confirmed until
    `ps_verify_payment`, rider RPCs and the dispatch trigger unchanged. It
    also extends `ps_checkout_health()` with `two_tap_flow_ok` →
    `/api/health` `checks.twoTapFlow` + an amber note on the admin
    dashboard until it has run. Ends with a 2-row verify — expect 2 × OK.
    The customer-facing track page now shows four milestones (Order placed
    → Confirmed → Picked up → Delivered) regardless of this migration.

37. **`supabase/migrations/202609170002_perf_indexes.sql`** — ⚡ **speed
    (2026-09-17 audit, Batch B).** Seven `create index if not exists`
    statements, no data change, safe to re-run, seconds to apply. Adds the
    composite indexes the hot lists were missing: `orders (status,
    created_at desc, id desc)` for Admin → Orders keyset paging,
    `orders (shop_id, created_at desc)` for the vendor list, a partial
    `orders (rider_id)` for the rider's deliveries, `delivery_assignments
    (rider_id, state, offered_at desc)` for the rider board, a partial
    `delivery_assignments (state, order_id)` over the live states for the
    dispatch "awaiting" filter, `orders (return_parent_id, created_at desc)`
    for return links and `referral_rewards (referee_phone)` for the
    phone-scoped referral proof. Nothing breaks without it — the app is
    faster on its own from this batch (CDN caching of the public catalog
    routes, one batched order mapper, a scoped checkout snapshot) — but at a
    few thousand orders the admin list and boards stop scaling without
    these. Ends with a 7-row verify — expect 7 × OK.

Quick check after step 11 (SQL editor):

```sql
select key from site_settings where key in ('homepage', 'ops');
select count(*) from contact_messages;
select count(*) from newsletter_subscribers;
select count(*) from media_library;
select count(*) from orders where delivery_code is not null;
select count(*) from delivery_assignments;
select count(*) from customers;
```

All statements must run without “relation does not exist”.

### Area dispatch follow-up (2026-09-25)

After the existing migrations, apply in order:
- `supabase/migrations/202609250001_area_broadcast_dispatch.sql`
- `supabase/migrations/202609250002_dispatch_cancel_guard.sql`
- `supabase/migrations/202609250003_dispatch_withdraw_resume.sql`
- `supabase/migrations/202609250004_settle_claims.sql`
- `supabase/migrations/202609250005_delivery_pin_lockout.sql`
- `supabase/migrations/202609250006_dispatch_health.sql`
- `supabase/migrations/202609250007_realtime_offers.sql`
- `supabase/migrations/202609250008_delivery_ratings.sql`
- `supabase/migrations/202609260001_password_reset_requests.sql` — password
  reset **requests** for vendor / rider logins (no SMS, no e-mail): the
  login page files a request, staff verify by phone and approve under
  Admin → Access requests, and the person sets a new password themselves
  within 24 h. One table + one staff RLS policy; safe to re-run. Until it
  is applied, "পাসওয়ার্ড ভুলে গেছেন?" answers 503 and Admin → Access
  requests explains what to run; the card-level **Reset password** keeps
  working regardless.
- `supabase/migrations/202609260002_application_review.sql` — application
  **review + rider KYC** (round 4): widens the shop / rider status check to
  allow `rejected`, adds `review_note`, `reviewed_by`, `reviewed_by_email`,
  `reviewed_at` to both tables and `kyc` (jsonb) + `kyc_submitted_at` to
  riders. Pure `alter table … if not exists`; safe to re-run; nothing to
  back-fill. Until it is applied, the **Approve / Reject…** strip on Admin →
  Shops / Riders answers 503 naming this file (the old row edit still
  saves), and the rider's KYC card says uploads are not enabled yet — the
  application itself is unaffected.
- `supabase/migrations/202609260003_free_delivery.sql` — **free delivery
  threshold** (platform rule + per-shop opt-in): adds `shops.free_delivery_min`
  and `orders.free_delivery_by` / `free_delivery_waived`, patches the live
  `ps_place_order` **in place** (it reads the deployed function, inserts the
  rule after the PROSANTI+ block and re-creates it — so it works on top of
  every earlier repair without re-pasting the whole function), and re-creates
  `ps_write_shop_ledger` so a shop-funded waiver comes out of that order's
  payable. Idempotent (a second run says "already prices the free-delivery
  threshold"). **Verify:** the run ends with `NOTICE: FREE DELIVERY OK`.
  Then switch it on: Admin → Settings → *ফ্রি ডেলিভারি — প্ল্যাটফর্ম অফার*
  (PROSANTI pays) and/or Vendor → Settings → *ফ্রি ডেলিভারি অফার* (the shop
  pays). Until it is applied, saving a minimum answers 503 naming this file
  and checkout charges exactly as before.

Step 36 (two-tap flow) is required for the shop's Confirm → Ready button.
Fresh bootstrap/bootstrap-parts now include it and all six area-dispatch
migrations. Never run the entire bootstrap on an existing database.
`diagnose.sql` rows 37–37g confirm each P0 piece; `/api/health` (staff view)
names any missing file in Bengali nextSteps. Verification evidence and
remaining live checks: `docs/VERIFICATION-2026-09-25.md`.

## 2. Environment

Vercel project → Settings → Environment Variables (project settings, not
team — see `docs/vercel.md` for Config-vs-Secret types):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server-only
NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site   # the public domain, no trailing slash
# HEALTH_TOKEN=<random string>   # optional: lets an uptime monitor read the full /api/health
```

`SUPABASE_SERVICE_ROLE_KEY` is not optional any more (2026-09-16): after
migration 0004 the staff routes reach the service-only RPCs (returns,
dispatch board, batch assign) through it, and `/api/health` /
`/api/orders` need it as before. `NEXT_PUBLIC_SITE_URL` is what
`<link rel=canonical>`, `og:url`, `/sitemap.xml` and `/robots.txt` print —
without it Vercel's production domain is used, and off Vercel the fallback
is `https://prosanti.store`.

After any env change: Deployments → ⋯ → **Redeploy** with “Use existing
Build Cache” **unchecked**.

## 3. Seed the store skeleton — then add real products

On any machine with the repo + `.env.local` (same three keys):

```bash
npm run seed:dry   # review the plan (writes nothing)
npm run seed       # upsert shop #1, categories, zones, starter settings
```

Re-running is safe (upserts on natural keys). The script never seeds fake
orders, fake reviews, sample products or demo coupons — those are all gone
(2026-09-14): products, variants, media and coupons are created by YOU in
Admin → Catalog & Products / Coupons, and the storefront shows nothing but
your real rows until then.

> **No more "self-heal".** `POST /api/orders` on an empty catalog answers an
> honest 503 ("this shop has no published products") — it no longer inserts
> a sample catalog to keep a checkout alive. Publish your first products
> before sharing the link.

Verify: `GET https://<your-app>/api/products` must return products, not
`{"code":"NOT_SEEDED"}` — i.e. after you added real items in the admin.

> **দ্রুততম পথ (এই মুহূর্তে):** বাকি ৪টে (steps 27–30) একসাথে
> `supabase/pending-p2-final.sql` — ~31KB, **এক পেস্টে** Run → তারপর
> `supabase/verify-p2.sql` চালালে ৬টা check-ই `OK` দেখাবে।
>
> **🚨 চেকআউটে "Could not place the order" আসছে?** (2026-09-16) —
> `supabase/migrations/202609160002_order_insert_repair.sql` (step 32) এখনো
> চালানো হয়নি। ছোট ফাইল, পুরোটা পেস্ট করে Run — শেষে ৩টা `OK`। এটা ছাড়া
> `ps_place_order` থাকলেও ডেটাবেস কোনো অর্ডার row নিতে পারে না
> (`orders.gift_wrap` NOT NULL + পুরনো guard trigger)। `/api/health`-এ
> `checkoutRepair: true` দেখালেই হয়ে গেছে।
>
> **🚨 অর্ডার আসছে কিন্তু Admin-এ Confirm/Cancel কিছু হচ্ছে না?** (2026-09-16) —
> `supabase/migrations/202609160003_order_status_update_repair.sql` (step 33)
> চালানো হয়নি। ছোট ফাইল, পুরোটা পেস্ট করে Run — শেষে ৪টা `OK`। এটা ছাড়া
> ডেটাবেসের ledger trigger প্রতিটা status পরিবর্তন আটকে দেয়, bKash verify
> কাজ করে না, rider-এর Delivered বাটনও না। `/api/health`-এ
> `orderFlowRepair: true` দেখালেই হয়ে গেছে।

### বড় SQL পেস্ট করা যাচ্ছে না? (Supabase editor freeze)

`supabase/bootstrap-fresh.sql` ≈৩০০KB — পুরোটা SQL Editor-এ পেস্ট করবেন **না**।
তিনটা পথ, যেকোনো একটা:

1. **Migration ধরে ধরে চালান (recommended — এই ডক-এর উপরের ধাপগুলো)।**
   প্রতিটা ফাইল ছোট (≤~25KB), Editor সহ্য করে। নতুন দোকানের জন্য 0001 →
   0015 পর্যন্ত একবারে একটা করে Run; মাঝখানের কোনোটা বাদ যাবে না।
2. **Parts paste করুন:** `npm run split:bootstrap` চালালে
   `supabase/bootstrap-parts/01…09_*.sql` তৈরি হয় (repo-তে committed-ও আছে) —
   এগুলো ক্রমানুসারে, একবারে একটা করে Editor-এ পেস্ট করলেই চলবে; প্রতিটা part
   নিজের মধ্যে committed transaction-এ থাকে।
3. **psql (fastest for one shot):** Supabase Dashboard → Settings → Database →
   **Connection string (Session pooler, port 5432)** —

   ```bash
   psql "postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-<region>.pooler.supabase.com:5432/postgres" \
     -v ON_ERROR_STOP=1 -f supabase/bootstrap-fresh.sql
   ```

   Windows-এ `psql` লাগলে: `winget install PostgreSQL.PostgreSQL` (client tools
   যথেষ্ট)। ফাইল idempotent, তাই মাঝপথে থামলে পুরোটা আবার চালানো নিরাপদ।
4. **একটা migration-ই যদি Editor-এ না ঢোকে (৩০০+ লাইন, বা একটাই বিশাল
   statement):** `supabase/paste-parts/` — ওই ফাইলগুলো ছোট পেস্টে ভাগ করা,
   ক্রম আর কারণ ফোল্ডারের `README.md`-তে। একটা `CREATE FUNCTION` SQL হিসেবে
   কাটা যায় না, তাই সেটা base64-এর চার ভাগে গিয়ে শেষ part-এ md5 যাচাই হয়ে
   তৈরি হয় — Editor পেস্ট নিজে statement-এ কাটে বলে readable SQL ভেঙে যেত।
   নতুন করে ভাগ করতে: `node scripts/split-paste.mjs`।
5. **কোন ধাপটা আসলেই লেগেছে, আর কোন ফাংশনের কোন ভার্সন বসে আছে?**
   `supabase/paste-parts/99a_whats-applied-probe.sql` (প্রতিটা ধাপের অবজেক্ট
   ধরে ধরে `APPLIED` / `PARTIAL` / `NOT APPLIED`) আর
   `99b_function-versions-probe.sql` (যে ফাংশনগুলো একাধিক migration-এ আছে
   তাদের `md5(prosrc)` মিলিয়ে `latest` / `OUTDATED — step NN` / `MISSING`)।
   দুটোই read-only, যতবার খুশি চালানো যাবে। তৈরি করে
   `node scripts/probe-applied.mjs`।

## 4. First staff account

1. Supabase Dashboard → Authentication → Users → **Add user** with the
   owner email `rahatbd2050@gmail.com` (strong password; confirm the email
   there if confirmation mails are off).
2. Grant the role from a machine with the repo + keys:

```bash
npm run grant-admin -- rahatbd2050@gmail.com super_admin
```

3. Open the secret admin login path (see `ADMIN_LOGIN_PATH` in `src/lib/admin-auth.ts`) — it is the real staff login — and sign in with the
   granted account. Only Supabase Auth + an `admin_users` row works; there
   are no demo credentials.

## 5. Verify everything is real (checklist)

Do these on the deployed site, in order:

- [ ] `GET /api/health` → `"live": true`, all `checks` true (probe verifies
      seed counts + the `ps_place_order` RPC; `/admin` home shows a
      green **LIVE** banner once every check passes, an amber checklist while
      anything is missing)
- [ ] `/checkout` shows the flat ৳60 promise — no launch-offer counter, no free-delivery threshold, no first-10-free copy anywhere
      (check `snapshot.customerOrderCount` on a placed order in Supabase)
- [ ] `/shop` shows the seeded catalog with live prices
- [ ] `/admin/homepage` → change the hero title → **Publish** → public `/`
      shows it (proves the CMS row + public read policy)
- [ ] `/contact` → send a message → `/admin/messages` shows it (status
      `new`) and the bell gains an unread notice
- [ ] Open the message → **Mark replied** → status flips
- [ ] Footer → join the newsletter → `/admin/newsletter` lists the email;
      **Export CSV** downloads it; copy an **Unsub link**, open it in a new
      tab → `{"unsubscribed":true}`, row flips to unsubscribed
- [ ] `/admin/media` → add an image URL → it persists across reloads and
      browsers (proves the shared table, not localStorage)
- [ ] `/admin/settings` → set the low-stock threshold → dashboard and
      inventory alerts follow it; no demo-reset buttons anywhere
- [ ] `/checkout` → place a real test order (COD) → confirmation shows the
      4-digit delivery PIN → `/track` finds it by ID + phone →
      `/admin/orders` shows it → advance it → bell notice
- [ ] Rider network: open `/rider/apply` in an incognito window → send an
      application with an email + password → `/rider/login` with it shows
      **"অনুমোদনের অপেক্ষায়"** (not the app) → `/admin/riders` shows the
      rider as **Linked** → approve → sign in again → `/rider` shows their
      job queue. (**Link rider** is only for legacy / manually created rows.)
- [ ] Shop network: same with `/shops/apply` → `/vendor/login` shows
      "Awaiting approval" → `/admin/shops` approve → the dashboard opens
      (leave the login tab open: it lets the applicant in by itself within
      30 s of the approval; the admin nav showed the pending count meanwhile)
- [ ] Password reset without e-mail (self-service request): `/rider/login`
      → **পাসওয়ার্ড ভুলে গেছেন?** → the test rider's email + phone → "অপেক্ষায়"
      → the admin bell and dashboard banner show *1 password reset request*
      → Admin → **Access requests** → Call (tick "they confirmed") →
      **Approve** → within 20 s the rider's login page shows the
      new-password form by itself → set it → sign in with it. Repeat once
      for the test shop at `/vendor/login`.
- [ ] Password reset without e-mail (staff-issued): Admin → Shops → the
      test shop → **Reset password** → the temporary password shows once →
      sign in with it at `/vendor/login` → Shop settings → **পাসওয়ার্ড বদলান**
      → sign out / in with the new one.
- [ ] Reject with a reason (round 4): a second test rider applies **without
      an e-mail** (mobile number only) → `/rider/login` with the **mobile
      number** + password shows "অনুমোদনের অপেক্ষায়" and the **KYC** card →
      upload NID front/back + selfie from a phone (Cloudinary configured) →
      Admin → Riders shows **KYC 3/3 — complete** with thumbnails → **Reject…** with
      a reason → the rider's login page shows "আবেদন অনুমোদন হয়নি" with that
      reason and **তথ্য ঠিক করে আবার আবেদন করুন →** → re-apply with the same
      number + password → Admin → Riders shows the same rider pending again
      ("re-submitted" in the bell), KYC photos kept → **Approve** → the card
      reads "Approved by <you> · just now" → `/rider` opens.
- [ ] Vendor checklist: sign in as a freshly approved shop → `/vendor` shows
      **Get your shop ready** (n/5) → add address, tagline, 3 products with
      photos, switch to Open → the card disappears.
- [ ] Dispatch: advance a ready order in `/admin/orders` → it appears under
      **Admin → Deliveries → Awaiting dispatch** → **Assign rider** (or wait
      for the auto-offer trigger) → the linked rider sees the offer → accept
      → pickup → deliver with the customer's 4-digit code
- [ ] `/api/rider/*` returns 401/403 for signed-out or unlinked visitors;
      delivery only closes when the customer's 4-digit code matches
- [ ] `/admin/notifications` → **Mark all read** → bell count clears
- [ ] Phone notifications: `PUSH_VAPID_PUBLIC_KEY` + `PUSH_VAPID_PRIVATE_KEY`
      set on the host and `202609210001_push_subscriptions.sql` applied →
      `/admin/notifications` shows a green checklist (“Server key”, “Database
      table”, “Ei browser”, “Browser permission”, “Ei phone ta”) → tap
      **Phone notification ON korun** → **Test pathan** → the notification
      lands on the phone with the panel closed. Android 13+: Chrome itself
      also needs notification permission; a browser that already answered
      “Block” must be reset in Chrome → Site settings → Notifications.
- [ ] Customer notifications: `202609240001_customer_push.sql` applied →
      `/api/health` shows `customerPushTableReady: true` → on a phone open
      `/track` for a live order → **অর্ডারের খবর ফোনে নিন** → allow → **টেস্ট
      পাঠান** lands → Confirm the order in the panel → the shopper's phone
      buzzes and the tap opens that order's tracker
      (details: `docs/customer-notifications.md`)
- [ ] WhatsApp drafts: `202609240003_wa_outbox.sql` applied → `/api/health`
      shows `waOutboxReady: true` → advance an order whose shopper never turned
      phone notifications on → the order page shows **WhatsApp message ready**,
      one tap opens WhatsApp prefilled, and the orders list counts the queue
- [ ] `/api/products`, `/api/zones`, `/api/reviews?featured=1` return rows

If any step fails, see Troubleshooting below before retrying.

## 6. Optional: real image upload (Cloudinary)

Without Cloudinary keys the media page keeps add-by-URL and
`POST /api/media/sign` answers 503 — honest, not broken. To enable the
direct file-picker upload, add the four Cloudinary variables from
`.env.example` in Vercel and redeploy (see `docs/backend.md` §2).

## 7. What is not automated yet

- **The clock itself** (`/api/cron/tick`, docs/automation.md): stale rider
  offers, the ~2h delivery reminder and the 9am staff digest only run while a
  scheduler is wired — set `CRON_SECRET` in Vercel **and** as the GitHub
  Actions secret `CRON_SECRET`, run `202609240002_cron_marks.sql`, then
  *Actions → Shop clock → Run workflow*. `/api/health` says
  `cronConfigured` / `cronMarksReady` / `cronLastRunAt` and names the missing
  piece in `nextSteps`.
- SMS: order updates live in the staff inbox, the track timeline and (for
  opted-in phones) Web Push; a carrier/SMS gateway needs a paid account
  (blueprint §35, future phase). WhatsApp needs **no** gateway: the free draft
  outbox (`202609240003_wa_outbox.sql`) writes the prefilled message and a
  staff tap sends it — the paid Cloud API is deliberately not used (why not:
  `docs/customer-notifications.md` §2).
- A hosted newsletter page (`NEWSLETTER_SIGNUP_URL`) still overrides the
  footer form when set — for teams that outgrow the table.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `/api/products` → `NOT_SEEDED` | No published products yet → add them in Admin → Catalog & Products (step 3 only seeds the skeleton) |
| Homepage publish “works” but `/` unchanged | Migration 006 not applied → public read policy missing; apply step 1.7 |
| `/rider` shows only login | Not signed in, or a legacy `riders` row with no Auth user → step 5 rider check + Admin → Riders → link (applications since 2026-09-26 arrive linked) |
| `/rider/login` or `/vendor/login` shows "awaiting approval" | Expected until staff approves: Admin → Riders / Shops → **Approve** (status → active); the same email + password then open the app |
| Apply form → "This email already has a PROSANTI login" (409) | The email has an account with a different password → use that password in the form, or sign in first and apply again |
| Apply form → "this phone number already has an application" (409) | A shop row with that phone exists (pending or active) → find it in Admin → Shops; approve / edit it instead of creating a second one |
| Vendor or rider forgot the password (no reset e-mail is ever sent) | Tell them to tap **পাসওয়ার্ড ভুলে গেছেন? / Forgot your password?** on their login page and enter the application email + phone. The request lands in Admin → **Access requests** (bell + dashboard banner): **call the number on file**, tick the confirmation, **Approve** → their login page switches to a new-password form by itself (24 h window). Can't reach them / no smartphone: the shop / rider card's **Reset password** gives a temporary password to read out |
| "পাসওয়ার্ড রিসেট সার্ভিস এখনো চালু হয়নি" (503) on the login page | Migration `202609260001_password_reset_requests.sql` not applied → step 1; meanwhile use the card's **Reset password** |
| Admin → Shops / Riders → Approve or Reject → "Application review is not set up on this database yet" (503) | Migration `202609260002_application_review.sql` not applied → step 1. Meanwhile **Edit → Save** on the card still changes the status (no audit stamp) |
| Rider's KYC card says "কাগজপত্র আপলোড এখনো চালু হয়নি" / "ছবি আপলোড এখনো কনফিগার করা হয়নি" | First message: migration `202609260002` missing → step 1. Second: Cloudinary env not set → step 6. The application is filed either way; approve after a phone/WhatsApp check of the NID instead |
| Vendor → Settings → free delivery → "ফ্রি ডেলিভারি এখনো এই ডেটাবেসে চালু হয়নি" (503), or Admin → Shops → Save → "Free delivery is not set up on this database yet" | Migration `202609260003_free_delivery.sql` not applied → step 1 (look for `FREE DELIVERY OK`). Profile saves without the field still work |
| Bag shows "delivery is free" but the order was charged | The RPC is authoritative: either the migration is missing (see above — the storefront reads the rule from settings, the database cannot price it yet), the address resolved to the courier zone (z4 is never free), or a coupon / PROSANTI+ already waived it. Check `orders.free_delivery_by` on the row |
| Shop asks why a payout is lower than subtotal − commission | Its own free-delivery offer paid that order's rider charge: Vendor → Orders → the order shows "আপনার ফ্রি ডেলিভারি অফার (পেআউট থেকে কাটা হবে) −৳60". Platform-funded waivers (`free_delivery_by = 'platform'`) never change the payout |
| Applicant has no e-mail | Leave the e-mail field empty on the apply form: the login is the **mobile number** + password (the server stores `01XXXXXXXXX@phone.prosanti.app` internally; nothing is sent there). Staff screens show it as "01… (phone login)". The reset panel works the same way — mobile number, e-mail left empty |
| Rejected applicant says "I fixed it, what now?" | They re-open the apply form and submit again with the **same** e-mail / mobile number + password → the rejected row goes back to pending with the new details (the bell says "re-submitted"). Admin → filter **rejected** to see what is waiting for a fix; **Re-open** puts a row back to pending without their action |
| Reset request says "এই ইমেইল ও ফোন নম্বরের কোনো … লগইন পাওয়া যায়নি" | The pair must match the shop's `contact_email` + `phone` / the rider's row exactly (legacy rows linked by a different email won't match) → fix the row in Admin → Shops / Riders, or use the card's **Reset password** |
| Approved someone — how do they know? | The card's **WhatsApp: approved, sign in →** button opens a prefilled Bangla message with the login URL. Their login page also re-checks every 30 s on its own while the "awaiting approval" card is open |
| New applications go unnoticed | The Shops / Riders links in the admin nav carry the pending count and the dashboard shows a banner; both refresh every 30 s while the tab is visible |
| Contact/newsletter submit → “Could not …” | Service-role key missing/typo in Vercel → step 2 + redeploy |
| Admin sign-in → “not a staff member” | Auth user exists but no `admin_users` row → step 4.2 |
| Admin API → 401 right after sign-in | Session cookie lost (private window / clock skew) → sign in again |
| Bell empty after a test order | `notifyStaff` fan-out needs ≥1 `admin_users` row → step 4.2, then re-test |
| `npm run seed` → auth/permission errors | Service-role key wrong or schema older than migrations → re-check step 1–2 |
