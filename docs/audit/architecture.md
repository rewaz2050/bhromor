# PROSHANTI — Architecture Discovery (Phase A)

**Date:** 2026-10-19  
**Branch:** `arena/d56529ee-bhromor` (from `a7a3b926`)  
**Auditor:** Senior full-stack / UI/UX / security / performance / a11y / QA  
**Method:** read-only repo inspection, local `npm ci` → lint/typecheck/test/build, deployed-site probe, static analysis. No destructive ops, no intrusive prod tests, no private data access.

---

## 1. Overview

**Product:** PROSANTI (প্রশান্তি) — premium commerce + rapid-delivery platform for Bangladesh (Sunamganj-centric, 45–50 min delivery promise). Multi-vendor marketplace, rider dispatch, loyalty, returns.

**Repo:** `rewaz2050/bhromor` — private repo mapped to deployed host `https://proshanti.rahatahmed.site/` (owner-provided). Local dev: `http://localhost:3000`.

**Status per blueprint §83:** Phases 0–8 complete — foundation, catalog/marketplace, rider network, cart/checkout, realtime tracking, loyalty, returns, admin ops.

---

## 2. Framework & Toolchain

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.4.0 App Router** (Turbopack) | `src/app/` route groups, `proxy.ts` (renamed middleware), `next.config.ts` |
| Language | **TypeScript 5 + `strict:true`** | `tsconfig.json` path alias `@/* → src/*` |
| Styling | **Tailwind CSS v4 + `globals.css` theme tokens** | `@theme` defines forest/ivory/gold palette; self-hosted fonts via `@fontsource` |
| Fonts | Inter Variable, Playfair Display Variable, Noto Serif Bengali (400/500/600) | Preloaded woff2 in root + storefront layouts; Bengali typography rules in `globals.css` |
| State | Client contexts (`CartProvider`, `CustomerProvider`, `LanguageProvider`, live-catalog registry) + server `unstable_cache` ISR | Cart in `localStorage` + `live-catalog` registry; promo/homepage via tagged cache (60 s revalidate) |
| DB/Auth/Realtime | **Supabase** (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116) | `src/lib/supabase-server.ts` (RLS vs service-role clients), `proxy.ts` refreshes auth cookie |
| Media | **Cloudinary** (`res.cloudinary.com`) + Google Drive/`lh3.googleusercontent.com` + YouTube thumbs | Signed uploads via `/api/media/sign`; remotePatterns allowlist in `next.config.ts` |
| Maps | **Leaflet 1.9.4 + OSM tiles** | `components/track/rider-tile-map.tsx`, `lib/live-map.ts`, checkout `map-pin-picker` |
| Push | **Web Push** (`web-push` 3.6.7) | Staff + customer subscriptions, `pushSubscriptionsReady`, `customerPushReady` |
| Mobile | **Capacitor 8.5.3 + @capgo/background-geolocation** | `android/` shell → `capacitor.config.ts` loads deployed URL; foreground-service GPS |
| Testing | **Vitest 3.2.7 (jsdom) + Testing Library + Playwright 1.63 + @axe-core/playwright** | 173 test files (Vitest), `e2e/storefront.spec.ts` + `e2e/dashboards.spec.ts` |
| Build/Deploy | **Vercel** (`vercel.json` framework=nextjs) + GitHub Actions `ci.yml`, `cron.yml`, `android-apk.yml` | Cron hits `/api/cron/tick` with `CRON_SECRET` |
| Lint/Type | ESLint 9 (`eslint-config-next` core-web-vitals) | `eslint.config.mjs` ignores `.next/out/build/.cache` |

**Scripts (quality gates):** `npm run lint && npm run typecheck && npm test && npm run build` — documented in README.

---

## 3. Repository Structure

```
/home/user/bhromor
├── src/app/                 # App Router
│   ├── layout.tsx           # Root html/head (fonts, preloads)
│   ├── globals.css          # Theme, focus, prose, motion
│   ├── (site)/              # Public storefront chrome
│   │   ├── (home)/          # Home ISR (60s) — CatalogHydrator, HomeClient
│   │   ├── layout.tsx       # Header/Footer/BottomNav/BagDrawer/Analytics gates
│   │   ├── about|contact|delivery|faq|privacy|terms|returns|story|...
│   │   ├── shop/            # ShopBrowser (filters, sort, pagination)
│   │   ├── shops/           # Directory + [slug] + [slug]/p/[product] (C5)
│   │   ├── product/[slug]/  # Legacy 308 → shops/<shop>/p/<piece>
│   │   ├── cart|checkout|track|wishlist|account|style|campaign|live|offers
│   ├── admin/               # Admin console (28 sub-routes)
│   ├── rider/|vendor/       # Rider & vendor portals
│   ├── api/                 # 178 API routes (see §4)
│   └── proxy.ts             # Supabase session refresh + distributed rate limit
├── src/components/          # layout, cart, checkout, product, shop, admin, rider, ...
├── src/lib/                 # 80+ modules: catalog, cart, orders, delivery, env, rate-limit, ...
├── supabase/                # schema.sql, migrations/* (108+), bootstrap-parts/, tests/
├── public/                  # brand, icons, images, sw.js
├── android/                 # Capacitor shell
├── e2e/                     # storefront.spec.ts, dashboards.spec.ts
├── docs/                    # 30+ audit/fix/runbook docs + assets
├── scripts/                 # seed-supabase.mjs, grant-admin.mjs, etc.
├── next.config.ts           # Security headers, CSP report-only, image remotePatterns
├── vercel.json              # framework nextjs
└── package.json
```

