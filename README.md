# bhromor — PROSANTI storefront

Design-first build of **PROSANTI (প্রশান্তি)** — a premium commerce and rapid-delivery platform for Bangladesh, following the *PROSANTI Website Master Blueprint*.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Vitest**. Deploys to **Vercel**; later phases add **Supabase** (Postgres/auth/realtime) and **Cloudinary** (media).

## Current status

| Phase (per blueprint §83) | State |
|---|---|
| Phase 0 — Product definition (blueprint) | ✅ Complete |
| Phase 1 — Foundation (design system, routing, header/footer) | ✅ Complete |
| Phase 2 — Catalog & Multi-Vendor Marketplace (shops, shop apply, vendor panel, single-shop cart) | ✅ Complete |
| Phase 3 — Rider Network & Dispatch (mobile rider app, rider apply/login, 4-digit PIN verification, cash cap & settlements) | ✅ Complete |
| Phase 4 — Cart & Checkout (atomic ordering, 4-digit security PIN display, instant ETA split) | ✅ Complete |
| Phase 5 — Realtime Order Tracking (interactive live route map, simulated rider GPS, live ETA) | ✅ Complete |
| Phase 6 — Loyalty & Retention (10-order stamp card, admin reward engine, celebration unlock) | ✅ Complete |
| Phase 7 — Returns & Exchanges (7-day instant size exchange intake flow) | ✅ Complete |
| Phase 8 — Admin Control & Ops (live orders state machine, catalog CRUD, staff/shops/riders queues, cash settlements) | ✅ Complete |

The storefront paints the launch catalog instantly (`src/lib/catalog.ts` — the same source `scripts/seed-supabase.mjs` and `src/lib/db/auto-seed.ts` upsert into Supabase), then swaps in live database rows as soon as the backend answers. The admin order state machine lives in `src/lib/orders.ts`. Everything is live-only: there is no demo mode, no demo login, and no browser-local fallback store. When the backend is unconfigured, endpoints answer an honest 503/unavailable instead of pretending.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts (quality gates)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite (UI smoke + catalog/cart/orders invariants) |
| `npm run build` | Production build (what Vercel runs) |
| `npm start` | Serve production build |

Unit/component suite: 446 tests. Browser suite: 14 Chromium checks (see `docs/browser-qa.md`).

## Premium storefront refresh

The public homepage is a shelf, top to bottom: **compact hero (headline + one button) → recently-viewed strip (returning devices only) → category row → offers → every category with its pieces → customer stories (approved reviews only; hidden when there are none) → delivery check → service promise strip**. There is no screen-filling poster any more — the category row is on the first screen of a phone. The offers block shows the flash drop while a window runs plus every piece with a struck-through price (`/shop?filter=sale` lists them all); with nothing on offer it stays away. Product pages end with the rest of the piece's own category (strictly the same category, never a "you may also like" mix). The curated new-arrival / best-seller paths and the owned visual journal remain available in the shop (`?sort=newest`, `?sort=best`). Product cards keep consistent cream-background catalogue photography and reveal Quick Add / Details controls on interaction.

The palette is warm ivory, deep charcoal/forest and restrained bronze-gold. English display type (Playfair), interface type (Inter) and Bengali copy (Noto Serif Bengali) have explicit roles. No seeded or fake ratings/reviews are rendered anywhere — public home and product pages only ever show real, approved customer reviews (verified badge only when a matching order exists); the moderation queue lives in admin.

Existing CMS hero copy and the six section toggles (hero, recently viewed, category row, offers, customer stories, service strip), search, filters, cart, wishlist, and service links remain connected. The mobile layout preserves 44px controls and uses horizontal collection/product rails to reduce page length.

## Premium feel & usability pass

A polish pass over the storefront chrome and the buying flow, keeping the same palette, type roles and motion budget:

