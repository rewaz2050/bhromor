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
| 2 | Back-in-stock alerts | ⏳ Next | price-watch's sibling: watch an OUT-OF-STOCK piece, staff gets the number when stock is restocked (same honest "shop calls" mechanism — no SMS sender in this stack) |
| 3 | Shop ratings from approved reviews | ⏳ Queued | blueprint §2 "reviews extend to shop ratings": per-shop average over APPROVED reviews only, shown on shop page + PDP; 0 reviews = no stars, never a seed |
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
