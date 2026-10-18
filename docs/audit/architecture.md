# PROSHANTI — Architecture Discovery

**Date:** 2026-10-18  
**Auditor:** Senior Full-Stack / Security / Performance / Accessibility / QA  
**Deployed URL:** https://proshanti.rahatahmed.site/ (unreachable during audit — see § Limitations)  
**Branch:** `arena/66ac5331-bhromor` @ `a7a3b92`  
**Local toolchain:** Next.js 16.4.0, React 19.2.8, Tailwind CSS v4, TypeScript 5, Supabase, Vitest, Playwright

---

## 1. Repository Structure

```
bhromor/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root: fonts, metadataBase, theme
│   │   ├── globals.css                   # 1316 lines — design tokens, animations, responsive
│   │   ├── proxy.ts                      # Next 16 proxy (middleware rename) — rate limit + session refresh
│   │   ├── manifest.ts / robots.ts / sitemap.ts / opengraph-image.tsx
│   │   ├── (site)/                       # Public storefront route group
│   │   │   ├── layout.tsx                # LanguageProvider, CartProvider, CustomerProvider, Header/Footer/BottomNav
│   │   │   ├── (home)/page.tsx           # ISR 60s — catalog + zones + homepage CMS
│   │   │   ├── shop/, product/[slug]/, cart, checkout, track, wishlist, live
│   │   │   ├── account, campaign, offers, shops/[slug], delivery, returns, faq, story, style, privacy, terms
│   │   │   └── [...missing]/page.tsx     # Catch-all → storefront 404
│   │   ├── admin/                        # Staff surface — 24 sub-routes
│   │   │   ├── layout.tsx + ops-gate-7f3a9c/  # Obscured login path
│   │   │   ├── orders/[id], products, categories, zones, deliveries, live
│   │   │   ├── reviews, coupons, inventory, media, messages, newsletter
│   │   │   ├── money/{audit,daily,export}, payouts, payments, customers, reports
│   │   │   ├── growth, homepage, settings, notifications, access, staff, threads
│   │   │   └── admin/__tests__/          # 15+ admin test files
│   │   ├── vendor/                       # Vendor portal (shop owners)
│   │   ├── rider/                        # Rider mobile portal
│   │   └── api/                          # ~37 API route groups
│   ├── components/                       # 33 sub-directories
│   │   ├── layout/ (header, footer, bottom-nav, mobile-nav, etc.)
│   │   ├── admin/, cart/, product/, shop/, checkout/, track/, analytics/
│   │   ├── ui/ (drawer, reveal, icons, password-input, etc.)
│   │   └── account/, loyalty/, warranty/, returns/, etc.
│   ├── lib/                              # ~80+ modules
│   │   ├── catalog.ts (23k), orders.ts (17k), delivery.ts, cart.ts
│   │   ├── supabase-server.ts, supabase-browser.ts, env.ts, admin-auth.ts
│   │   ├── db/ (35+ modules — orders, catalog, riders, money, etc.)
│   │   ├── __tests__/ (60+ unit test files)
│   │   └── translations.ts, format.ts, site-url.ts, etc.
│   └── proxy.ts
├── supabase/
│   ├── schema.sql                        # Core schema — enums, tables, RLS, order state machine
│   ├── migrations/ (112 files)           # Incremental patches from 2026-09-08 to 2026-10-14
│   ├── bootstrap-fresh.sql + paste-parts/ + tests/
│   └── checks/
├── public/ (brand, icons, favicon, apple-icon)
├── android/ (Capacitor native shell — 8.5.3)
├── e2e/ (playwright storefront suite)
├── scripts/ (seed-supabase.mjs, grant-admin.mjs, split-bootstrap.mjs)
├── docs/ (40+ markdown files — go-live, security, blueprints, passes)
├── capacitor.config.ts, next.config.ts, vercel.json, playwright.config.ts, vitest.config.ts
└── package.json (608 deps after npm ci)
```

---