- **Header condenses on scroll** — the announcement bar folds away and the bar drops from 80/72px to 64/56px, with a stronger blur and a soft shadow once the page moves.
- **Mobile bottom navigation is now actually rendered** (`src/components/layout/bottom-nav.tsx` existed but was never mounted): Home · Shop · Wishlist · Bag · Menu within thumb reach, hidden from `lg` up. The footer reserves space for it.
- **Product cards** stay quiet but read richer: subcategory + colour line, display title with a hairline hover underline, prices bottom-aligned across a row, struck-through compare-at price, and a calmer “Sold out” band.
- **Product pages** put the long copy into a native `<details>` accordion (Product details · Fabric & care · Delivery & returns) so phones are not one long scroll, and a **compact sticky buy bar** appears when the main CTA leaves the viewport (desktop keeps the inline panel only).
- **Bag drawer** states the flat ৳60 delivery promise up front, with a rounded close control, tabular-numeral quantity steppers and a display-sized subtotal.
- **Footer** gained an assurance strip (cash on delivery · 45–50 min · 7-day exchange).

### Delivery promise: instant, flat ৳60 delivery

**Instant delivery (45–50 min) is the headline promise** across the storefront — home trust strip, product page, bag drawer, cart, checkout, delivery page and footer. Delivery is a flat **৳60 everywhere** (`src/lib/delivery.ts`) with night/rain/express/weight surcharges on top; store pickup and free-delivery coupons ride free. There is no free-delivery threshold and no launch-offer promo. Copy lives in `DELIVERY_ETA` / `INSTANT_DELIVERY_TITLE` so the promise is edited in one place.

All motion stays inside the existing tokens (`--motion-*`, `--ease-refined`) and is neutralised under `prefers-reduced-motion`. Touch targets remain 44px; the sticky bar uses `inert` while hidden so it never traps keyboard focus.

## Product discovery update

- Header search opens a keyboard-accessible panel with live product previews, collection shortcuts, and an empty-state recovery link.
- Search matches English/Bengali names, SKU, subcategory, and category. Submitting opens `/shop?q=…`; incoming search links also work on reload.
- Shop selections appear as individually removable chips, with a clear-all action and a live result count.
- Mobile headers keep all navigation actions within narrow screens; size/colour controls use larger touch targets and the filter drawer keeps its result action visible while scrolling.
- Search and filters run over the live storefront catalog; no authentication is required.

## Conversion & usability pass (2026-09-20)

Fourteen small, real-data-only additions that make the shop easier to trust and quicker to buy from. Copy is en + bn throughout.

- **Bangla product names** on product cards (Bangla-first when the shopper reads Bangla) — sourced from `Product.nameBn`, never transliterated.
- **Share row** on every product page: WhatsApp / Facebook / copy link (uses the native share sheet on phones).
- **Customer stories** on the home page from real published reviews (`/api/reviews`); hidden until reviews exist. CMS toggle `sections.stories`.
- **CMS promo card + announcement bar** (`/admin/homepage`): the promo only advertises a code — checkout still validates it.
- **Recently viewed** rail on product pages and a strip on the home page (device-local, returning visitors only).
- **Analytics**: set `NEXT_PUBLIC_META_PIXEL_ID` and/or `NEXT_PUBLIC_GA4_ID` to load Meta Pixel / GA4 with page_view, view_item, add_to_cart, begin_checkout and purchase (amounts in taka, no personal data). Blank = nothing loads.
- **PWA**: `/manifest.webmanifest`, icons and a gentle "Add to Home Screen" card on a visitor's second day (iOS gets the Share → Add instruction). No service worker by design.
- **Product video**: a "▶ Video" badge on cards and an admin nudge listing published pieces still without a YouTube/Drive clip.
- **Arrival cue** on the product page and in the bag — "Order now → at your door by about 7:55 PM" from the checkout's own ETA maths (night surcharge named; the courier zone never gets a clock).
- **Sub-category chips** on `/shop` (`?category=men&sub=Panjabi` deep links) and a horizontal category chip bar on phones.
- **Image zoom**: hover magnifier on desktop, full-screen pinch / wheel / double-tap lightbox with pan.
- **Order again**: one tap on the account's order history or the track page re-adds a past order; anything gone, sold out or no longer offered in that colour/size is listed, never swapped; another shop's bag is only replaced after confirming.
- **Cash at the door** card in the bag: pieces + your zone's delivery charge (+ the ৳20 night surcharge when it applies), the ৳500 courier floor, and a reminder that the rider asks for the amount and the 4-digit PIN.

## Menubar polish (2026-09-21)