---

## 4. Routes & Pages

### 4.1 Public Storefront (ISR or force-dynamic)

| Route | File | Type |
|---|---|---|
| `/` | `(site)/(home)/page.tsx` | ISR `revalidate=60` (catalog + homepage settings) |
| `/shop` | `(site)/shop/page.tsx` | Dynamic (filtered catalog) |
| `/shops` | `(site)/shops/(list)/page.tsx` | Listing |
| `/shops/[slug]` | `shops/[slug]/page.tsx` | Shop storefront |
| `/shops/[slug]/p/[product]` | `shops/[slug]/p/[product]/page.tsx` | Product detail (C5 canonical) |
| `/product/[slug]` | `product/[slug]/page.tsx` | 308 redirect → shop-scoped URL (or disambiguation) |
| `/cart`, `/checkout`, `/track`, `/wishlist`, `/account` | respective `page.tsx` | Dynamic |
| `/offers`, `/live`, `/style`, `/campaign` | respective | Dynamic |
| `/about`, `/story`, `/contact`, `/delivery`, `/returns`, `/faq`, `/privacy`, `/terms` | static content | ISR/static |
| `[...missing]` | `(site)/[...missing]/page.tsx` | 404 with `notFound()` |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/opengraph-image` | `sitemap.ts`, `robots.ts`, `manifest.ts`, `opengraph-image.tsx` | Static + dynamic |

**404 handling:** Site-wide `loading.tsx` removed above refusable routes (scan 2026-10-08); homepage & shops listing keep scoped skeletons via route groups. 404 pages export `noindex` + correct 404 status. Verified: `not-found-status.test.ts` asserts file placement; `e2e` asserts HTTP status.

### 4.2 Admin / Ops

28 routes under `/admin/*`: `orders/[id]`, `products/*`, `categories`, `coupons`, `customers`, `deliveries`, `dispatch-settings`, `growth`, `homepage`, `inventory`, `live`, `media`, `messages`, `money/{audit,daily,export}`, `newsletter`, `notifications`, `orders`, `payments`, `payouts`, `reports`, `reviews`, `riders/*`, `settings`, `shops`, `staff`, `threads`, `zones`, `access`, `ops-gate-7f3a9c`. Layout `admin/layout.tsx` wraps `AdminGate` + `robots noindex`.

### 4.3 Rider & Vendor

- `/rider` (assignments, jobs, earnings, history, inbox, kyc, location …) + `/rider/login`, `/rider/apply`
- `/vendor` (products, orders, earnings, promos, staff, funnel …) + `/vendor/login`

### 4.4 API (selected, 178 routes total)

| Prefix | Examples |
|---|---|
| `/api/health` | Readiness probe (live, counts, per-migration flags) |
| `/api/orders` | Multi-shop `placeLiveMultiOrder`, validation via `order-split` |
| `/api/account/{login,signup,me,orders,profile,password,addresses,threads}` | Customer auth (phone/session, Supabase `customer_accounts`) |
| `/api/admin/*` | `products`, `orders/[id]/advance`, `deliveries/offer`, `dispatch-settings`, `money/*`, `push`, `live/sessions` |
| `/api/rider/{assignments,availability,earnings,location,push,kyc}` | Rider flow |
| `/api/vendor/{products,orders,media/sign,promos,staff,push}` | Vendor flow |
| `/api/track/{rider-location,push,rate,cancel,reschedule}` | Tracking |
| `/api/shop-follow`, `/api/stock-watch`, `/api/price-watch`, `/api/reviews`, `/api/contact`, `/api/newsletter` | Engagement |
| `/api/cron/tick` | Clock (offer expiry, reminders, digests) — `CRON_SECRET` |
| `/api/csp-report` | CSP violation collector (`report-uri`, 8 KB limit, redacted) |
| `/api/[...missing]` | JSON 404 for unknown API paths |

---

## 5. Dependencies & Integrations

| Integration | Env Vars | Status |
|---|---|---|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Live-only; unconfigured → 503 + empty catalog (never demo data). `isSupabaseConfigured()` / `isServiceRoleConfigured()` gates |
| **Cloudinary** | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY/SECRET` | `isCloudinaryConfigured()`; `remotePatterns` allow `res.cloudinary.com` |
| **Upstash Redis** | `UPSTASH_REDIS_REST_URL/TOKEN` | Optional distributed rate limit (`proxy.ts` → `distributedRateLimit`); fallback to in-memory `rate-limit.ts` |
| **Web Push (VAPID)** | `PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` | Staff + customer; `npx web-push generate-vapid-keys` |
| **Health/Cron** | `HEALTH_TOKEN`, `CRON_SECRET` | `GET /api/health` details gated to staff or `x-health-token`; cron via GitHub Actions |
| **Site URL** | `NEXT_PUBLIC_SITE_URL` (+ `VERCEL_*` fallbacks) | Canonical/OG/sitemap origin via `site-url.ts` |
| **Analytics** | `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_FB_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID` | Storefront-only, consent-gated (`analytics-consent-gate.tsx`) |
| **Newsletter** | `NEWSLETTER_SIGNUP_URL` | Footer form |

**Sensitive:** `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `CLOUDINARY_API_SECRET`, VAPID private key, `CRON_SECRET`, `HEALTH_TOKEN` are server-only, never `NEXT_PUBLIC_` prefixed.

---

## 6. Data Model & Auth

- **Schema:** `supabase/schema.sql` + 108 migrations + `bootstrap-parts/`. Tables: `products`, `categories`, `shops` (marketplace), `delivery_zones`, `orders`/`order_items`/`order_status_history`, `admin_users`, `rider_profiles`, `vendor_staff`, `coupons`, `reviews`, `customer_accounts`, `delivery_assignments`, `push_subscriptions`, `customer_push_subscriptions`, `wa_outbox`, `cron_marks`, etc. Enums: `ps_order_status`, `ps_user_role`, etc.
- **RLS:** enabled everywhere; anon reads published catalog; customers touch own orders; `admin_users.is_admin()` bypass.
- **Order state machine:** `lib/orders.ts` — `ORDER_FLOW` 7 steps (`pending` → `delivered`) + `cancelled`; `TRANSITIONS` with two-tap `confirmed → ready-for-pickup` (202609170001); `PUBLIC_STEPS` 4 customer milestones.
- **Auth:** Supabase Auth cookies refreshed in `proxy.ts` (`updateSupabaseSession`). Admin via `requireStaff()`; customer via `customer-auth.ts` (phone/session); rider/vendor via Supabase auth + role.
- **Seeding:** `scripts/seed-supabase.mjs` upserts `lib/catalog.ts` launch catalog; `supabase/tests/*` validate RPCs.

---

## 7. Build, Deploy & Ops

- **Build:** `npm run build` (Turbopack) — 1813 ms compile + TS + 83 static pages (1 worker). `next.config.ts` headers: nosniff, referrer-policy, permissions-policy, HSTS, CSP report-only (storefront) + enforced CSP on `/admin/*` + `no-store` for PII routes, `X-Frame-Options SAMEORIGIN`. Image `formats: [avif,webp]`, `minimumCacheTTL: 31d`.
- **Vercel:** `vercel.json` `framework: nextjs`, `buildCommand: npm run build`. Production domain via `NEXT_PUBLIC_SITE_URL` / `VERCEL_PROJECT_PRODUCTION_URL`.
- **CI:** `.github/workflows/ci.yml` — `npm ci` → lint → typecheck → test → build (Node 22) on push to `main` + PRs; `test:dashboards` browser job (`continue-on-error`, not on PRs — see `docs/browser-qa.md`).
- **Cron:** `.github/workflows/cron.yml` — every 15 min hit `/api/cron/tick` (needs `CRON_SECRET` in Vercel + GitHub Secrets).
- **Android APK:** `.github/workflows/android-apk.yml` — `cap sync android` + `gradlew assembleDebug` → `PROSANTI-rider-*.apk` artifact (public repo = free minutes).

---

## 8. Styling & UX System

- **Tailwind v4** `@theme` tokens: `forest-*` (deep green), `ivory-*` (warm cream), `gold-*` (muted gold), `ink`/`ink-soft`/`line`. `globals.css` handles fonts, scroll-behavior, scrollbars (desktop-only), focus-visible, arch/editorial classes, `prefers-reduced-motion` kill.
- **Layout:** Sticky header (paint-only scroll, RAF progress line, desktop blur only), `BottomNav` (phones), `BagMiniBar`/`BagDrawer`, `FlashStrip`/`CampaignStrip`, `LiveCatalogBoot`, `InstallPrompt`.
- **Homepage shelf:** hero (headline + 1 CTA) → recently-viewed (returning) → category row → offers → category shelves → reviews → delivery check → promise strip.
- **Shop:** `ShopBrowser` (category/price/size/color/stock/zone filters, URL-synced, `SHOP_PAGE_SIZE=24`, grid interrupts).
- **Product:** `ProductCard` (peek, wishlist, flash price, size badge, offer chip), `ProductPageView` (gallery, purchase panel, reviews, warranty/fabric).

---

## 9. Tests & Quality

- **Vitest:** 173 suites (jsdom) — unit + component. Invariants (cart/orders/catalog), UI smoke, a11y spot checks. `act(...)` warnings present but non-failing. See `npm test` output in `test-report.md`.
- **E2E:** `e2e/storefront.spec.ts` — 14 Playwright tests (responsive, quick-add→bag→checkout, search focus trap, wishlist, reduced-motion, axe a11y) — requires Chromium + seeded catalog. `e2e/dashboards.spec.ts` — admin/rider/vendor mocked API fixtures.
- **Other:** `supabase/tests/{area-broadcast,workflow-postgres,rider-money}.test.mjs` (PGlite), `scripts/*` dry-run checks.

---

## 10. Git Status (2026-10-19)

- **Branch:** `arena/d56529ee-bhromor` branched from `a7a3b9262abe0cda29fcb123bd66c49d76cc65b0` (main).
- **Working tree:** clean at audit start; `npm ci` added `node_modules` (gitignored).
- **Branch-specific changes (Final 2026-10-19):** `34889e3` audit deliverables + E1.2/E1.3 fixes; NEW batch: `next.config.ts` hardened + `csp-report` route + `logger.ts` + error boundaries unified + sitemap +3 routes + CI typecheck+browser gates + `package.json` analyzer + audit non-breaking fix (12→11 vulns). Build `83+1 pages`, `lint 0`, `test 173 suites green`.

---

## 11. Known Limitations of This Audit Environment

| Area | Limitation | Impact |
|---|---|---|
| Deployed site `https://proshanti.rahatahmed.site/` | TLS handshake fails (`SSL_ERROR_SYSCALL` / `TLS non-proper termination`) from this sandbox; `curl -k` also fails (empty reply). DNS resolves to 64.29.17.65 / 216.198.79.65 (likely Hostinger/A2 proxy) but no TLS. | No live crawl, no Lighthouse/PageSpeed lab run, no visual comparison vs source. Findings distinguish source-inspected vs prod-verified. |
| Supabase/Cloudinary/VAPID | No env vars configured in audit sandbox | `/api/health` and 24 catalog/order routes answer 503 (documented honest degradation). DB schema checked statically (`schema.sql` + migrations). |
| Browser/Chromium | Playwright browser not pre-installed; download blocked by allowlist in some contexts | E2E suites not executed in this run; axe checks not re-run live. Existing `docs/browser-qa.md` + axe-in-E2E referenced. |
| Real devices | No iOS Safari/Android hardware | Mobile QA via responsive emulation only. |

> **Honesty rule:** No bugs, scores, or test results are invented. Unmeasured areas are flagged as such (see `findings.md` confidence + `test-report.md` untested areas).

---

## 12. Final Status — All Audit Phases Complete (2026-10-19)

| Phase | Outcome |
|---|---|
| A — Discovery | ✅ Done (this doc) — 83+1 routes, 178+1 APIs, all integrations mapped |
| B — Complete Audit | ✅ Done (`findings.md` 19 issues, P0:0, all with evidence) |
| C — Findings | ✅ Done with verification ledger |
| D — Implementation Plan | ✅ Done (E1-E6 all complete, see implementation-plan.md) |
| E — Controlled Fixes | ✅ **12 fixes shipped** (see findings verification ledger): E1.2 lint 0, E1.3 canonical host + sitemap, E1.4 CI, P1-04 browser gate, P2-01 CSP+csp-report, P2-02 documented, P2-03 incremental, P2-05/06 verified non-issue, P2-08 analyzer, P2-09 logger+4 boundaries, P1-02 audit 12→11 |
| F — Testing | ✅ Done (`test-report.md` — lint 0, build 83+1, 173 suites, 11 vulns remaining documented) |
| G — Release Criteria | ✅ See `test-report.md` §15 checklist — shippable audit branch (honest pending: Lighthouse + E2E live re-run needs site reachable) |

**Remaining owner actions:** Verify P1-01 second network (`curl -I` + SSL Labs) + set `NEXT_PUBLIC_SITE_URL` in Vercel (fallback now correct anyway); add `UPSTASH_*` if shared rate limit desired; `npx lighthouse` 3× on 4 routes → baseline doc; observe CSP soak 7 d.