## 2. Framework & Dependencies

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16.4.0 | App Router, `proxy.ts` convention (not `middleware.ts`) |
| UI | React | 19.2.8 | Server Components + Client Components |
| Styling | Tailwind CSS | v4 (`@tailwindcss/postcss`) | CSS-first `@theme`, design tokens in globals.css |
| Fonts | Fontsource Variable | Inter, Playfair Display, Noto Serif Bengali | Self-hosted, preloaded, no runtime fetch |
| Database | Supabase | @supabase/supabase-js 2.116.0 + @supabase/ssr 0.12.7 | Postgres + Auth + Realtime |
| Maps | Leaflet | 1.9.4 | OSM tiles, customer live tracking |
| Push | web-push | 3.6.7 | VAPID — staff + customer notifications |
| Mobile | Capacitor | 8.5.3 + @capgo/background-geolocation 8.4.11 | Android foreground GPS |
| Testing | Vitest | 3.2.7 | jsdom + @testing-library/react, ~60 test files |
| E2E | Playwright | 1.63.0 | Chromium, axe-core integration |
| Lint | ESLint | 9 (eslint-config-next) | core-web-vitals + typescript |
| Build | Vercel | nextjs framework | Auto-deploy on push to `main` |

**No backend framework beyond Next.js API routes + Supabase.** No Express, no tRPC, no Prisma.

---

## 3. Routes Map

### Public Storefront `(site)`

| Route | File | Auth | Notes |
|-------|------|------|-------|
| `/` | `(home)/page.tsx` | none | ISR 60s, PromoBoot, campaign strip, category shelves |
| `/shop` | `shop/page.tsx` | none | Filter/sort/search via URL params, pagination |
| `/shop?filter=sale` | same | none | Sale filter = client-side compareAtPrice |
| `/product/[slug]` | `product/[slug]/page.tsx` | none | Gallery, purchase panel, reviews, also-bought |
| `/shops` | `shops/(list)/page.tsx` | none | Directory |
| `/shops/[slug]` | `shops/[slug]/page.tsx` | none | Shop storefront |
| `/shops/[slug]/p/[product]` | same | none | Legacy product redirect |
| `/shops/apply` | `shops/apply/page.tsx` | optional | Creates auth + pending row |
| `/cart` | `cart/page.tsx` | none | Bag display |
| `/checkout` | `checkout/page.tsx` | none | Address, coupon, delivery slot, place order |
| `/track` | `track/page.tsx` | none | Order lookup by ID + phone, live map |
| `/wishlist` | `wishlist/page.tsx` | none | Guest localStorage + account sync |
| `/live` | `live/page.tsx` | none | Live shopping (YouTube embed or link-out) |
| `/offers` | `offers/page.tsx` | none | Promo codes, flash, bundle |
| `/campaign` | `campaign/page.tsx` | none | Campaign landing |
| `/account` | `account/page.tsx` | optional | Customer auth, orders, loyalty, wishlist |
| `/about`, `/story`, `/contact`, `/faq`, `/delivery`, `/returns`, `/privacy`, `/terms` | various | none | Static editorial — `prose-prosanti` |
| `/[...missing]` | `[...missing]/page.tsx` | none | Storefront 404 with best-seller rail |

### Admin (staff-only, `admin_users` gate)

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard — sales, pipeline, delivery perf |
| `/admin/orders` + `[id]` | Order list + detail, state machine actions |
| `/admin/products` | Catalog CRUD |
| `/admin/categories` | Category CRUD |
| `/admin/zones` | Delivery zones |
| `/admin/deliveries` | Dispatch board |
| `/admin/live` | Live shopping control |
| `/admin/reviews` | Moderation queue |
| `/admin/coupons` | Discount codes |
| `/admin/inventory` | Stock editor |
| `/admin/media` | Media library |
| `/admin/messages` | Contact inbox |
| `/admin/newsletter` | Subscribers |
| `/admin/notifications` | Staff push setup |
| `/admin/money/{audit,daily,export}` | Rider money, audit, export |
| `/admin/payouts`, `/admin/payments` | Settlements |
| `/admin/reports`, `/admin/growth` | Analytics + funnel |
| `/admin/access` | Password reset requests |
| `/admin/ops-gate-7f3a9c` | **Obscured login** — secret path |
| `/admin/homepage`, `/admin/settings`, `/admin/customers`, `/admin/threads`, etc. | CMS + ops |

