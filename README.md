# bhromor — PROSANTI storefront

Design-first build of **PROSANTI (প্রশান্তি)** — a premium commerce and rapid-delivery platform for Bangladesh, following the *PROSANTI Website Master Blueprint*.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Vitest**. Deploys to **Vercel**; later phases add **Supabase** (Postgres/auth/realtime) and **Cloudinary** (media).

## Current status

| Phase (per blueprint §83) | State |
|---|---|
| Phase 0 — Product definition (blueprint) | ✅ Complete |
| Phase 1 — Foundation (design system, routing, header/footer) | ✅ Complete |
| Phase 2 — Catalog (UI: shop, product pages, filters, search) | ✅ UI complete (mock data) |
| Phase 3/5 — Admin foundation (login, dashboard, orders + status machine) | ✅ UI complete (demo data) |
| Phase 3 rest — Admin products & categories CRUD, publish workflow | ✅ UI complete (demo store) |
| Phase 8 preview — Wishlist · Reviews · Coupons · Homepage CMS · Inventory | ✅ UI complete (browser demo) |
| Phase 3/6 preview — Media library (§49) · Notifications inbox (§35) | ✅ UI complete (browser demo) |
| Phase 6 preview — Reports · Settings · Payments (COD-only policy) | ✅ UI complete (browser demo) |
| Supabase schema (products, variants, media, orders, RLS, §34 machine) | ✅ `supabase/schema.sql` ready |
| Phase 4 — Cart & Checkout (UI + client state) | ✅ UI complete (demo flow) |
| Phase 4 rest — Delivery-zone manager (shared with checkout) | ✅ UI complete (shared store) |
| Phase 5 — Order tracking (UI) | ✅ UI complete (demo timeline) |
| Backend phase 1 (API routes + Supabase order pipeline, demo fallback) | ✅ Live when keys set — see `docs/backend.md` |
| Backend phase 2 (staff auth, admin on live data, atomic checkout) | ⏳ Next |

The current catalog runs on typed mock data in `src/lib/catalog.ts`; the admin order domain lives in `src/lib/orders.ts`. Shapes follow the blueprint’s generic commerce model (§16, §34, §44, §75), so swapping in Supabase rows later does not require UI rewrites.

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

Unit/component suite: 242 tests. Browser suite: 14 Chromium checks (see `docs/browser-qa.md`).

## Premium storefront refresh

The public homepage now follows one shorter editorial journey: **cinematic hero → collections → best sellers → brand philosophy → service strip → visual journal**. Duplicate new-arrival, mood, budget and delivery rails were removed from the landing page; those discovery paths remain available in the shop. The hero and journal use dedicated lifestyle imagery, while product cards keep consistent cream-background catalogue photography and reveal Quick Add / Details controls on interaction.

The palette is warm ivory, deep charcoal/forest and restrained bronze-gold. English display type (Playfair), interface type (Inter) and Bengali copy (Noto Serif Bengali) have explicit roles. Seed/demo ratings and reviews are not rendered on public home or product pages; the moderation prototype remains available in admin until genuine customer proof is connected.

Existing CMS hero copy and the six launch-safe section toggles, search, filters, cart, wishlist, and service links remain connected. The mobile layout preserves 44px controls and uses horizontal collection/product rails to reduce page length.

## Premium feel & usability pass

A polish pass over the storefront chrome and the buying flow, keeping the same palette, type roles and motion budget:

- **Header condenses on scroll** — the announcement bar folds away and the bar drops from 80/72px to 64/56px, with a stronger blur and a soft shadow once the page moves.
- **Mobile bottom navigation is now actually rendered** (`src/components/layout/bottom-nav.tsx` existed but was never mounted): Home · Shop · Wishlist · Bag · Menu within thumb reach, hidden from `lg` up. The footer reserves space for it.
- **Product cards** stay quiet but read richer: subcategory + colour line, display title with a hairline hover underline, prices bottom-aligned across a row, struck-through compare-at price, and a calmer “Sold out” band.
- **Product pages** put the long copy into a native `<details>` accordion (Product details · Fabric & care · Delivery & returns) so phones are not one long scroll, and a **compact sticky buy bar** appears when the main CTA leaves the viewport (desktop keeps the inline panel only).
- **Bag drawer** shows a real free-delivery progress bar, a rounded close control, tabular-numeral quantity steppers and a display-sized subtotal.
- **Footer** gained an assurance strip (cash on delivery · 45–50 min · 7-day exchange).

### Delivery promise: instant, with free delivery as the secondary line

**Instant delivery (45–50 min) is the headline promise** across the storefront — home trust strip, product page, bag drawer, cart, checkout, delivery page and footer. The existing ৳2,000 free-delivery rule (`src/lib/delivery.ts`) is untouched but demoted to a smaller, secondary line (“৳X more also unlocks free delivery”). Copy lives in `DELIVERY_ETA` / `INSTANT_DELIVERY_TITLE` so the promise is edited in one place.

All motion stays inside the existing tokens (`--motion-*`, `--ease-refined`) and is neutralised under `prefers-reduced-motion`. Touch targets remain 44px; the sticky bar uses `inert` while hidden so it never traps keyboard focus.

## Product discovery update

- Header search opens a keyboard-accessible panel with live product previews, collection shortcuts, and an empty-state recovery link.
- Search matches English/Bengali names, SKU, subcategory, and category. Submitting opens `/shop?q=…`; incoming search links also work on reload.
- Shop selections appear as individually removable chips, with a clear-all action and a live result count.
- Mobile headers keep all navigation actions within narrow screens; size/colour controls use larger touch targets and the filter drawer keeps its result action visible while scrolling.
- Search and filters use the existing mock storefront catalog; no backend or authentication changes.

