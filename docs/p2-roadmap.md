# P2 roadmap — status (one-by-one delivery)

P0 (growth levers) and P1 (the nine foodpanda-grade features) are shipped —
see [p1-roadmap.md](p1-roadmap.md). P2 is the next tier of the same brief
("better than foodpanda — for clothes"): real social proof and the
shop's own numbers, built only on data the database can prove. Each item
lands **one by one** with the same bar: code + tests + honest UX, no
external dependency that doesn't exist yet.

| # | Feature | State | Notes |
|---|---------|-------|-------|
| 1 | **Best sellers from real orders** | ✅ Shipped 2026-09-14 | `v_product_sales` view + "Best sellers" sort + "N sold" card badges; the sales ranking storefront-phase-two.md deferred on purpose |
| 2 | Back-in-stock alerts | ✅ Shipped 2026-09-14 | price-watch's sibling: watch an OUT-OF-STOCK piece, staff gets the number when stock is restocked (same honest "shop calls" mechanism — no SMS sender in this stack) |
| 3 | Shop ratings from approved reviews | ✅ Shipped 2026-09-14 | blueprint §2 "reviews extend to shop ratings": the trigger maintains `shops.rating_avg/rating_count` from APPROVED reviews only; the storefront (already wired) shows stars on shop card / shop page / PDP chip; 0 reviews = no stars, never a seed |
| 4 | Admin best-sellers in Reports | ✅ Shipped 2026-09-14 | the same `v_product_sales` view, server-side top list on Admin → Reports (units, last-30-days, orders, revenue) so the shop sees exactly what the storefront shows |
| 5 | **PROSANTI+ membership** *(brief #17)* | ✅ Shipped 2026-09-14 | ৳99/month, manual bKash/Nagad TRXID activation by the shop (P1 #8 trust model, no PSP) — free delivery + surcharges waived by `ps_place_order` itself, one answer in three surfaces (RPC, checkout mirror, account card). No auto-renew anywhere: the term just ends on its date |
| 6 | **Multi-shop cart** *(brief #18)* | ⏸ Deferred — documented below | checkout is single-shop by architecture (zone per order, coupons per order, one `ps_place_order` call per order); a split-bag cart would silently break all three — see the section at the end for the safe path when it is built |
| 7 | **Style Match** *(brief #19)* | ✅ Shipped 2026-09-14 | rules-based recommender at `/style` — occasion → real subcategories, budget/size/colour scored with every reason shown; hard gates never “low-score a wrong item”; **no AI claim anywhere** (there is no model here — and honesty is the feature) |
| 8 | **Campaign landing** *(brief #20)* | ✅ Shipped 2026-09-14 | admin-configured festive campaign (`/campaign` + site strip): real date window, real countdown, early-access newsletter tag with backfill + CSV; disarmed = the page honestly says “nothing running” |
| 9 | **Fabric transparency card** *(brief #21)* | ✅ Shipped 2026-09-14 | GSM / composition / test-report link declared per product in the vendor & admin editors — renders only what the shop ticked; seeded catalog carries zero claims |
| 10 | **Rider shifts** *(brief #22)* | ✅ Shipped 2026-09-14 | riders set day/hour windows in Dhaka time (night wraps allowed); auto-dispatch is the only enforcer and treats a rider with no shift as always-available; admin sees the live on/off-shift chip |
| 11 | **Vendor insights** *(brief #23)* | ✅ Shipped 2026-09-14 | vendor dashboard: weekday demand, price-band mix, top products — computed server-side from the loaded orders, labelled “recent loaded orders, not a forecast” |
| 12 | **Zone demand** *(brief #24)* | ✅ Shipped 2026-09-14 | admin reports: orders/revenue share per zone (Dhaka-time buckets, cancelled never counted), busiest-day honesty, zero-order zones shown at zero |

**Deliberately NOT in P2** (they need things that don't exist yet — listed
so they aren't half-built):

- **SMS/WhatsApp notification channels** — needs a gateway account
  (docs/go-live.md §7). Until then, every "we'll let you know" feature
  resolves to a staff inbox note with the customer's number.
- **Card / Rocket payments** — need a PSP merchant account; bKash/Nagad
  wallet verification (P1 #8) covers digital payments without one.
- **Verified size charts** — need garment-specific measurements and a
  documented measurement method; generic S/M/L tables cause wrong purchases.
- **Instagram / social proof feed** — needs approved customer-photo consent
  and the official handle.

---

## #1 — Best sellers from real orders (shipped)

The storefront used to say "Featured" on the homepage and nothing else about
sales — [storefront-phase-two.md](storefront-phase-two.md) had deferred the
sales ranking on purpose: *"Connect a server-side aggregate of eligible
sales by product ID, excluding cancelled/refunded units, before displaying a
sales ranking."* Now that orders are real database rows, that aggregate
exists — and only it can power a ranking.

- **DB (`202609140009_product_sales_view.sql`)** — `v_product_sales`:
  eligible units per product =
  `+ units on every NON-CANCELLED order` (pending…delivered — a placed order
  is a real order)
  `− units on return orders the shop completed (return_status = 'refunded')`
  (the item came back to the shelf). A return still in flight does not
  subtract yet — the item has not been proven back, so the sale stands; a
  rejected (cancelled) return subtracts nothing. Read-only view,
  service-role grant for the catalog API, no public RLS surface.
- **Catalog API** — `fetchLiveCatalog` joins the view and carries
  `unitsSold` on each live product. A hiccup on the sales read degrades to
  "no badge", never to a broken catalog.
- **Storefront** —
  - Shop page: **Best sellers** sort (descending real units; products with
    no sales figure sort after every product that has one — the static
    launch catalog has none, so on an unseeded store the sort is an honest
    no-op instead of an invented ranking).
  - Product card: **N sold** under the price — only when the figure exists
    and is > 0. No figure, no line.
- **Honesty:** the number is the orders table. There is no "popularity
  score", no weighted/decayed rank, no seed — a shop with no sales shows no
  sales, and the homepage's editorial "Featured" rail stays exactly what it
  is (the shop's choice), not a sales claim.
- **Tests** — catalog join (attached + degraded), shop sort order, card
  badge (absent vs present).

---

## #2 — Back-in-stock alerts (shipped)

The other reason a shopper leaves a piece is not the price — it was the
exact one, and it sold out. The mechanism is the sibling of P0 #5's
price-drop watch, and the promise is equally honest: **there is no SMS or
email sender in this stack, so the alert is a call from the shop** — the
same way PROSANTI already confirms orders.

- **DB (`202609140010_stock_watches.sql`)** — `stock_watches`: one row per
  (product, phone), written only through `/api/stock-watch` (service role),
  staff-readable in Admin → Growth. `last_notified_at` is informational;
  the dedupe is the event itself, so a value in the row can never swallow
  a real restock.
- **The event is a transition, not a level.** `updateProduct` fires
  `flagRestockForStaff` only when the saved product flips
  **out-of-stock → in-stock**. One restock = one inbox note; re-saving the
  same stock is a no-op; a piece that sells out again later earns a new
  note — a real new event, not a nag.
- **Storefront** — the PDP shows a "Call me when it's back" card **only
  while the product is actually out of stock** (a "notify me" on something
  you can buy right now is a lie, so there is no such state). Number is
  normalized + format-checked server-side; rate-limited per IP.
- **Staff side** — the one-line inbox note carries the product and the
  numbers to dial; Admin → Growth lists every waiting shopper with a
  `tel:` link and when they were last notified.
- **Tests** — db (upsert/delete targeting, restock fan-out per staff
  inbox, no-watchers no-op, broken-read non-fatal), route (201/422/503/
  429 + delete targeting), component (absent when in stock, form records
  the number, failure is shown).

---

## #3 — Shop ratings from approved reviews (shipped)

Blueprint §2 said reviews "extend to shop ratings": `shops.rating_avg` /
`rating_count` were built in `202609090004` (with `reviews.shop_id`
denormalized + backfilled), the `Shop` mapper already carried
`ratingAvg/ratingCount`, and the storefront already rendered stars on the
shop card, the shop-page hero and (now) the PDP shop chip — **all gated on
`ratingCount > 0`**. The only missing half was the writer: nothing ever
updated the columns, so every shop sat at 0 forever.

- **DB (`202609140011_shop_rating_trigger.sql`)** —
  `ps_shop_rating_recompute(shop_id)` sets `rating_avg` (round(avg, 2))
  and `rating_count` over **`status = 'approved'` reviews only**; a
  per-row trigger on `reviews` (insert / update of status, rating,
  shop_id / delete) runs it, plus a backfill loop for reviews that
  pre-date the trigger.
- **What counts:** approve a review → the shop's number moves; hide or
  re-approve later → it moves again, so moderation stays the single
  switch. Pending/hidden/flagged reviews never count.
- **Honesty:** a shop with zero approved reviews stays at 0 → no stars
  anywhere (the storefront gate). There is no seed, no default 5.0, no
  "first review is 5" — a new shop is simply unrated until the first
  approved review exists.
- **PDP chip** — the "Sold by" line now also carries prep time + the
  rating (★ 4.6 (12)) per blueprint §2.5.
- **Tests** — PDP chip (rating shown for a rated shop; no stars for a
  zero-review shop). The trigger itself is database-side and is verified
  by `diagnose.sql` step 32 + the first real moderation in the admin.

---

## #4 — Admin best-sellers in Reports (shipped)

The Reports page already had a "Top products" table — but it was computed
**client-side from the staff order queue**, which is capped at 100 orders
and cannot apply the refunded-return correction. Once the store outgrew
100 orders, that table would silently disagree with the storefront.

- **Server-side, same source as the storefront** —
  `GET /api/admin/reports/best-sellers` (staff-only) reads
  `v_product_sales` for the units column — the *exact* figure behind the
  "N sold" badge and the "Best sellers" sort — and joins `order_items` for
  the money: revenue on eligible non-return lines, distinct customer
  orders, and the last-30-days unit count for a trend at a glance.
- **Eligibility mirrors the view** — non-cancelled orders count; a return
  subtracts only once `refunded`; an in-flight return does not move the
  numbers yet. The two surfaces cannot disagree.
- **UI** — a "Best sellers — what the storefront shows" section on
  Admin → Reports (rank, product link, units sold, last 30 days, orders,
  revenue), with an honest empty state before the first sale and an
  honest error line if the read fails.
- **No new migration** — it rides on `202609140009` (the view) and the
  base tables; nothing new to apply.
- **Tests** — db (view ranking + name join, refunded vs in-flight return
  handling, cancelled exclusion, 30-day window, empty + broken-read
  non-fatal), route 401 without a staff session.

---

## #5 — PROSANTI+ membership (brief #17, shipped)

The retention lever: a ৳99/month term that makes delivery (and every
surcharge) free on every order. Two rules held the whole build honest:

- **The money is checked by the shop, the way it already works.** There is no
  PSP in this stack, so membership follows the P1 #8 trust model exactly:
  the customer sends the amount to the shop's own bKash/Nagad number, submits
  the TRXID from their account card, and staff approve or reject in
  Admin → Growth after matching it in the wallet. A row activates nothing by
  itself; `rejected` rows carry a readable reason the customer sees.
- **The perk is database truth, never a client claim.**
  `ps_place_order` (patched in `202609140015_plus_membership.sql`) re-checks
  `memberships` by the order's normalized phone — status `active` AND
  `expires_at > now()` — and zeroes the charge + all five surcharges inside
  the RPC. The server-side checkout mirror receives the same answer via
  `snapshot.plusActive` (looked up by the orders route, from the same table),
  so the quote shown and the row inserted cannot disagree; the client can
  only ever under-quote itself, never over-claim.

Mechanics worth keeping: one month = 30 days flat (no calendar maths to
argue with); approval EXTENDS the phone's furthest expiry, so renewing early
stacks months and losing days is impossible; one pending application per
phone (DB partial unique index + app-level dedupe); price and on/off live in
ops settings (`plus.enabled/plus.pricePaisa`, clamped) and the apply API
honestly 503s while disarmed. The account card and the checkout strip only
report state — and there is **no auto-renew language anywhere**: when the
term ends, it ends, and the card offers to renew.

Tests: 22 pure-lib (`membership.test.ts` — the state gate incl. the
pending-beats-expired precedence, phone-key normalization, price clamp band,
month clamp, `plusActiveOf`) + 1 validation-mirror case (waiver zeroes
delivery AND surcharges while a non-member pays the same full quote).

## #6 — Multi-shop cart (brief #18) — deferred, deliberately

One checkout bag spanning several shops is NOT built here, because three
launch-critical mechanisms are per-order-per-shop by design: the delivery
zone is resolved from the shop's own zone map, coupons validate against one
shop's catalog, and `ps_place_order` prices and inserts exactly one shop's
order. A naive grouped cart would split those silently — the customer would
see one total the database cannot reproduce. The safe shape (when it is
worth the design pass) is: grouped bags per shop, one `ps_place_order` call
per shop on submit, per-shop zone/coupon validation each, and an honest
"2 orders, 2 deliveries" confirmation. Until that exists, the storefront
keeps the shop-scoped bag — one shop at a time is boring and correct.

## #7 — Style Match (brief #19, shipped)

`/style`: occasion → budget → size, answered by transparent scoring, not a
model. Each live product is hard-gated (in stock, size present, within
budget, occasion mapped to REAL subcategories) and then ranked by additive,
human-listed reasons (budget headroom, size fit, occasion, colour,
featured, real units sold) — an item with zero reasons is not offered at
all, and over-budget or wrong-size never appears "as a compromise". The
panel shows the reasons beside every match; empty results link to /shop and
/contact instead of padding the list. The word "AI" is never used because
the honest version — a rulebook you can read — is also the version the shop
can defend.

## #8–#12 — Campaign, fabric, shifts, vendor insights, zone demand (shipped)

- **#8 Campaign** (`202609140013_campaign_early_access.sql` + `src/lib/campaign.ts`) —
  one settings document decides `/campaign`, the site strip and the express
  slot banner; states off/teaser/live/ended, inverted dates force off.
- **#9 Fabric transparency** (`202609140012_fabric_transparency.sql`) —
  `fabric_gsm`/`fabric_composition`/`test_report_url`/`quality_checked`
  columns; the PDP card renders only non-null declarations, the editors are
  the only writers; nothing is seeded.
- **#10 Rider shifts** (`202609140014_rider_availability.sql`) —
  `avail_days/avail_from_hour/avail_to_hour` on riders, one shared semantics
  (Dhaka hours, wrap-over nights, empty = anytime) implemented identically in
  TS (`rider-hours.ts`) and inside `ps_next_eligible_rider`; enforced ONLY
  at auto-dispatch, manual assignment always allowed.
- **#11+#12 Insights** (no migration) — `src/lib/insights.ts` buckets by
  Dhaka weekday over the loaded order window, cancelled excluded, shares of
  zero stay zero; vendor dashboard and admin reports show the same computed
  numbers with the scope label they deserve.