### Vendor & Rider

| Route | Purpose |
|-------|---------|
| `/vendor`, `/vendor/login`, `/vendor/products`, `/vendor/orders`, `/vendor/settings` | Shop owner portal |
| `/rider`, `/rider/login`, `/rider/apply`, `/rider/earnings` | Rider app: jobs, PIN, cash, earnings |

### API Routes (37 groups)

```
api/
├── health, settings, zones, products, reviews, newsletter, contact
├── orders (place, advance, cancel), bag/snapshot, cart
├── coupons/{best,validate}, membership, price-watch, stock-watch
├── track/{rider-location, push}, live, feed/{facebook,google}
├── auth/reset-request, account/*, shop-follow, referral
├── vendor/*, rider/*, riders/*, shop(s)/*
├── admin/* (orders, products, coupons, payouts, reports, push, media, etc.)
├── cron/tick, events, homepage, sitemap
└── ops/* (ops-gate protected)
```

---

## 4. Architecture Patterns

### Data Layer
- **Live-only:** No demo/localStorage fallback. `src/lib/catalog.ts` has launch seed for initial paint only; `src/lib/db/storefront.ts` + `src/lib/db/catalog.ts` provide live reads.
- **Two Supabase clients:** `getSupabaseServer()` (RLS, cookie-bound) + `getSupabaseAnon()` (cookie-less, for ISR/cache) + `getSupabaseService()` (service_role, server-only, `server-only` import guard).
- **Order state machine:** `src/lib/orders.ts` — `ORDER_FLOW` 7-step happy path + `TRANSITIONS` map + `STATUS_META`/`ACTION_LABEL`. SQL RPC `ps_place_order` / `ps_place_multi_order` enforces atomic placement.
- **Money in paisa:** All amounts integer paisa (`format.ts` `bdt()`), clamped at ≥0.

### Auth
- **Customers:** Supabase OTP email (optional feature), guest checkout default.
- **Staff:** Supabase Auth email/password + `admin_users` table (`admin`/`manager`/`super_admin` roles). Obscured login path `ops-gate-7f3a9c` + `requireStaff()` on every `/api/admin/*`.
- **Vendors/Riders:** Unified apply+signup — `POST /api/shops/apply` + `/api/riders/apply` create auth user + pending row atomically (rollback on failure). Login is sign-in only; pending/suspended states return 403 with reason.

### Styling
- **Tailwind v4 `@theme`** in `globals.css` — forest/ivory/gold palette, 3 font stacks, motion tokens (`--motion-*`, `--ease-refined`), shadows.
- **Per-language typography:** `:lang(bn)` removes tracking/italic. `<html lang>` set pre-paint via inline script (localStorage → cookie → `bn` default).
- **Scroll performance:** All per-frame work removed (header uses rAF+ref for progress, no backdrop-blur on mobile, one photo/card initially).

### Caching & Performance
- **ISR:** Home revalidates every 60s (`unstable_cache` + `CACHE_TAG_HOMEPAGE`).
- **Images:** AVIF/WebP, `minimumCacheTTL` 31 days, 4 remotePatterns (Cloudinary, Google thumbs).
- **Fonts:** Self-hosted woff2, `<link rel="preload">` in both layouts.
- **No service worker** by design — prices/stock are live.

### Push & Realtime
- **Staff push:** VAPID (web-push) → `push_subscriptions` table, `public/sw.js` registered from admin only.
- **Customer push:** Same VAPID keys, `customer_push_subscriptions`, proof-gated (order ID + phone).
- **Live tracking:** Leaflet/OSM + Supabase Realtime channel per order (`live-track-channel.ts` — order UUID + phone derived name) with HTTP polling fallback.
- **Cron:** `crontab` via `.github/workflows/cron.yml` → `POST /api/cron/tick` every 15 min (expire-offers, delivery-reminders, daily-digest, prune events).

