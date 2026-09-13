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
| 10 | Customer photos (UGC) | ⬜ Next | photo reviews + 10 loyalty points, moderation queue, "real buyer photos" |
| 16 | Stylist chat | ⬜ | structured size/pairing Q&A + human handoff |
| 13 | Exchange at-home pickup | ⬜ | rider reverse-logistics leg on the 7-day exchange |
| 14 | Warranty claim (accessories) | ⬜ | claim form + status on accessory products |
| 8 | bKash / Nagad / Card | ⛔ Blocked | needs **merchant credentials** (bKash/Nagad merchant portal) — cannot be built honest without them |
| 9 | Live shopping session | ⬜ Largest | needs streaming infra; plan after 10/16/13/14 |

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
