# P1 roadmap — status (one-by-one delivery)

Owner brief: "foodpanda-er theke aro better — clothes-er jonno." P0 (the
seven growth levers) is done — see [growth-levers.md](growth-levers.md).
P1 lands **one by one**; each item below records state, what shipped, and
what a finished item must have (code + tests + honest UX).

| # | Feature | State | Notes |
|---|---------|-------|-------|
| 15 | **WhatsApp Order Assistant** | ✅ Shipped 2026-09-13 | `src/lib/whatsapp-order.ts` + purchase panel / bag drawer / cart / shop page |
| 11 | Video on product | ✅ Already in | `video` media type + YouTube embed + admin media library |
| 12 | Scheduled delivery slot | ✅ Already in | checkout "now / evening / scheduled" + window + date, `scheduled_at` in `ps_place_order` |
| 10 | Customer photos (UGC) | ✅ Code 2026-09-13 (needs go-live step 16) | photo reviews + moderation queue + "real buyer photos" strip — no points: loyalty is the stamp card, no points concept exists |
| 16 | Stylist chat | ✅ Shipped 2026-09-13 | product-page Q&A drawer: size (from the shopper's own saved body), pairing (in-stock catalog rows), stock (real fields) + real-person WhatsApp handoff |
| 13 | Exchange at-home pickup | ✅ Code 2026-09-13 (needs go-live step 17) | customer request on track page (7-day window) → shop approve/reject → rider pickup leg reusing normal dispatch |
| 14 | Warranty claim (accessories) | ✅ Code 2026-09-14 (needs go-live step 18) | per-product `warranty_days`; order-bound claim on track page (window from proven delivery) → shop review/approve/reject with a note; exchange/refund is shop offline, recorded in the claim |
| 8 | bKash / Nagad / Card | ⛔ Blocked | needs **merchant credentials** (bKash/Nagad merchant portal) — cannot be built honest without them |
| 9 | Live shopping session | ⬜ Largest | needs streaming infra; plan after 10/16/13/14 |

## #10 — Customer photos / UGC (code shipped, awaiting DB migration)

"A photo of the garment on a real body answers 'will it fit me?' better than
any description" — the strongest fit signal a cloth shop can show, and the
differentiator versus a food app.

- **Form** (`src/components/reviews/reviews-section.tsx`) — up to 3 photos;
  each is compressed in the browser (canvas → JPEG, ≤1080px, q0.78) before it
  ever leaves the device; honest errors when a file can't be read.
- **API** (`src/app/api/reviews/route.ts` + `src/lib/review-photos.ts`) —
  server re-validates shape/count/size, re-hosts to Cloudinary
  (`prosanti/reviews`) when configured, otherwise stores the compressed data
  URL (launch scale). A photo hiccup never loses the review.
- **Storefront** — "Real buyer photos" strip on the product page + thumbnails
  on each approved review card; clicks open the full photo.
- **Moderation** (`src/app/admin/reviews/page.tsx`) — the queue shows each
  review's photos (plain `<img>` — data URLs can't go through next/image);
  photos ride the review's pending state, RLS keeps them hidden until
  approval.
- **DB** — `supabase/migrations/202609140001_review_photos.sql` (go-live
  step 16). Until it runs, photo submissions still save the review but drop
  the photos gracefully.
- **Not done on purpose:** the brief said "+10 loyalty points", but PROSANTI
  loyalty is the order **stamp** card (`src/lib/loyalty.ts`) — there is no
  points concept to credit. Inventing one would split the loyalty model.

## #16 — Stylist chat (shipped)

Clothes need advice — "which size?", "what goes with this?", "is it actually
in stock?" — and a food-app-style store can't answer any of them. The stylist
chat (`src/components/stylist/stylist-chat.tsx`) is one drawer on the product
page (next to the size row) where all three questions live.

- **Size** — answered by the same `suggestSize` math as the size finder: the
  shopper's own saved height/weight (or measured chest) against the sizes this
  item actually sells. "Use this size" selects it in the purchase panel. No
  saved body → it points to the size finder instead of inventing a size.
- **Pairing** — `completeTheLook` on the live catalog: only discoverable,
  in-stock rows from a curated complement table. When nothing pairs, it says
  so — it never fills a grid with unrelated stock.
