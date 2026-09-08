# bhromor — PROSANTI storefront

Design-first build of **PROSANTI (প্রশান্তি)** — a premium commerce and rapid-delivery platform for Bangladesh, following the *PROSANTI Website Master Blueprint*.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Vitest**. Deploys to **Vercel**; later phases add **Supabase** (Postgres/auth/realtime) and **Cloudinary** (media).

## Current status

| Phase (per blueprint §83) | State |
|---|---|
| Phase 0 — Product definition (blueprint) | ✅ Complete |
| Phase 1 — Foundation (design system, routing, header/footer) | ✅ Complete |
| Phase 2 — Catalog (UI: shop, product pages, filters, search) | ✅ UI complete (mock data) |
| Phase 4 — Cart & Checkout (UI + client state) | ✅ UI complete (demo flow) |
| Phase 5 — Order tracking (UI) | ✅ UI complete (demo timeline) |
| Backend (Supabase, Cloudinary, orders, admin) | ⏳ Next — needs service keys |

The current catalog runs on typed mock data in `src/lib/catalog.ts`. Product/category/order shapes already follow the blueprint’s generic commerce model (§16, §44), so swapping in Supabase rows later does not require UI rewrites.

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
| `npm test` | Vitest suite (UI smoke + catalog/cart invariants) |
| `npm run build` | Production build (what Vercel runs) |
| `npm start` | Serve production build |

All gates are currently green (14 tests).

## Pages

Public: Home · Shop (filter/sort/search) · Product details (gallery, variants, buy/add) · Cart · Checkout (zones → charge/ETA, COD) · Track order (timeline demo) · About · Contact · FAQ · Delivery info · Returns · Privacy · Terms · 404.

Design language: deep forest green + warm ivory + muted gold, Playfair display serif + Inter + Noto Serif Bengali, arch-shaped brand imagery (signature motif), mobile-first.

## Routes map

```
src/
├── app/
│   ├── layout.tsx            # fonts, CartProvider, header/footer, metadata
│   ├── page.tsx              # homepage sections
│   ├── shop/                 # catalog with client-side filtering
│   ├── product/[slug]/       # SSG product pages (+ JSON-LD, metadata)
│   ├── cart · checkout · track
│   ├── about · contact · faq · delivery · returns · privacy · terms
│   └── globals.css           # design tokens (forest/ivory/gold)
├── components/
│   ├── layout/               # header, mobile nav, footer, newsletter
│   ├── cart/                 # CartProvider (localStorage) + cart view
│   ├── product/              # card, gallery, purchase panel
│   ├── shop/ · checkout/ · track/ · contact/
│   └── ui/                   # buttons, badges, prices, icons
└── lib/                      # catalog mock data, cart logic, money (paisa)
```

## Deploying to Vercel

1. Merge the open PR (`arena/01a07d50-bhromor` → `main`).
2. At [vercel.com/new](https://vercel.com/new), import `rewaz2050/bhromor` — Next.js is auto-detected, no settings needed.
3. Push to `main` → auto-deploys.

## Next phase (when you are ready)

Backend wiring per blueprint §41–50: Supabase schema (products, variants, media, orders, delivery zones, status history), RLS + auth (admin vs customer), Cloudinary upload for product media, and moving `src/lib/catalog.ts` behind a data-access layer. `.env` keys are only needed then.
