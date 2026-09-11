# Storefront phase two

## Implemented
- Shop by Mood and Under ৳500 remain available as URL-driven catalogue filters, but their duplicate homepage rails were retired in the shorter launch edit.
- Shared editorial mood rules; shop supports `?mood=everyday|festive|classic` and `?price=under500`, combined with category, colour, size, search and stock filters. Incoming URL changes reset stale local filters. Chips and Clear all work on the new filters.
- Contextual Complete the Look and bag recommendations. Only published/active, in-stock complements are eligible, never the current product or an item already in the bag. No unrelated fallback under the styling heading. Generic discovery remains separately labelled.
- Accessible Size Guide drawer on the PDP and an inline fit disclosure in Quick Add (no stacked modal traps). Displays catalog fit/dimensions and measurement instructions, explicitly noting unavailable verified charts.

## Data dependencies intentionally not faked
- **Best Sellers:** `order-store.ts` is seeded from `MOCK_ORDERS` and browser-local; it is not a production sales source. Do not import customer orders into public merchandising. Connect a server-side aggregate of eligible sales by product ID, excluding cancelled/refunded units, before displaying a sales ranking.
- **Verified size chart:** obtain product-specific measurements, units and measurement method before adding a size-to-measurement table. Generic S/M/L measurements can cause incorrect purchases.
- **Social proof / Instagram:** needs approved reviews, customer-photo consent and the official social URLs. Existing product photography is used for editorial cards, not presented as customer photos or an Instagram feed.
- **Account sync:** remains dependent on customer authentication and a persistent backend.

## Manual check
1. Shop → a mood URL → matching style chip and product grid.
2. Shop → `?price=under500` → only prices strictly below ৳500; Clear all restores catalogue.
3. Shop → price/mood filters → another header collection link clears stale filters.
4. Lungi PDP → Complete the Look → Gamcha; add Lungi and inspect Pair it with in bag. Add both and neither is recommended again.
5. PDP → Size Guide → Escape closes and restores focus; Quick Add guidance expands without opening a second modal.
6. At mobile widths, verify the compact header menu, filter sheet, fit guide and bag remain scrollable.

## Phase three — polish
- Added Next.js route loading boundaries for the storefront, shop and product detail with accessible skeletons. No artificial delay is introduced: fast/cached routes may not visibly show the fallback.
- Added policy-linked checkout assurance cards. Policy links open separately to preserve checkout fields. Online-payment security is not claimed while the store is COD-only.
- Replaced the repeated catalogue-tile journal with dedicated lifestyle/editorial imagery. Seed reviews and ratings are launch-gated from the public homepage and PDP; review moderation remains available in admin until genuine customer proof is connected.
- Replaced the newsletter's false local success state with a hosted opt-in handoff. Set server environment variable `NEWSLETTER_SIGNUP_URL` to the HTTPS signup page owned by your email provider. That provider must handle email capture, consent, confirmation and unsubscribe. When absent or invalid, signup is explicitly unavailable and no email is collected.
- Added 180–220ms hero/dialog/cart/wishlist feedback under `prefers-reduced-motion: no-preference`; no blocking page transitions.
- Wishlist empty-state copy now matches the brand voice.

### Still requires production services/content
Real sales aggregates for Best Sellers, approved real testimonials, official social accounts/feed permissions, verified garment measurements, and account/login wishlist synchronization. These are not represented as complete in the current UI.