## Pages

Public: Home (CMS-aware) · Shop · Product details (public reviews launch-gated) · Cart · Checkout (shared zone store + coupon codes) · Track order (real order-store lookup by ID + phone) · Wishlist · About · Contact · FAQ · Delivery info · Returns · Privacy · Terms · 404.

**Admin demo** (`/admin`, demo mode — UI only, session lives in the browser):

- Login: `admin@prosanti.store` / `prosanti` (shown on the login card)
- Dashboard: today's sales, live status pipeline, §88 delivery performance, low-stock alerts
- Orders: search + status filters, order details with item snapshots, customer info, journey timeline, and state-machine-driven actions (advance / cancel per §34)
- Products: catalog list w/ search + visibility filters, quick featured/archive actions, full sectioned editor (basics, pricing, variants/stock, media URLs + YouTube, publishing, SEO)
- Categories: data-driven create/edit/reorder/hide with Bengali names & subcategories (§5)
- Delivery zones: zone CRUD + reorder + active state — saved zones are what the customer checkout uses live (§20–21)
- Reviews: moderation queue — approve/hide/flag/feature/delete; storefront reviews wait for approval, verified badge only with matching order (§30)
- Coupons: fixed/percent, min order, category scope, validity & usage limits; checkout applies codes live; usage is recorded when an order is placed (§56)
- Inventory: per-product stock editor with configurable low-stock threshold that drives the dashboard alert (§57–58)
- Reports: period presets (7/30/all days) over the live order store — booked vs collected COD revenue, daily revenue chart, top products, zone and coupon breakdowns
- Settings: low-stock threshold (§58), platform constants (§68–70), per-domain demo-data resets (orders/catalog/zones/reviews/coupons/notifications/CMS/media)
- Payments: launch is **Cash on Delivery only** (§20–21, §26) with a live COD book; bKash/Nagad/cards listed as next-phase methods — no fake gateway wiring

Demo data (orders, catalog, zones, reviews, coupons, notifications, media) persists in `localStorage` under `prosanti.*` keys and can be reset from each toolbar. This is a UI prototype, not a security boundary — server/database authorization arrives with Supabase (§46–47). Public storefront reads still come from `src/lib/catalog.ts` until the data layer lands; zones are the exception — checkout already consumes the shared zone store.

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
│   │   ├── login/            # demo auth (§47)
│   │   ├── page.tsx          # dashboard (§32, §88)
│   │   ├── orders/           # list + [id] detail w/ status machine (§33–34)
│   │   ├── products/         # list, new, [id] editor (§71–74)
│   │   ├── categories/       # data-driven CRUD (§5)
│   │   ├── zones/            # delivery-zone manager (§20–21)
│   │   ├── homepage/         # §31 CMS: announcement, hero, sections
│   │   ├── customers/        # derived from the order store
│   │   ├── reviews/          # §30 moderation queue
│   │   ├── coupons/          # §56 discount-code manager
│   │   ├── inventory/        # §57–58 stock + threshold
│   │   ├── media/            # §49 library (URLs, sections, copy)
│   │   ├── notifications/    # §35 inbox + bell + live attention
│   │   ├── reports/          # sales reports over the order store
│   │   ├── settings/         # ops settings + demo-data resets
│   │   └── payments/         # COD-only policy + method roadmap
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
```

## Deploying to Vercel

Live project: [bhromor-zeta.vercel.app](https://bhromor-zeta.vercel.app). `vercel.json` pins Framework = Next.js so dashboard Build settings cannot drift.

1. Push to `main` → auto-deploys.
2. Add keys in **Project → Settings → Environment Variables** (not team settings). Vercel’s form now asks **Config** vs **Secret** instead of a Sensitive checkbox — see **[docs/vercel.md](docs/vercel.md)** for the exact keys, types, and how to reset Build settings if they were changed by mistake.
3. After any env change: Deployments → ⋯ → **Redeploy** with “Use existing Build Cache” **unchecked**.
4. `GET /api/health` reports `"mode":"live"` when Supabase keys are present; otherwise the storefront stays in demo mode.

## Next phases (in order)

1. **Backend wiring** — apply `supabase/schema.sql`, then move `src/lib/*` demo stores behind data-access adapters backed by Supabase (catalog, orders, coupons, reviews, notifications, media refs); Cloudinary signed uploads (§48); `.env` keys are only needed then.
2. **Notif channels (SMS/WhatsApp)** on top of the inbox (§35) and customer accounts (§27) once auth is live.


## Customer accounts & remote wishlists

The storefront now includes `/account` with Supabase email OTP authentication and an RLS-protected, per-customer wishlist. Guest shopping still works without Supabase configuration. Guest import is explicit and additive; account data is not copied into guest localStorage.

See **[customer account setup and verification](docs/customer-accounts.md)** for the standalone SQL migration, OTP email template, environment configuration and required live two-account isolation checks. Automated tests use mocked service responses; live email/RLS verification requires a configured Supabase project. This does not convert demo checkout/admin data into a production order backend.


## Browser regression checks

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

Playwright starts a dev storefront at port 3100, or uses `E2E_BASE_URL` when supplied. Screenshots, traces and the HTML report go under ignored `.cache/`. The suite checks five responsive widths, keyboard/modal behaviour, reduced motion, wishlist/filter persistence, accessibility and the shopping flow up to checkout (without submitting an order). See [QA results and limitations](docs/browser-qa.md).
