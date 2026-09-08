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
| Phase 4 — Cart & Checkout (UI + client state) | ✅ UI complete (demo flow) |
| Phase 5 — Order tracking (UI) | ✅ UI complete (demo timeline) |
| Phase 3 rest — Admin products/categories/upload wizard | ⏳ Next UI phase (mock data) |
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

All gates are currently green (30 tests).

## Pages

Public: Home · Shop (filter/sort/search) · Product details (gallery, variants, buy/add) · Cart · Checkout (zones → charge/ETA, COD) · Track order (timeline demo) · About · Contact · FAQ · Delivery info · Returns · Privacy · Terms · 404.

**Admin demo** (`/admin`, demo mode — UI only, session lives in the browser):

- Login: `admin@prosanti.store` / `prosanti` (shown on the login card)
- Dashboard: today's sales, live status pipeline, §88 delivery performance, low-stock alerts
- Orders: search + status filters, order details with item snapshots, customer info, journey timeline, and state-machine-driven actions (advance / cancel per §34)

Demo order status changes persist in `localStorage` (`prosanti.admin.orders.v1`) and can be reset from the Orders toolbar. This is a UI prototype, not a security boundary — server/database authorization arrives with Supabase (§46–47).

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
│   │   └── orders/           # list + [id] detail w/ status machine (§33–34)
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

1. **Admin products & categories** (blueprint Phase 3): product/category CRUD, variants, media upload / external URL / YouTube fields, publish workflow — as mock-data UI like Orders.
2. **Delivery zones manager** (§20–21) and homepage CMS skeleton (§31).
3. Backend wiring per blueprint §41–50: Supabase schema (products, variants, media, orders, delivery zones, status history), RLS + auth (admin vs customer), Cloudinary upload for product media, and moving `src/lib/catalog.ts` + `src/lib/orders.ts` behind a data-access layer. `.env` keys are only needed then.