- **Stock** — the product's real `inStock` / `lowStock` / `colors` fields.
- **Human handoff** — the only "person" in the chat is a real person: the
  shop team on WhatsApp. The pre-filled message (`src/lib/stylist.ts`)
  carries the product, the catalog price at the tap, and the topic asked
  about; the link exists only when the shop has a plausible BD mobile (same
  rule as #15) — otherwise it falls back to the contact page.
- **Dialog discipline** — handoffs to the size finder / guide close the chat
  first (a bumped `autoOpenKey` prop), so focus-trapping drawers never stack.

Honesty rules: no canned replies, no invented persona, no "typing…" theatre —
every bubble is computed from live catalog data, and the subtitle says so.

## #13 — Exchange at-home pickup (code shipped, awaiting DB migration)

"7-day exchange" was only true if the customer could get the item back to
the shop. Now the reverse leg is real logistics, not a contact form:

- **Customer (track page, `return-panel.tsx`)** — a delivered order shows
  the exchange window (7 days from the proven 'delivered' history entry).
  Request = reason + a sentence, verified with order ID + phone (same
  ownership proof as tracking). Inside the window: form. Outside: an
  honest "window ended on {date}". A live return shows its status and
  one tap tracks the pickup leg.
- **DB (`202609140002_return_pickups.sql`)** — `ps_return_eligible`
  (delivered + window + one live return per parent),
  `ps_create_return_request` (a zero-charge return order via the existing
  `ps_place_order` return mechanics — items/address/zone/geo copied from
  the parent, so the pickup is exactly the doorstep the order was
  delivered to), `ps_return_action` (approve → `ready-for-pickup`, reject
  → cancelled, complete → refunded), and a trigger mirroring the rider's
  pickup/drop onto `return_status`.
- **Shop (admin order detail)** — requested returns get Approve / Reject
  (with a reason for the customer). Approving moves the return order to
  `ready-for-pickup`, the state the normal dispatch offers to riders —
  the existing offer → accept → pickup → deliver leg IS the reverse
  logistics. Return orders can't be moved through the normal "Mark …"
  flow.
- **Rider app** — the job card labels return pickups: "collect from the
  customer, drop at the shop. No cash to collect."
- **Honesty:** nothing is paid for by the system — the pickup leg is
  ৳0 in the order, and when the item reaches the shop the status says
  exactly what happens next: "exchange/refund handled by the shop."

## #14 — Warranty claim on accessories (code shipped, awaiting DB migration)

"30-day warranty" means nothing the customer can't actually use. Warranty is
a shop-managed **product attribute** (`products.warranty_days`, set in the
product editor on the accessories the shop warrants — nothing is warranted
by default, and the UI says nothing about items without one):

- **Product editor** — a "Warranty (days)" field (1–365, blank = none);
  a product page with a warranty shows the period in "Delivery & returns".
- **Customer (track page, `warranty-panel.tsx`)** — a delivered order shows
  one row per warranted item: the period, the window end date (computed from
  the same proven 'delivered' history entry as the 7-day exchange), and
  "Report a problem". Verified with order ID + phone — the same ownership
  proof as tracking. The server re-checks everything in
  `ps_warranty_eligible` (delivered · in-order · has warranty · delivery
  recorded · window open · not already claimed); one live claim per
  order+item. The decision appears back on this page: submitted → under
  review → approved/rejected, with the shop's note.
- **DB (`202609140003_warranty_claims.sql`)** — `products.warranty_days`
  (check 1–365, null = none), `warranty_claims` (admin-only RLS; the
  customer's status view reads through the service-role lookup, same as
  /api/track), and `ps_warranty_eligible(order_id, product_id)` returning
  NULL when eligible or a reason code the UI maps to an honest message.
- **Shop (admin order detail)** — a warranty-claims card (only when the
  order has claims) with the customer's problem text and
  Mark-as-reviewing / Approve / Reject (reject needs a visible reason).
  A new claim pings the staff notification bell linking to the order.
- **Honesty:** the system records the decision, not the cash — after
  approval the replacement, repair or refund is the shop's offline
  handling, and the customer sees exactly that ("the shop will contact
  you…"), never a fake refund status.

## #15 — WhatsApp Order Assistant (shipped)

"WhatsApp-e message korlei order" — BD customers decide on WhatsApp. One tap
opens a **pre-filled chat** with the shop's real mobile (`wa.me` deep link):

- **Product page** (`purchase-panel.tsx`) — "Order on WhatsApp" under the
  buy box; the message carries shop, product, colour/size, qty and the
  catalog price at the moment of the tap.
- **Bag drawer + cart** (`bag-drawer.tsx`, `cart-view.tsx`) — "Order this bag
  on WhatsApp" with every line + subtotal (single-shop cart ⇒ one shop phone;
  a mixed bag offers no chat rather than the wrong one).
- **Shop page** (`shop-hero.tsx`) — "Chat on WhatsApp" opener.

Honesty rules (enforced in `src/lib/whatsapp-order.ts`, tested in
`src/lib/__tests__/whatsapp-order.test.ts` + the component test):

- The link **only exists when the shop has a plausible BD mobile**
  (`isPlausibleBdPhone` + `normalizeBdPhone` → `880…`); a chat button to
  nowhere is worse than none.
- The message states the price is **for confirmation** and that payment is
  COD — the chat never claims an order was placed.
- `wa.me` deep links only: no account, no token, no app install.
