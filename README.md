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
| Backend (Supabase, Cloudinary, real orders/auth) | ⏳ Needs service keys |

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

All gates are currently green (74 tests).

## Pages

Public: Home (CMS-aware) · Shop · Product details (reviews section + write-a-review) · Cart · Checkout (shared zone store + coupon codes) · Track order (real order-store lookup by ID + phone) · Wishlist · About · Contact · FAQ · Delivery info · Returns · Privacy · Terms · 404.

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

1. Merge `arena/01a07f14-bhromor` → `main` when the phase is reviewed.
2. At [vercel.com/new](https://vercel.com/new), import `rewaz2050/bhromor` — Next.js is auto-detected, no settings needed.
3. Push to `main` → auto-deploys.

## Next phases (in order)

1. **Backend wiring** — apply `supabase/schema.sql`, then move `src/lib/*` demo stores behind data-access adapters backed by Supabase (catalog, orders, coupons, reviews, notifications, media refs); Cloudinary signed uploads (§48); `.env` keys are only needed then.
2. **Notif channels (SMS/WhatsApp)** on top of the inbox (§35) and customer accounts (§27) once auth is live.
