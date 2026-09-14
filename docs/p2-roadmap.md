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
| 4 | Admin best-sellers in Reports | ⏳ Queued | the same view, server-side top list on Admin → Reports (units, revenue, trend) so the shop sees what the storefront shows |

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
