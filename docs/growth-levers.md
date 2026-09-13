# Growth levers (P0) — flash drop, sets, gift, referral, price alerts, size finder

Jibonor kotha: kapar business-e size ar return-i sab theke boro math. Foodpanda-te
biryani te size lage na; ekhane manush panjabi kinche, tai "eita amar size hobe to?"
— ei ekta proshner uttor page-e na dile cart porjonto ashe na. Ei file-gulo seta kore,
ar sathe jekono discount-checkout-r age server-e abar hisab hoy — onek bhalo kotha.

Apply `supabase/migrations/202609130008_growth_promos_gift_referral.sql` first
(step 15 of [go-live.md](go-live.md)); nothing here prices until it exists.

## The one rule that makes this safe

Three layers read **one** document (`site_settings['ops']`, sanitized by
`src/lib/settings-store.ts`):

| Layer | File | What it decides |
| --- | --- | --- |
| Badge / rail / cart line | `src/lib/use-promos.ts`, `src/lib/use-bag-offer.ts` | what the shopper is *shown* |
| Order validation | `src/lib/order-validation.ts` | what checkout *charges* |
| `ps_place_order` | the migration above | what the database *allows* |

A client can send an *intent* (`referral_code`, `gift_wrap`, `bundle_discount`) —
never a price. The RPC recomputes the flash discount itself from the settings and
the live product rows, bounds a bundle claim to `discountPct` of that order,
prices gift wrap from settings by wrap id, and refuses a referral credit unless
the code is issued, the buyer is genuinely new, and the bag clears the minimum.
So a stale tab, a replayed payload or an inventive curl cannot grow a discount;
worst case the shopper gets no offer.

## 1. Size Finder (`sizeFinderEnabled`)

- `src/lib/size-finder.ts` — height/weight (+ optional chest/waist) → a per-size
  score out of 100 with a verdict (`best` / `snug` / `roomy` / `skip`), a garment
  family (`upper` / `waist` / `drape` / `one-size`) and a confidence number.
- `src/components/product/size-finder.tsx` — the drawer; profile saved in
  `localStorage` under `prosanti.size-profile.v1` (no account needed, no
  measurement chart is invented — the copy keeps saying *estimate*).
- Purchase panel: per-size dot + `data-size-fit`, and it pre-selects the
  recommended size only when the shopper has not touched the picker.
- Family is inferred from the sub-category, so a gamcha never gets a chest score.

## 2. Complete-the-look as a set (`bundle`)

`buildBundleOffer()` turns the editorial pairings in `merchandising.ts`
(Panjabi → Pajama/Gamcha/Cap, Three-piece → Dupatta/Shawl, …) into a one-tap set
with a `discountPct` off the sum of the parts. `matchBundle()` re-checks the bag:
remove one piece and the saving disappears — a half set is just shopping.
One automatic offer per order; ties favour the flash drop (`pickBestOffer`).

## 3. Flash drop (`flash`, ships disarmed)

Two short windows a day (default 12:00–13:00 and 19:00–21:00, Asia/Dhaka),
`discountPct` with a per-piece cap (`maxDiscountPaisa`: the most one garment can lose), scope `featured` / `all` / `selected`.
Surfaces: site bar (`FlashStrip`), drop rail (home / shop / product page),
price + countdown in the purchase panel, `BagOffers` in cart/drawer/checkout.
Every one of them **renders nothing** while disarmed — a permanent "SALE" banner
that never ends is decoration, and shoppers learn to ignore it.
The promo store (`/api/promo`) refetches at the moment a window opens or closes,
so a page left open at 18:59 gets the 19:00 drop without a reload.

## 4. Price drop alerts (`priceAlertsEnabled`)

- Device memory: `src/lib/price-drop.ts` writes the price this browser was shown
  (`prosanti.price-snapshots.v1`) — including on the way *up*, so a "it went down"
  claim is always against the last real sighting. Cards and the panel then say
  `৳X less since N days ago`, and a wishlist strip carries a bell toggle.
- Shop memory: `POST /api/price-watch` writes one row per (product, phone).
  **There is no SMS or email sender in this stack**, so the alert is a staff work
  list: saving a lower price files one inbox note with the numbers to call
  (`flagPriceDropForStaff`, deduped by `last_notified_paisa`). Never "we'll email
  you" when nothing emails.

## 5. Gift mode (`gift`)

Two fields + a wrap choice inside the existing checkout — not a new flow:
receiver name, receiver phone, card message, `standard`/`premium` wrap.
Fee comes from settings (zero-fee wraps are not offered). The rider note
(`GIFT — hand to …, do not quote the price`) is appended to the order note, so the
handoff works on the screens that already exist, and the slip stays price-free.
`validateGift` (client) and the RPC (server) use the same wrap ids; unknown ids
fall back to `none`.

## 6. Referral — "you ৳50, them ৳50" (`referral`)

- Code: `referralCodeFor(accountId)`, shown as `PS-XXXXXX`
  (alphabet without 0/O/1/I/L/U, so it survives a phone call). Codes belong to
  **accounts**: minting happens the first time the share card is opened
  (`GET /api/referral`), which is also why an anonymous coupon farm is not
  possible. `/shop?ref=CODE` is captured once by `RefCapture` into
  `localStorage` and offered at checkout (removable there).
- Friend's ৳50: applied on their first order, clamped to the bag, recorded in
  `referral_rewards` (unique per code + referee phone).
- Your ৳50: minted as a **real single-use coupon** (`PSREF<code>-<n>`) by
  `ps_credit_referrer(order_id)` when that order is delivered — idempotent, so a
  re-fired "advance" cannot print a second reward. Staff see the code in the
  inbox to pass on.
- `?ref=` never bypasses the first-order check; the database does the checking.

## Admin

`/admin/growth` — arm/disarm the drop, edit the two windows, pick the pieces,
set the % and caps, name the set, gift fees, referral rewards, plus the
"waiting for a price drop" call list and the referral table. It saves through the
same `/api/admin/settings` document; there is no second settings store.

## What is deliberately NOT here

- No auto-SMS / email dispatch (no gateway wired). The shop dials.
- No stacking of automatic offers: flash XOR bundle, + a coupon, + referral credit.
- No verified measurement chart: the size answer stays an estimate with a disclaimer.
- No bundle rows in the catalog: sets are computed from the pairing rules, so
  nothing to maintain when a product is unpublished (an out-of-stock piece just
  makes the set unavailable).

## Tests

`src/lib/__tests__/{promos,size-finder,gift,referral,price-drop}.test.ts` cover
the money rules and the edge cases (midnight-wrapping slots, clamped caps,
self-referral, first-order-only, price rises). `order-validation.test.ts` still
passes untouched — levers are OFF unless a snapshot hands them in.