---

## 5. Environment Variables

| Name | Visibility | Purpose | Required |
|------|-----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL (must be https) | Yes (backend) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Anon key (RLS still protects) | Yes (backend) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Bypasses RLS — orders, tracking, seed | Yes (backend) |
| `UPSTASH_REDIS_REST_URL/TOKEN` | server-only | Distributed rate limit (optional) | No |
| `PUSH_VAPID_PUBLIC_KEY` | public | Web Push (exposed by design) | For push |
| `PUSH_VAPID_PRIVATE_KEY` | server-only | Web Push signing | For push |
| `PUSH_VAPID_SUBJECT` | server | `mailto:` for VAPID | No |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | public | Media host | For uploads |
| `CLOUDINARY_API_KEY/SECRET` | server-only | Signed uploads | For uploads |
| `NEXT_PUBLIC_META_PIXEL_ID` | public | Meta Pixel (blank = off) | No |
| `NEXT_PUBLIC_GA4_ID` | public | GA4 (blank = off) | No |
| `NEWSLETTER_SIGNUP_URL` | server | External newsletter override | No |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical origin for OG/sitemap | Recommended |
| `CRON_SECRET` | server-only | Cron tick auth | For automation |
| `HEALTH_TOKEN` | server-only | External health monitor | No |
| `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` | auto | Vercel-provided fallback origin | Auto |

**All server-only keys are gated by `isSupabaseConfigured()` / `isServiceRoleConfigured()` checks — missing keys return honest 503, never throw at import time.**

---

## 6. Deployment

- **Host:** Vercel (`vercel.json` pins `framework: nextjs`, `buildCommand: npm run build`). Auto-deploy on push to `main`.
- **Deployed site:** `https://proshanti.rahatahmed.site` (custom domain via `NEXT_PUBLIC_SITE_URL` or Vercel domain). Uses `metadataBase: new URL(siteBaseUrl())` for correct canonical/OG.
- **Android:** Capacitor shell (`capacitor.config.ts` → `server.url` = deployed origin). `.github/workflows/android-apk.yml` builds debug APK (free, public repo). `useLegacyBridge: true` required for background GPS.

---

## 7. User Roles & Workflows

| Role | Identity | Capabilities |
|------|----------|-------------|
| **Shopper (guest)** | none | Browse, search, filter, bag, checkout (phone/address), track by ID+phone, wishlist (local) |
| **Shopper (account)** | Supabase Auth (OTP email) | + order history, saved wishlist, addresses, loyalty stamps, referral |
| **Shop Vendor** | Supabase Auth (apply→active) | Own products, orders, shop settings, free-delivery toggle, payouts |
| **Rider/Courier** | Supabase Auth (apply→active) | Job board, PIN verification, GPS streaming, cash cap, earnings/payouts |
| **Staff `admin`** | Supabase Auth + `admin_users` | Full admin (orders, catalog, zones, dispatch, reviews, coupons, reports, money) |
| **`manager`** | same | Limited admin per RLS/middleware |
| **`super_admin`** | same | All incl. staff management |

**Core workflow:** Shopper browses → adds to bag (single-shop constraint) → checkout (address via zone picker, coupon, delivery slot, COD or bKash/Nagad) → `ps_place_order` (atomic, stock check, coupon validate) → order `pending` → admin/vendor `confirmed` → `ready-for-pickup` → rider dispatched (auto-offer, 90s window, re-offer on expiry) → rider `courier-assigned` → `out-for-delivery` (4-digit PIN shown) → `delivered` (PIN verified, proof photo, cash settled).

---

## 8. Testing

| Suite | Tool | Scope | Count (README) |
|-------|------|-------|----------------|
| Unit/component | Vitest + jsdom + testing-library | lib pure functions (catalog, orders, cart, delivery, coupons, etc.) + component smoke | ~1,533 (README) |
| Admin/dashboard | Vitest | Admin pages, money, dispatch, rate limits | Part of above |
| E2E | Playwright (Chromium) | Responsive widths, keyboard/modal, reduced-motion, wishlist/filter persistence, shopping flow | 14 checks |
| Dashboard E2E | Playwright (dashboards.config.ts) | Admin dashboards with API interception | Separate config |
| DB integration | PGlite + node scripts | Supabase RPC/migration probes (area-broadcast, workflow-postgres, rider-money) | `supabase/tests/` |

