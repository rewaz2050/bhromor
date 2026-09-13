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
| 16 | Stylist chat | ⬜ | structured size/pairing Q&A + human handoff |
| 13 | Exchange at-home pickup | ⬜ | rider reverse-logistics leg on the 7-day exchange |
| 14 | Warranty claim (accessories) | ⬜ | claim form + status on accessory products |
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