- **The nav is actually centered now** — the pills sat `ml-auto`, crammed against the search/wishlist/cart icons while the code comment claimed "centered". The bar is now three balanced zones: brand | nav | actions.
- Pill rhythm: 0.66rem → 0.72rem semibold, roomier padding — the 5-item bar reads instead of squeaks.
- **Offers gets a gold glow-dot** so the sale entry feels intentional, not like a sixth grey pill.
- Bottom bar: the active tab's label is now semibold (the gold tick + heavier stroke were doing all the work before).

## Realtime phone notifications for admin (2026-09-21)

Orders, reviews, stock alerts and other staff notices now **buzz the owner's phone even with the admin panel closed** (Web Push + VAPID; the in-panel inbox keeps its 15s poll + beep).

Setup once:
1. Generate keys: `npx web-push generate-vapid-keys`
2. Set env on the host: `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` (optional `PUSH_VAPID_SUBJECT`, mailto:)
3. Apply `supabase/migrations/202609210001_push_subscriptions.sql`
4. Admin → Notifications → **"Phone notification ON korun"** → tap **Test pathan**

Notes: staff-gated end to end (`/api/admin/push`, device table service-role only). Android: any browser. iPhone: the panel must be installed via "Add to Home Screen" (iOS 16.4+). Missing keys = honest off switch, nothing throws. Dead subscriptions (404/410) are pruned automatically; fan-out is capped at 2.5s so checkout never waits on a push service. `public/sw.js` has no fetch/cache handler on purpose — live prices stay live — and is registered only from the admin surface.

### "Notification on korte partesi na" — the five checks (2026-09-23)

The card on `/admin/notifications` is now a live checklist. Every row is read from the real state, so the failing one names itself:

| Check | If it is red | Fix |
|---|---|---|
| **Server key (VAPID)** | host env has no keys → the card shows no ON button at all | `npx web-push generate-vapid-keys` → `PUSH_VAPID_PUBLIC_KEY` + `PUSH_VAPID_PRIVATE_KEY` in Vercel env → Redeploy (see `.env.example`) |
| **Database table** | `push_subscriptions` does not exist → saving answers 503 | SQL Editor → `supabase/migrations/202609210001_push_subscriptions.sql` |
| **Ei browser** | opened inside WhatsApp / Messenger / Facebook / TikTok / Google app (Android WebView) or over http | open the panel in **Chrome** on https |
| **Browser permission** | `Block` was answered once → **the site can never prompt again** (Chrome auto-denies untapped prompts). The card prints hand-set steps: 🔒 site settings → Permissions → Notifications → Allow; Chrome → Settings → Site settings → Notifications → remove the site from "Not allowed" | on Android 13+ the **Chrome app** needs it too: Settings → Apps → Chrome → Notifications → ON (Nothing OS: App info → Notifications → "Sites"/"General"); battery → **Unrestricted** |
| **Ei phone ta** | this browser holds no subscription (permission granted but nothing saved) | one tap on **Phone notification ON korun** — it subscribes and saves; opening the card with permission already granted re-saves silently, healing a rotated/lost endpoint |

