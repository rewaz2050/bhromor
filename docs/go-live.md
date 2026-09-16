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
    (Also the last section of `bootstrap-fresh.sql` / `bootstrap-parts/10`.)

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

## 2. Environment

Vercel project → Settings → Environment Variables (project settings, not
team — see `docs/vercel.md` for Config-vs-Secret types):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server-only
```

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
- [ ] Rider network: `/admin/riders` approve a rider → `/admin/riders` →
      **link rider** with the rider's Auth email → open `/rider` in an
      incognito window → sign in → `/rider` shows their job queue
- [ ] Dispatch: advance a ready order in `/admin/orders` → it appears under
      **Admin → Deliveries → Awaiting dispatch** → **Assign rider** (or wait
      for the auto-offer trigger) → the linked rider sees the offer → accept
      → pickup → deliver with the customer's 4-digit code
- [ ] `/api/rider/*` returns 401/403 for signed-out or unlinked visitors;
      delivery only closes when the customer's 4-digit code matches
- [ ] `/admin/notifications` → **Mark all read** → bell count clears
- [ ] `/api/products`, `/api/zones`, `/api/reviews?featured=1` return rows

If any step fails, see Troubleshooting below before retrying.

## 6. Optional: real image upload (Cloudinary)

Without Cloudinary keys the media page keeps add-by-URL and
`POST /api/media/sign` answers 503 — honest, not broken. To enable the
direct file-picker upload, add the four Cloudinary variables from
`.env.example` in Vercel and redeploy (see `docs/backend.md` §2).

## 7. What is not automated yet

- SMS/WhatsApp: order updates live in the staff inbox + track timeline;
  carrier delivery needs a gateway account (blueprint §35, future phase).
- A hosted newsletter page (`NEWSLETTER_SIGNUP_URL`) still overrides the
  footer form when set — for teams that outgrow the table.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `/api/products` → `NOT_SEEDED` | No published products yet → add them in Admin → Catalog & Products (step 3 only seeds the skeleton) |
| Homepage publish “works” but `/` unchanged | Migration 006 not applied → public read policy missing; apply step 1.7 |
| `/rider` shows only login | No Auth user linked to a `riders` row yet → step 5 rider check + Admin → Riders → link |
| Contact/newsletter submit → “Could not …” | Service-role key missing/typo in Vercel → step 2 + redeploy |
| Admin sign-in → “not a staff member” | Auth user exists but no `admin_users` row → step 4.2 |
| Admin API → 401 right after sign-in | Session cookie lost (private window / clock skew) → sign in again |
| Bell empty after a test order | `notifyStaff` fan-out needs ≥1 `admin_users` row → step 4.2, then re-test |
| `npm run seed` → auth/permission errors | Service-role key wrong or schema older than migrations → re-check step 1–2 |