**Quality gates:** `npm run lint && npm run typecheck && npm test && npm run build`

- `npm run typecheck` — ✅ passes (t=2026-10-18 local run, 0 errors)
- `npm run lint` — not yet verified locally (eslint installed, but CI includes it)
- `npm test` — large suite, slow in constrained env (1,500+ tests); spot checks show coverage
- `npm run build` — not yet verified locally (requires env-independent static shell)

---

## 9. Integrations

| Integration | Module | Status |
|-------------|--------|--------|
| Supabase Postgres + Auth + Realtime | `supabase/*`, `lib/supabase-*` | Configured via env; live-only |
| Cloudinary (images/video) | `lib/media.ts`, `lib/cloudinary-sign.ts`, `lib/db/promo.ts` | Optional — 503 when unconfigured |
| Upstash Redis (rate limit) | `lib/distributed-rate-limit.ts` | Optional — local fallback |
| OSM tiles (Leaflet) | `lib/live-map.ts`, `components/track/*` | Always available (no key) |
| YouTube (product video, live embed) | `app/live/*`, product gallery | Optional |
| Meta Pixel + GA4 | `components/analytics/*` | Optional (blank = off), consent-gated |
| Web Push (VAPID) | `lib/push.ts`, `lib/customer-push.ts`, `public/sw.js` | Optional (keys + migration) |
| Facebook/Google feeds | `app/api/feed/*` | Derived from catalog, hourly revalidate |
| WebView (Android) | `android/`, `capacitor.config.ts` | Debug APK via Actions |

---

## 10. Limitations & Audit Constraints

| Limitation | Impact |
|------------|--------|
| **Deployed site unreachable** | `https://proshanti.rahatahmed.site` returned `SSL_ERROR_SYSCALL` / empty reply on every probe (2026-10-18). No lab Lighthouse, no PageSpeed, no live functional test. All functional/UI/SEO findings are from **source inspection + local static analysis + mocked E2E**, not live browser tests. Bundle audit via `route-bundle-stats.json` covers perf until live. |
| **No backend env locally** | `NEXT_PUBLIC_SUPABASE_URL` and service-role keys are absent — API routes return 503 `NOT_SEEDED` by design. Local E2E uses mocked `fetch` for checkout/track; vendor/rider/admin remain code-reviewed only. |
| **No device lab** | Mobile checks via Playwright 360×800/768×1024/1280×900 screenshots + 44px touch target asserts; not on-device. Keyboard + reduced-motion also via Playwright. |
| **Large test suite slow** | Full Vitest 71 files truncated by sandbox timeout; spot runs (catalog/orders/coupon) pass; build now verified 83/83. |
| **No RLS live probe** | Row-level policies reviewed in `supabase/schema.sql` + migrations + `admin.ts` `requireStaff` gates; PGlite run needs seeded DB. |
| **Third-party creds absent** | Cloudinary, VAPID, GA4/Pixel — config presence only, not delivery; `HEALTH_TOKEN`/`UPSTASH` env-gated. |

---

## 11. Git Status (at audit close)

- Branch `arena/66ac5331-bhromor` branched from `a7a3b92` (Merge PR #46), now at 6 commits ahead.
- `lint 0` + `typecheck 0` + `next build 83/83` + `route-bundle-stats.json` + 7 E2E suites (a11y 16, checkout 5, track 3, responsive 4, keyboard 4, reduced-motion 2, storefront 14).
- Additive migration: `202610180001_checkout_idempotency.sql` (nullable `idempotency_key` + partial unique index, re-runnable).
- `.env` / `.env.local` correctly git-ignored; no secrets in diff.

---

*Next: `docs/audit/findings.md` — evidence-based issue inventory.*