Also fixed here: in-panel alerts go through `ServiceWorkerRegistration.showNotification()` — `new Notification()` is an **illegal constructor on every mobile Chrome**, so the old inline call showed nothing on Android while the desktop thought it had alerted — and the beep now resumes its suspended `AudioContext` on the first tap (mobile Chrome's autoplay policy kept it silent before). `notifyStaff()` events → Web Push fan-out is unchanged.

## Customer notifications — the shopper's phone buzzes too (2026-09-24)

Until today the store had **no automatic customer channel at all**: shoppers
learned nothing until they re-opened `/track`, and "order kothay?" was
answered by the shop phoning them. Now the tracker of a live order carries
**"অর্ডারের খবর ফোনে নিন"** — one tap, and that phone gets the four public
milestones (plus payment verified and cancelled) in Bangla or English,
whichever the shopper was reading.

| Sent when | Customer sees |
|---|---|
| order placed | অর্ডার পেয়েছি ✅ |
| confirmed | অর্ডার কনফার্ম হয়েছে |
| rider picked it up | রাইডার আপনার পার্সেল নিয়েছে 🛵 (+ keep the 4-digit code ready) |
| delivered | ডেলিভারি হয়েছে 🎉 |
| cancelled | অর্ডার বাতিল হয়েছে — nothing to pay |
| wallet payment verified (admin or shop) | পেমেন্ট ভেরিফাই হয়েছে ✅ |

`preparing`, `ready-for-pickup` and `courier-assigned` stay silent on purpose:
three useful pushes per parcel, not eight.

Setup — **nothing new**: the same VAPID keys power staff and shoppers.
1. Apply `supabase/migrations/202609240001_customer_push.sql`
   (already appended to `supabase/bootstrap-fresh.sql`).
2. Place a test order → open `/track` → tap **ফোনে খবর চালু করুন** → **টেস্ট পাঠান**.
3. Confirm the order in the panel → the shopper's phone buzzes; tapping the
   notification opens *that* order's tracker.

Notes: the endpoint is public by necessity (shoppers are guests) but a device
can only be registered with the tracker's own proof — order number **and**
that order's phone — and only ever against the number the order carries.
Dead endpoints (404/410) are pruned; fan-out is capped at 2.5 s so checkout
never waits on a push service. Missing VAPID keys or a missing migration =
honest off switch, the card says which. Full picture, plus the roadmap for
WhatsApp automation → email sender → customer in-app inbox:
[`docs/customer-notifications.md`](docs/customer-notifications.md).
`/api/health` reports `customerPushTableReady` and the device count.

## Account dashboard rebuild (2026-09-21)

- **Hero up top** — greeting by name, phone chip, PROSANTI+ status chip (best-effort read, hides on failure), one-tap "track your last order" (the device's remembered receipt), wishlist count, and sign-out. The identity block used to sit at the BOTTOM of the card stack; logout was effectively undiscoverable.
- **Four lazy tabs** — Orders (landing) · Smart Card · Refer & Earn · PROSANTI+. Each programme mounts only when its tab opens, so its fetch fires once, when needed — no 8-request card stack, no endless scroll.
- **Guests: form first** — the signup/login form leads beside an honest "why an account" card (stamps, referral, history/tracking, PROSANTI+), teasers below. The auth flow, labels and error handling are byte-identical to the audited version.
- **Bilingual page heading** — the hardcoded English h1/eyebrow moved into the client view and now follows the language switcher; the heading renders even while the session probe runs.
- New copy is translation-keyed (`accountHero.*`, `accountTabs.*`, `accountPitch.*`, en+bn).

## Menubar pass (2026-09-21)

- **Offers pill** in the desktop bar and the drawer — appears only while pieces are genuinely on offer (admin-priced) and owns `/shop?filter=sale` exclusively: the sale tab never lights on the plain shop, and vice versa.
- **"Collections" → "Categories"** (en + bn) — the link jumps to the home category shelf, and the old name oversold it.
- **Track** joins the desktop bar (it lived only in the footer before).
- **Active state parity** — a product page now lights the Shop pill on desktop, same ownership the phone's thumb bar already used.
- **Drawer orientation** — the page you are on is highlighted in gold with a check, so the open menu tells you where you are.

## Performance audit (2026-09-21)

Measured on the production build (gzip on the wire): home **≈265 KB JS**, /shop ≈257 KB, /checkout ≈278 KB; CSS ≈134 KB raw; local TTFB 8–150 ms (first hit warms the dynamic shop route). Findings fixed:

- **Admin code no longer ships to shoppers** — `usePublicSettings` lives in its own module; importing it from the staff settings hook had pulled the admin-auth client (admin email + the secret ops-gate path) into every customer page's bundle. Customer surfaces (checkout, referral step, price-watch strip, bag COD card, arrival cue) now use the clean module. Rebuilt and verified: no admin markers in any storefront chunk.
- Same audit surfaced and fixed a real bug: customer surfaces were reading ops settings through the **staff hook**, so shoppers always got launch defaults regardless of what the admin saved.

## Admin-owned pricing (2026-09-21)

Every money knob is now the owner's, end to end:

- **Surcharge amounts** (night / rain / express / per-kg) and the **courier minimum order** moved from hard-coded constants into Admin → Settings → Delivery — set them in taka, save once.
- They flow everywhere through **one public read**: `GET /api/settings` (the sanitized ops document, nothing secret) → checkout quote, server-side order pricing (which also honours the toggles now — an older gap), the bag's cash-at-the-door card, the arrival cue and the delivery page.
- Checkout now reads these via `usePublicSettings()` instead of the staff-only hook — previously customers silently got launch defaults no matter what the admin set.
- Launch defaults match the old constants (৳20 / ৳15 / ৳40 / ৳10·kg, floor ৳500), so nothing changes until the owner changes it.

## UI/UX feel pass (2026-09-21)

- **Skeletons on every streamed route** — account, track, wishlist and checkout now show the brand-shaped placeholder (and the collection skeleton matches the real 4:5 cards). No blank flashes.
- **Empty states that recover the shopper** — the empty cart page and the shop's no-result state carry the device's recently-viewed pieces (returning visitors only).
- **Tap feedback** — quick add, add-to-bag and place-order acknowledge the press; the header bag icon pops when the bag changes.
- **Sticky mobile buy bar** — photo + flash-aware price + Add docks at the bottom edge once the purchase panel scrolls away; taps scroll back to the one real CTA.
- **Haptics** — a small vibration on added-to-bag and order-placed (Android; silently skipped elsewhere).

## Speed pass (2026-09-21)

- **Preconnect** to `res.cloudinary.com` / `lh3.googleusercontent.com` (+ dns-prefetch for YouTube thumbs) from the root layout — the media hosts' DNS+TLS is warmed before the catalog images are discovered, which matters on mobile networks.
- **Image optimizer**: AVIF → WebP explicitly, and `minimumCacheTTL` raised to 31 days — a photo is encoded once and served from the CDN instead of being re-encoded every week.
- Bengali fonts were already unicode-range–subset by Fontsource (Bengali / Latin split per weight), so devices only download the glyphs they render.

## The weekly pulse (2026-09-21)

Admin → Reports gains a six-number strip over the selected window — the owner's Monday-morning glance: orders + booked money, cancel rate, delivered with the **real average delivery minutes**, repeat customers (same phone, ≥2 live orders), the bKash/Nagad verification queue with its median wait, and cash actually collected at the door. All computed from the same live orders as the rest of the page; dashes when the window is empty, never invented numbers.

## Referral & review asks (2026-09-21)

- **On the receipt** (order placed): signed-in shoppers see their real referral code with copy-link and a prefilled WhatsApp share ("friend saves ৳50, you earn ৳50"); guests get a quiet sign-in line — codes are never mintable anonymously (`receipt-referral-row.tsx`).
- **On /track, delivered orders** show a one-tap review ask linking each bought piece's moderated review form (`review-ask.tsx`, max three links).

## Premium icon pass (2026-09-21)

No emoji in shopper-facing UI — delivery, slots, addresses, COD, gift, loyalty and map surfaces use the brand's stroke line-icon set (`src/components/ui/icons.tsx`; new: sparkles, moon, calendar, home, store, briefcase). Admin/vendor/rider tools may still use emoji internally.

## Marketing feeds & structured data (2026-09-21)

- **Facebook/Instagram catalog feed:** `GET /api/feed/facebook` — Meta Commerce CSV (id, title, price in BDT, availability, absolute links/images, brand). Paste into Commerce Manager → Catalog → Data sources as a scheduled feed.
- **Google free listings feed:** `GET /api/feed/google` — Merchant Center RSS 2.0 (`g:` namespace, whole-taka prices). Paste into Merchant Center → Products → Feeds as a scheduled fetch. Both revalidate hourly; video slides are never submitted as images and sold-out pieces are listed as `out of stock` (history preserved).
- **Structured data:** `Organization` + `WebSite` JSON-LD on every storefront page (facts only — logo, origin; address/phone join when the shop profile has them). Share cards: see the Conversion & usability pass above.

## Pages

Public: Home (CMS-aware) · Shop · Product details (public reviews launch-gated) · Cart · Checkout (shared zone store + coupon codes) · Track order (real order-store lookup by ID + phone) · Live shopping (`/live` — the shop's own stream with the on-air pieces one tap from the bag) · Wishlist · About · Contact (channels render only when the shop configured them) · FAQ · Delivery info · Returns · Privacy · Terms · 404.

**Admin** (`/admin` — always real, gated by Supabase staff auth):

- Login: staff Supabase Auth — an `admin_users` row grants access; the owner email `rahatbd2050@gmail.com` is prefilled. No demo credentials exist.
- Dashboard: today's sales, live status pipeline, §88 delivery performance, low-stock alerts
- Orders: search + status filters, order details with item snapshots, customer info, journey timeline, and state-machine-driven actions (advance / cancel per §34)
- Products: catalog list w/ search + visibility filters, quick featured/archive actions, full sectioned editor (basics, pricing, variants/stock, Cloudinary upload + Drive/YouTube media, publishing, SEO)
- Categories: data-driven create/edit/reorder/hide with Bengali names & subcategories (§5)
- Delivery zones: zone CRUD + reorder + active state — saved zones are what the customer checkout uses live (§20–21)
- Deliveries: §3.2 dispatch board — auto-offer on ready-for-pickup, offer expiry + re-offer, manual assign/cancel, rider cash exposure
- Reviews: moderation queue — approve/hide/flag/feature/delete; storefront reviews wait for approval, verified badge only with matching order (§30)
- Coupons: fixed/percent, min order, category scope, validity & usage limits; checkout applies codes live; usage is recorded when an order is placed (§56)
- Inventory: per-product stock editor with configurable low-stock threshold that drives the dashboard alert (§57–58)
- Reports: period presets (7/30/all days) over the live order store — booked vs collected COD revenue, daily revenue chart, top products, zone and coupon breakdowns
- Homepage: §31 CMS — announcement, hero copy, section visibility; Publish updates the live storefront
- Media: §49 library — in-use scan plus a shared “added” shelf (live table for staff; direct Cloudinary image/video upload when keys are set, plus Google Drive + YouTube links — see [docs/media-setup.md](docs/media-setup.md))
- Notifications: §35 per-staff inbox fed by real order/review/application/message/signup events, plus a live “needs attention” summary
- Messages: contact-form inbox — read/reply triage with click-to-call phone links
- Newsletter: table-based subscriber list with search, CSV export and per-subscriber unsubscribe links (no third party)
- Payments: COD stays the default; **bKash/Nagad into the shop's OWN wallet** — no merchant account, no API key: the customer sends the total and shares the TRXID, the shop verifies/rejects per order (fulfilment is gated until verified), with a live COD book on the same page. Cards still need a PSP.
- Live shopping: schedule a session (title, when, the shop's live link, pieces in on-air order), Start/End, tap the on-air piece — the storefront embeds a YouTube link in place or links out to any other platform. "LIVE" only shows between the shop's own taps.
- Settings: low-stock threshold (§58) + contact channels (phone/WhatsApp/email — blank = hidden, never a placeholder) saved live; platform constants (§68–70). There are no demo-data reset controls — live data is never reset.

Every admin domain reads and writes Postgres through Supabase — see **[docs/go-live.md](docs/go-live.md)** for the owner-run setup checklist (SQL → seed → staff grant → verify).

Design language: deep forest green + warm ivory + muted gold, Playfair display serif + Inter + Noto Serif Bengali, arch-shaped brand imagery (signature motif), mobile-first.

## Routes map

```txt
src/
├── app/
│   ├── layout.tsx            # root: fonts, globals, theme
│   ├── (site)/               # public storefront — header/footer chrome
│   │   ├── layout.tsx        # CartProvider, header, footer, site metadata/OG
│   │   ├── page.tsx          # homepage sections
│   │   ├── shop/             # catalog with client-side filtering
│   │   ├── product/[slug]/   # SSG product pages (+ JSON-LD, metadata)
│   │   └── cart · checkout · track · about · contact · faq · delivery · returns · privacy · terms
│   ├── admin/                # separate admin surface (own layout + guard)
│   │   ├── login/            # staff Supabase auth (§47)
│   │   ├── page.tsx          # dashboard (§32, §88)
│   │   ├── orders/           # list + [id] detail w/ status machine (§33–34)
│   │   ├── products/         # list, new, [id] editor (§71–74)
│   │   ├── categories/       # data-driven CRUD (§5)
│   │   ├── zones/            # delivery-zone manager (§20–21)
│   │   ├── deliveries/       # §3.2 dispatch board + manual assign/cancel
│   │   ├── homepage/         # §31 CMS: announcement, hero, sections
│   │   ├── customers/        # derived from the order store
│   │   ├── reviews/          # §30 moderation queue
│   │   ├── coupons/          # §56 discount-code manager
│   │   ├── inventory/        # §57–58 stock + threshold
│   │   ├── media/            # §49 library (in-use scan + shared shelf)
│   │   ├── messages/         # contact-form inbox (triage)
│   │   ├── newsletter/       # subscriber list + CSV export
│   │   ├── notifications/    # §35 inbox + bell + live attention
│   │   ├── reports/          # sales reports over the order store
│   │   ├── settings/         # ops settings (§58)
│   │   ├── live/             # live shopping control room (P1 #9)
│   │   └── payments/         # wallet numbers + COD book + pending verifications
│   └── rider/                # mobile rider surface (login/apply/shell)
│       ├── page.tsx          # live jobs, PIN proof, COD settlement
│       ├── login/            # rider Auth sign-in / sign-up
│       └── apply/            # pending rider intake
├── supabase/schema.sql       # §41–46: tables, RLS, order state machine
│   ├── icon.png · favicon.ico
│   └── globals.css           # design tokens (forest/ivory/gold)
├── components/
│   ├── layout/               # header, mobile nav, footer, newsletter
│   ├── admin/                # admin gate/shell, status badges, time helpers
│   ├── cart/                 # CartProvider (localStorage) + cart view
│   ├── product/              # card, gallery, purchase panel
│   ├── shop/ · checkout/ · track/ · contact/
│   └── ui/                   # buttons, badges, prices, icons
├── public/brand/             # official emblem artwork (transparent PNG + lockup)
└── lib/                      # catalog, orders (state machine), cart, money (paisa)
    ├── rider-auth.ts         # requireRider(): session → riders row gate
    └── use-rider.ts          # rider session/jobs/actions client hooks
```

## Deploying to Vercel

Live project: [bhromor-zeta.vercel.app](https://bhromor-zeta.vercel.app). `vercel.json` pins Framework = Next.js so dashboard Build settings cannot drift.

1. Push to `main` → auto-deploys.
2. Add keys in **Project → Settings → Environment Variables** (not team settings). Vercel’s form now asks **Config** vs **Secret** instead of a Sensitive checkbox — see **[docs/vercel.md](docs/vercel.md)** for the exact keys, types, and how to reset Build settings if they were changed by mistake.
3. After any env change: Deployments → ⋯ → **Redeploy** with “Use existing Build Cache” **unchecked**.
4. `GET /api/health` reports `"live": true` once the Supabase keys are set **and** the database is seeded; until then it returns a step-by-step checklist of exactly what is missing.

## Next phases (in order)

1. **Go-live (owner)** — follow **[docs/go-live.md](docs/go-live.md)**: apply the SQL migrations, `npm run seed`, approve + link the first rider, grant the first staff role (`npm run grant-admin -- rahatbd2050@gmail.com super_admin`), run the verify checklist. The storefront serves the launch catalog out of the box, but the database must be seeded before live checkout, admin, and tracking work.
2. **Notif channels (SMS/WhatsApp)** on top of the inbox (§35) once a gateway account exists; Cloudinary keys enable direct media upload (§48) — both optional, everything else is already real.


## Customer accounts & remote wishlists

The storefront now includes `/account` with Supabase email OTP authentication and an RLS-protected, per-customer wishlist. Guest shopping still works without Supabase configuration. Guest import is explicit and additive; account data is not copied into guest localStorage.

See **[customer account setup and verification](docs/customer-accounts.md)** for the standalone SQL migration, OTP email template, environment configuration and required live two-account isolation checks. Automated tests use mocked service responses; live email/RLS verification requires a configured Supabase project.


## Browser regression checks

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

Playwright starts a dev storefront at port 3100, or uses `E2E_BASE_URL` when supplied. Screenshots, traces and the HTML report go under ignored `.cache/`. The suite checks five responsive widths, keyboard/modal behaviour, reduced motion, wishlist/filter persistence, accessibility and the shopping flow up to checkout (without submitting an order). See [QA results and limitations](docs/browser-qa.md).
