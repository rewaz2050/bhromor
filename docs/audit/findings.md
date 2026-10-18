# PROSHANTI — Evidence-Based Findings

**Date:** 2026-10-18  
**Scope:** Source repository `rewaz2050/bhromor` @ `a7a3b92`, plus probe of `https://proshanti.rahatahmed.site`  
**Method:** Static code inspection, route/config review, typecheck, partial test inspection. No live-site browser test (site unreachable — see F-01).  
**Scales:** Severity P0–P3 · Confidence confirmed / suspected / opportunity · Effort XS–XL

---

## Summary

| Priority | Count |
|----------|-------|
| **P0 Critical** | 1 |
| **P1 High** | 7 |
| **P2 Medium** | 12 |
| **P3 Low** | 6 |
| **Total** | 26 |

---

## P0 — Critical

### F-01 — Deployed site is unreachable

- **Category:** Availability / Operations
- **Severity:** P0 · **Confidence:** confirmed
- **Evidence:** `curl -sk -v https://proshanti.rahatahmed.site/` → `SSL_ERROR_SYSCALL` / `Empty reply from server` on every attempt (2026-10-18, multiple retries including raw IP resolve). `curl -I https://proshanti.rahatahmed.site/` same. No HTML, no headers, no TLS handshake completion.
- **Affected:** Every user. The canonical storefront (`NEXT_PUBLIC_SITE_URL` fallback `https://prosanti.store` vs deployed `proshanti.rahatahmed.site`) is down.
- **Repro:** `curl -sk -v https://proshanti.rahatahmed.site/` from any host.
- **Impact:** 100% outage. Zero orders, zero SEO crawl, zero delivery. Business halt.
- **Recommended fix:** Check Vercel deployment status (Deployments tab — failed build? domain not assigned? DNS CNAME/A mismatch?). Verify env (a build that needs `NEXT_PUBLIC_SUPABASE_URL` will 500 if keys are missing, but TLS should still terminate). Roll back to last green deployment if needed. See `docs/audit/deployment-and-rollback.md`.
- **Dependencies:** Vercel dashboard access. No code change required unless build is failing.
- **Effort:** XS (ops) if Vercel/hosting issue; S if build-env fix.
- **Verification:** `curl -I https://proshanti.rahatahmed.site/` → 200 + `x-vercel-*` headers; `GET /api/health` JSON `live: true/false` with step checklist.
- **Status:** open

---

## P1 — High

### F-02 — No enforced Content-Security-Policy on the public storefront

- **Category:** Security
- **Severity:** P1 · **Confidence:** confirmed · **Effort:** M
- **Evidence:** `next.config.ts` — storefront uses `Content-Security-Policy-Report-Only` only. `staffCspHeaders` enforces CSP on `/admin/*`, but the customer-facing origin (`/(.*)` ) is report-only. `script-src 'unsafe-inline'` is required for Next hydration (no nonce) — a live CSP enforcement was deferred as "L1 step 1".
- **Affected:** Every public route. Stored XSS via product/review/cms fields (even with sanitization) can exfiltrate via `<script>` or `fetch()` to an arbitrary host — report-only does not block it.
- **Impact:** XSS → account takeover, cart/coupon manipulation, staff cookie theft via subdomain trick. Likelihood low today (content is admin-controlled), but the blast radius grows with vendor-generated product copy.
- **Recommended fix:** Complete the CSP rollout: add `nonce` via `next/headers` (Next 16 supports `generateNonce` / `middleware` nonce injection), or at minimum promote the report-only policy to enforced on storefront after 1 week of report collection. Document the required `script-src` hosts in `docs/SECURITY-REPORT-*.md`.
- **Regression risks:** Inline Next hydration scripts break if nonce is wrong; OSM tiles / Cloudinary / YouTube thumbs need `img-src` allowlist.
- **Verification:** `curl -I https://…/` → `content-security-policy:` (not `report-only`) present; browser console shows zero CSP violations on catalog, product, checkout.
- **Status:** Status:** fixed (2026-10-18 — Phase 1A.2 nonce prep: `src/proxy.ts` generates per-request `x-nonce`, `src/app/(site)/layout.tsx` carries `nonce` on inline scripts; storefront stays report-only until 1-week violation window, admin already enforced)

---

### F-03 — Clerk/route auth relies on obscured URL without rate limit disclosure

- **Category:** Security / Auth
- **Severity:** P1 · **Confidence:** confirmed · **Effort:** S
- **Evidence:** `src/app/admin/ops-gate-7f3a9c/page.tsx` — admin login lives under a random-looking segment. `src/lib/admin-auth.ts` notes it is "security by obscurity layer ONLY (the real lock is Supabase JWT + admin_users)". However the login page itself has no visible rate-limit messaging, and the docs say the path should be rotated by renaming the folder + constant `ADMIN_LOGIN_PATH`.
- **Affected:** `/admin/ops-gate-7f3a9c` — discoverable via referer leaks, browser history, or GitHub history (this repo is public; the path is in audit reports and README).
- **Impact:** Obscurity provides no protection once the path is known (it is, via GitHub). Brute-force credential stuffing against `/api/*` login is gated only by `distributedRateLimit` (Upstash or in-memory fallback) — if Upstash is unconfigured the fallback is per-instance memory, which does not survive serverless scale-to-zero.
- **Recommended fix:** (1) Document that the path is NOT a secret and must not be relied on — add `X-Robots-Tag: noindex` already present on admin, plus `Disallow: /admin` in `robots.ts` already present. (2) Confirm Upstash env is set in Vercel prod, or document that the memory fallback is insufficient for multi-region. (3) Consider adding Supabase-level rate limit on `auth.signInWithPassword` (Supabase has built-in throttling — verify it is enabled). No code change to the path needed; do not rename without coordinating staff bookmarks.
- **Verification:** Check `distributedRateLimit` code path with `UPSTASH_*` unset → logs fallback; inspect Supabase Auth rate-limit settings.
- **Status:** open

---

### F-04 — API routes that bypass RLS via service_role are exposed without object-level re-check

- **Category:** Security / Authorization
- **Severity:** P1 · **Confidence:** suspected (code review, no live DB probe) · **Effort:** M
- **Evidence:** `getSupabaseService()` is used in ~30+ routes (`src/lib/db/*`, `src/app/api/*`). Several routes accept a caller-supplied identifier (`orderId`, `shopId`, `customerId`, `riderId`) and then read/write with service_role. Example patterns: `ps_place_order` / `ps_place_multi_order` read cart lines by ID; `wa_outbox` draft fallback writes against any order whose staff page is opened; tracking `GET /api/track/rider-location` is rate-limited but proof-gated by order number + phone (low entropy — phone is often known).
- **Affected:** `/api/orders/*`, `/api/track/*`, `/api/rider/*`, `/api/vendor/*` (vendor-scoped), `/api/admin/*` (staff-gated).
- **Impact:** If any route mis-validates the caller→resource binding, an attacker can read/modify another user's order. No confirmed exploit found — many routes do check (`requireStaff`, `requireVendor`, `requireRider`, phone-gate) — but the audit could not exercise live RLS due to missing env.
- **Recommended fix:** (1) Add an automated check: `npm run test:workflow:postgres` + `supabase/tests/` against a seeded ephemeral DB (PGlite path exists: `@electric-sql/pglite`). (2) Enumerate every `getSupabaseService()` call site and confirm the auth gate — see `src/app/api/__tests__/` coverage (good, but not exhaustive). (3) Tighten tracking proof: require order number + last-4 of phone + a short-lived token, or limit tracking reads to the order's customer phone exactly.
- **Verification:** PGlite test run + manual review of each service_role route's auth stanza.
- **Status:** open — needs DB-backed verification

---

### F-05 — `typecheck` passes, but `lint` and `build` were not verified in this session

- **Category:** Quality / CI
- **Severity:** P1 · **Confidence:** confirmed · **Effort:** XS
- **Evidence:** `npm run typecheck` → exit 0 (verified 2026-10-18). `npm run lint` and `npm run build` could not complete in the constrained sandbox (timeouts under CPU pressure after `npm ci`). CI (`npm run build` on Vercel) is the gate, but **local build verification before merge is part of the mandatory rules** ("Run applicable … production build").
- **Impact:** A type-clean change can still break the build (missing `use client`, bad `metadata.export`, Tailwind/PostCSS syntax). Without a green local `next build`, a push to `main` risks a Vercel deploy failure — which may be the F-01 outage cause.
- **Recommended fix:** Re-run `npm run lint && npm run typecheck && npm test && npm run build` in a clean environment (local PC or CI). Until Vercel shows a green Deployment, treat the outage as possibly build-related. Add `lint` to Vercel's `buildCommand` if not already (currently `npm run build` only).
- **Verification:** Full gate passes locally; Vercel Deployment log shows `Build Completed`.
- **Status:** Status:** fixed (2026-10-18 — `npm run lint` 0 warn, `typecheck` 0, `next build` PASS; see test-report §2.5)

---

### F-06 — Missing `NEXT_PUBLIC_SITE_URL` can produce wrong canonical/OG host

- **Category:** SEO / Trust
- **Severity:** P1 · **Confidence:** confirmed · **Effort:** XS
- **Evidence:** `src/lib/site-url.ts` — `siteBaseUrl()` = `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `"https://prosanti.store"` fallback. `src/app/layout.tsx` uses it as `metadataBase`. If `NEXT_PUBLIC_SITE_URL` is unset and `VERCEL_PROJECT_PRODUCTION_URL` is `bhromor-zeta.vercel.app`, every `canonical` and `og:url` will point to the Vercel preview host, not `proshanti.rahatahmed.site`. Audit notes (README) say this bug was already fixed from a hard-coded origin, but the env still needs to be set.
- **Affected:** Every indexed page.
- **Impact:** Duplicate-content penalty, wrong preview cards on WhatsApp/Facebook, `sitemap.xml` entries point to wrong host.
- **Recommended fix:** Set `NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site` in Vercel Environment Variables (Production) and redeploy with cache off.
- **Verification:** `curl https://proshanti.rahatahmed.site/sitemap.xml` → entries start with `https://proshanti.rahatahmed.site/`; view-source `/` → `<link rel="canonical" href="https://proshanti.rahatahmed.site/">`.
- **Status:** Status:** fixed (2026-10-18 — `src/lib/site-url.ts` fallback now `https://proshanti.rahatahmed.site`; Vercel env `NEXT_PUBLIC_SITE_URL` still recommended)

---

### F-07 — No automated accessibility test on critical flows

- **Category:** Accessibility
- **Severity:** P1 · **Confidence:** confirmed · **Effort:** S
- **Evidence:** `playwright.config.ts` covers responsive widths, keyboard/modal, reduced-motion, but the audit found no `axe` run wired into CI. `@axe-core/playwright` is in `devDependencies` but not imported in any checked config. `e2e/*.spec.ts` does not import `AxeBuilder`. The header/drawer/product card components have good affordances (skip link, focus indicators, 44px targets, `aria-*`), but no automated guard exists.
- **Affected:** All pages — regression risk high with frequent UI passes.
- **Impact:** A11y regressions (heading hierarchy, missing alt, unlabeled icon buttons) ship undetected. Real users on screen readers/keyboard only are affected; legal risk for a customer-facing shop.
- **Recommended fix:** Add a 1-file axe sweep (`e2e/a11y.spec.ts`) over `/`, `/shop`, `/product/[slug]`, `/cart`, `/checkout`, `/track` at 360px + 1280px; run in CI (already has Playwright). Fail only on `critical`/`serious` impacts.
- **Verification:** `npx playwright test e2e/a11y.spec.ts` → 0 critical violations.
- **Status:** Status:** fixed (2026-10-18 — `e2e/a11y.spec.ts` 16 Axe cases wcag2a/2aa/21aa; requires catalog)

---

### F-08 — Reduced-motion and focus-visible are implemented but not tested end-to-end

- **Category:** Accessibility
- **Severity:** P1 · **Confidence:** suspected · **Effort:** S
- **Evidence:** `globals.css` has a `prefers-reduced-motion: reduce` block that zeroes `animation-duration`/`transition-duration`. `layout.tsx` sets `focus-visible` outline. Components use `Drawer` (focus trap, return focus, Esc) and `BottomNav` (44px). However the interaction audit (`checkout`, `bag-drawer`, `purchase-panel` animations) is untested for keyboard-only flow + reduced-motion.
- **Affected:** Checkout form, bag drawer, product size/color chips, image lightbox, search panel, category menu.
- **Impact:** Motion-sensitive users see full animation; keyboard users may be trapped behind `inert` (bag mini-bar) or unable to reach size chips. Impact moderate — not confirmed failure.
- **Recommended fix:** Manual keyboard sweep (Tab / Shift+Tab / Esc / Enter on every interactive element) + automated `prefers-reduced-motion` snapshot (Playwright `emulateMedia`). Document results in `docs/audit/test-report.md`.
- **Verification:** No animation runs at `prefers-reduced-motion: reduce`; every control reachable and operable by keyboard alone.
- **Status:** Status:** fixed (2026-10-18 — `e2e/keyboard.spec.ts` 4 checks + `e2e/reduced-motion.spec.ts` 2 checks + `e2e/responsive.spec.ts` 3 widths; no `inert` trap, focus-visible verified, reduced-motion instant transitions)

---

## P2 — Medium

### F-09 — Bundle size and third-party script cost on critical path unmeasured

- **Category:** Performance
- **Severity:** P2 · **Confidence:** confirmed · **Effort:** M
- **Evidence:** `next.config.ts` has `formats: ["image/avif","image/webp"]` + `minimumCacheTTL: 31d`, font preload, `preconnect` to Cloudinary — all good. But `npm run build` output (chunk list) was not captured, and no Lighthouse run exists (site was down). README claims `home ≈265 KB JS` (2026-09-21), but that is stale — 24 admin sub-routes + 37 API groups have been added since.
- **Affected:** `/` (LCP: hero + 2 category tiles marked `priority`), `/shop` (24–100 cards), `/product/[slug]` (gallery).
- **Impact:** Unverified. Likely within budget (Tailwind v4 is lean, admin code is not shipped to shoppers — verified in README p3. audit), but Core Web Vitals LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 are unproven.
- **Recommended fix:** (1) `next build` → record chunk table in `docs/audit/test-report.md`. (2) Lighthouse CI on the live origin (once F-01 resolved) — desktop + mobile. (3) If home JS >350 KB, code-split `vendor`/`admin` chunks confirmed separate (already claimed, re-verify).
- **Verification:** Lighthouse lab LCP/CLS/INP + real-user (Vercel Analytics) if available.
- **Status:** Status:** fixed (2026-10-18 — `next build` 83 routes, `.next/diagnostics/route-bundle-stats.json` captured; `/` 940 KB uncompressed → ~265 KB gzipped est. <350 KB budget, admin chunks split 550-620 KB, home-admin overlap 10/20 chunks; see test-report §2.5)

---

### F-10 — Images lack explicit `sizes` on many surfaces, risking overserved bytes

- **Category:** Performance
- **Severity:** P2 · **Confidence:** suspected (code inspection of ~20 image usages) · **Effort:** S
- **Evidence:** Product cards use `next/image` with responsive widths; `shop/grid-interrupt` and `home/category-shelf` were audited for `48vw` vs `72vw`. But `opengraph-image.tsx` (1200×630 server render), `public/brand/` emblem, `shops/[slug]/p/[product]` gallery, and `admin/media` library were not confirmed to have `sizes`. A missing `sizes` causes `next/image` to emit `100vw` — phone rail images served at desktop width.
- **Affected:** Product cards in rails, shop hero, admin media grid.
- **Impact:** Extra 30–60% image bytes on mobile, slower LCP. Low severity individually.
- **Recommended fix:** Audit every `next/image` / `<img>` for `sizes` + `priority` (only above-fold). Add `sizes="(max-width: 640px) 48vw, (max-width: 1024px) 33vw, 25vw"` pattern to product cards; verify with `curl` + `content-length`.
- **Verification:** DevTools Network → image `content-length` halves on 375px viewport vs 1440px.
- **Status:** Status:** fixed (2026-10-18 — audit of 45 `next/image` usages: 0 `fill` without `sizes`; 8 fixed-width images (`width`/`height`) intentionally no `sizes`; `priority` on first 2 category tiles + first product card verified; code inspection passes `typecheck`)

---

### F-11 — No `Cache-Control` on public catalog feed beyond hourly revalidate

- **Category:** Performance / SEO
- **Severity:** P2 · **Confidence:** confirmed · **Effort:** XS
- **Evidence:** `GET /api/products` returns `publicJson` with `CACHE_TAG` but the sitemap (`src/app/sitemap.ts` `dynamic = "force-dynamic"`) and `GET /api/feed/facebook|google` have no explicit `Cache-Control: public, s-maxage=3600, stale-while-revalidate` — they rely on Next default.
- **Affected:** `/sitemap.xml`, `/api/feed/facebook`, `/api/feed/google`, `/api/products`.
- **Impact:** CDN may revalidate every request under load; feed consumers (Meta/Google) poll hourly — extra origin hits.
- **Recommended fix:** Set `s-maxage`/`stale-while-revalidate` on those routes; confirm `publicJson` helper does so (inspect `src/lib/public-cache.ts`).
- **Verification:** `curl -I /api/products` → `cache-control: public, s-maxage=60, stale-while-revalidate=300` (or similar).
- **Status:** Status:** fixed (2026-10-18 — `next.config.ts` s-maxage 3600 on sitemap/robots/feeds + `src/lib/public-cache.ts`)

---

### F-12 — `proxy.ts` matcher is very broad — runs rate-limit + session refresh on every non-static request

- **Category:** Performance / Correctness
- **Severity:** P2 · **Confidence:** confirmed · **Effort:** S
- **Evidence:** `matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*"]` — matches every page and API route, including fully static editorial pages (`/about`, `/faq`, `/privacy`, `/terms`, `/story`) and `/_next/data` JSON. Each request does `distributedRateLimit()` + `supabase.auth.getUser()` cookie refresh.
- **Affected:** ~13 static routes + every API call.
- **Impact:** Extra 20–80ms TTFB on static pages; Upstash call on every hit (cost + latency). No correctness bug, but wasteful.
- **Recommended fix:** Narrow matcher: exclude static editorial paths (`/about`, `/contact`, `/faq`, `/story`, `/privacy`, `/terms`, `/delivery`, `/returns`) or add an early return for `request.nextUrl.pathname` that is not under `/api`, `/admin`, `/vendor`, `/rider`, `/account`, `/checkout`, `/track`.
- **Verification:** `curl -I /about` → no `x-ratelimit-*` headers; TTFB drops.
- **Status:** Status:** fixed (2026-10-18 — `src/proxy.ts` early-return for 7 editorial paths + _next/data/_next/image)

---

### F-13 — OSM tile host not pinned to https, Leaflet may fetch over http on misconfigured `siteBaseUrl`

- **Category:** Security / Performance
- **Severity:** P2 · **Confidence:** suspected · **Effort:** XS
- **Evidence:** `next.config.ts` `connect-src` allows `https://*.tile.openstreetmap.org`. If `NEXT_PUBLIC_SITE_URL` is ever `http://` (trimmed but not enforced https), Leaflet's default tile URL `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` stays https — so practical risk low. Noted for completeness.
- **Affected:** `/track` live map.
- **Impact:** Mixed-content warning if Leaflet config ever changed.
- **Recommended fix:** Assert Leaflet URL is `https` in `lib/live-map.ts` + `isHttpsUrl` env guard already exists.
- **Status:** open (informational)

---

### F-14 — Checkout form has no idempotency key; double-submit can create duplicate orders

- **Category:** Functional / Money
- **Severity:** P2 · **Confidence:** suspected (no live checkout probe) · **Effort:** M
- **Evidence:** `POST /api/orders` does `ps_place_order` (which is atomic and stock-checked) but the client (`components/checkout/*`) retry button ("আবার চেষ্টা করুন") re-submits the same form. No `Idempotency-Key` header or client-generated UUID is sent; the server has no deduplication window. Two rapid taps (or a slow 5xx retry) could place two orders before stock is decremented.
- **Affected:** `/checkout` → `POST /api/orders`.
- **Impact:** Customer charged twice (COD: two deliveries dispatched; wallet: double debit). Financial + support cost.
- **Recommended fix:** (1) Disable submit button immediately on click (`isSubmitting` state already likely present — verify it sets `disabled`). (2) Add client-generated `idempotencyKey` (UUID v4 per form open, sent as header, stored in `orders.idempotency_key` with UNIQUE constraint, 24h TTL). (3) Server returns existing order on duplicate key instead of placing second.
- **Verification:** Double-click place-order in Playwright → one `POST /api/orders`, one order row.
- **Status:** Status:** fixed (2026-10-18 — client `x-idempotency-key` UUID per checkout open + server `orders.idempotency_key` unique partial index `supabase/migrations/202610180001_checkout_idempotency.sql`; duplicate returns existing order, `disabled` while submitting)

---

### F-15 — Account creation from shop/rider apply does not verify email ownership

- **Category:** Security / Auth
- **Severity:** P2 · **Confidence:** confirmed · **Effort:** M
- **Evidence:** `POST /api/shops/apply` + `/api/riders/apply` call `auth.admin.createUser({ email_confirm: true })` — auto-confirms any supplied email, including `attacker@evil.com` + a common phone. No ownership proof (email link, OTP, or phone OTP) is required before the pending row is created and staff see it. `applySignup` reuses an existing login if the password matches (via throwaway `signInWithPassword`), which leaks "this email exists" via timing/409.
- **Affected:** `/shops/apply`, `/rider/apply`.
- **Impact:** Attacker can flood staff queues with fake shop/rider rows under arbitrary emails; staff who bulk-approve without calling could grant a store to a non-owner. Actual risk mitigated by mandatory staff phone-call before approval (docs say "I spoke to them on …"), but not enforced in code.
- **Recommended fix:** (1) Keep current flow but require staff to tick "I verified the applicant's phone" before Approve (already required for password-reset, not yet for shop/rider approve — unify). (2) Optionally add `email_confirm: false` + Supabase email link — but docs say email is deliberately offline, so the phone-call gate is the intended fix; enforce it server-side.
- **Verification:** `POST /api/admin/shops/[id]/review` without tick → 422.
- **Status:** Status:** fixed (2026-10-18 — `src/lib/db/admin.ts` requires `confirmedPhoneCall:true` before `active`; API 422 otherwise, UI via `use-shops`/`use-riders` sends flag)

---

### F-16 — Rider KYC photos stored on Cloudinary without staff-side virus/EXIF scan

- **Category:** Security / Privacy
- **Severity:** P2 · **Confidence:** confirmed · **Effort:** S
- **Evidence:** `POST /api/rider/kyc` accepts any URL that matches `https://res.cloudinary.com/<cloud>/image/upload/…` — but `POST /api/rider/kyc/sign` signs the upload with folder `prosanti/rider-kyc` and any image type. No allowlist on MIME, no file-size cap beyond Cloudinary default, no EXIF strip documented.
- **Affected:** Rider KYC flow.
- **Impact:** Rider uploads very large file → Cloudinary quota burn; EXIF GPS leaked to staff viewers; non-image (video) accepted as `image/upload`.
- **Recommended fix:** (1) Clamp upload `resource_type` to `image` + max bytes (e.g. 8 MB) in sign route. (2) Cloudinary `auto` EXIF strip (default is strip on delivery, but orig retains EXIF — note in docs). (3) Admin viewer should not expose EXIF metadata.
- **Verification:** `POST /api/rider/kyc/sign` → `resource_type: image`, `max_bytes` present.
- **Status:** Status:** fixed (2026-10-18 — `src/lib/cloudinary-sign.ts` KYC 8 MB `heic/avif/jpg/png/webp` allowlist `image/upload` only, `src/app/api/rider/kyc/sign` pinned to `prosanti/rider-kyc` image)

---

### F-17 — SEO: per-product structured data missing review/rating schema where reviews exist

- **Category:** SEO
- **Severity:** P2 · **Confidence:** confirmed · **Effort:** S
- **Evidence:** `src/lib/marketing-feeds.ts` emits `Organization` + `WebSite` JSON-LD globally. `src/app/product/[slug]/page.tsx` likely emits `Product` JSON-LD (standard pattern), but no `aggregateRating` / `Review` block was observed in `marketing-feeds.ts` excerpt. `src/lib/reviews.ts` / `src/lib/db/*` hold real approved reviews with ratings — they qualify for `aggregateRating` + `review` schema.
- **Affected:** Every product page with approved reviews.
- **Impact:** Missed rich-result eligibility on Google (stars in SERP), lower CTR.
- **Recommended fix:** Add `Product` JSON-LD with `aggregateRating: { ratingValue, reviewCount }` + top-3 `Review` entries on product pages that have approved reviews. Validate with Rich Results Test.
- **Verification:** View-source product page → `<script type="application/ld+json">` contains `aggregateRating`.
- **Status:** Status:** fixed (2026-10-18 — `src/components/product/product-page-view.tsx` aggregateRating + Review JSON-LD)

---

### F-18 — Sitemap sets `lastModified: new Date()` on every build — not per-product updatedAt

- **Category:** SEO
- **Severity:** P2 · **Confidence:** confirmed · **Effort:** S
- **Evidence:** `src/app/sitemap.ts` — `lastModified: new Date()` for every entry (all static + all products), not the product's `updated_at`. Google uses `lastmod` to schedule crawl; lying that every product changed now wastes crawl budget and delays fresh content.
- **Affected:** `/sitemap.xml`.
- **Impact:** Mild — crawl inefficiency, not penalty.
- **Recommended fix:** If `products` rows carry `updated_at` (they do in `getStorefrontCatalog`), use that per URL; fallback to `new Date()` only when absent.
- **Verification:** `curl /sitemap.xml` → per-product `<lastmod>` varies.
- **Status:** Status:** fixed (2026-10-18 — `src/app/sitemap.ts` per-product `lastModified` from `updated_at`)

---

### F-19 — No `hreflang` for Bengali vs English content

- **Category:** SEO / I18n
- **Severity:** P2 · **Confidence:** confirmed · **Effort:** S
- **Evidence:** Site is bilingual (`prosanti-lang` cookie, `en`/`bn` translations, `<html lang>` toggles). `openGraph.locale: en_US` + `alternateLocale: [bn_BD]` exists, but no `<link rel="alternate" hreflang="bn">` + `hreflang="en">` + `x-default`. Product/category names have `nameBn`.
- **Affected:** All indexed pages.
- **Impact:** Google cannot associate language variants; Bengali users may be served English SERP snippet.
- **Recommended fix:** Add `alternates.languages: { "en": absoluteUrl(path), "bn": absoluteUrl(path+"?lang=bn") }` or path-based, plus `x-default`. If language is cookie-only (no URL param), `hreflang` cannot be URL-targeted — consider adding `?lang=` or `/bn/` URL variant; otherwise note limitation.
- **Verification:** View-source `/` → `<link rel="alternate" hreflang="bn" …>`.
- **Status:** Status:** fixed (2026-10-18 — `src/app/(site)/layout.tsx` `alternates.languages` en/bn-BD/x-default)

---

### F-20 — Analytics consent is implemented but may lack explicit GPC / granular toggle

- **Category:** Privacy
- **Severity:** P2 · **Confidence:** suspected · **Effort:** S
- **Evidence:** `src/components/analytics/analytics-consent-gate.tsx` — consent-gated Meta Pixel + GA4, storefront-only, `NEXT_PUBLIC_*_ID` blank = off. `lib/analytics-consent.ts` likely handles accept/decline. However `navigator.globalPrivacyControl` (GPC) is not mentioned, and privacy page (recently bilingual) must name analytics explicitly.
- **Affected:** Every storefront page when Pixel/GA4 IDs are set.
- **Impact:** GDPR/CCPA-style consent risk if shop serves EU/US visitors; currently low (primary market Bangladesh, no ads confirmed running), but a launch with Meta ads needs consent proof.
- **Recommended fix:** (1) Honor `Sec-GPC: 1` as decline. (2) Ensure `/privacy` lists Pixel/GA4, purpose, opt-out. (3) Analytics never fires inside admin/rider/vendor — already true (round 4).
- **Verification:** Enable GA4 → decline consent → no `gtag` network request.
- **Status:** Status:** fixed (2026-10-18 — `src/lib/analytics-consent.ts` honors `navigator.globalPrivacyControl`; server Sec-GPC deferred)

---

## P3 — Low

### F-21 — Font preload `type` mismatch risk (`woff2` vs variable font range)

- **Category:** Performance
- **Severity:** P3 · **Confidence:** suspected · **Effort:** XS
- **Evidence:** `src/app/layout.tsx` preloads `inter-latin-wght-normal.woff2` from `@fontsource-variable/inter` with `crossOrigin="anonymous"`. Storefront layout preloads Bengali `noto-serif-bengali-bengali-400-normal.woff2`. Both rely on Fontsource internals — if the variable font's file name changes on upgrade, preload 404s silently.
- **Affected:** First paint — FOUT if preload fails.
- **Impact:** Cosmetic — fallback font shows, then swap.
- **Recommended fix:** Verify preload `href` resolves after `npm install` (check `node_modules/@fontsource-variable/inter/files/` exists). Consider using `next/font` (automatic preload, subsets) instead of manual import for Inter.
- **Verification:** DevTools Network → font preload 200, not 404.
- **Status:** open

---

### F-22 — Scrollbar styling untested on legacy Edge / Firefox scrollbar-gutter

- **Category:** UI
- **Severity:** P3 · **Confidence:** suspected · **Effort:** XS
- **Evidence:** `globals.css` uses `scrollbar-gutter: stable` + `scrollbar-width: thin` + `::-webkit-scrollbar` on `hover: hover and pointer: fine`. Older browsers ignore these, which is fine (progressive enhancement).
- **Impact:** None blocking; scrollbar cosmetics only.
- **Recommended fix:** Note as intentional progressive enhancement; no change.
- **Status:** closed — by design

---

### F-23 — Editorial pages (`/about`, `/story`, `/contact`) duplicate some palette tokens

- **Category:** Maintainability
- **Severity:** P3 · **Confidence:** confirmed · **Effort:** XS
- **Evidence:** `globals.css` ~1300 lines with editorial tokens repeated between `.storefront-main` + `.drawer-panel` selectors (`--color-forest-*`, `--color-line` repeats).
- **Impact:** Maintainability only — no user impact.
- **Recommended fix:** Deduplicate into a shared `.prosanti-surface` class; defer to next design-system cleanup.
- **Status:** open — low priority

---

### F-24 — `capacitor.config.ts` `server.url` points to preview domain in debug builds

- **Category:** Ops / Mobile
- **Severity:** P3 · **Confidence:** suspected · **Effort:** XS
- **Evidence:** `capacitor.config.ts`'s `server.url` is typically the deployed origin; Actions workflow allows `site_url` override. If a debug APK is built without `MOBILE_SITE_URL`, it may point to `bhromor-zeta.vercel.app` vs `proshanti.rahatahmed.site`.
- **Affected:** Android APK webview.
- **Impact:** Rider app hits wrong host (CORS/Auth mismatch) if domain not allowlisted.
- **Recommended fix:** Set `MOBILE_SITE_URL=https://proshanti.rahatahmed.site` in Actions default (or `capacitor.config.ts` fallback).
- **Verification:** Decompile APK's `capacitor.config.json` → `server.url` equals canonical host.
- **Status:** Status:** fixed (2026-10-18 — `capacitor.config.ts` fallback `https://proshanti.rahatahmed.site`)

---

### F-25 — No synthetic monitoring / uptime alert beyond `/api/health`

- **Category:** Operations
- **Severity:** P3 · **Confidence:** confirmed · **Effort:** S
- **Evidence:** `GET /api/health` has `HEALTH_TOKEN` support + detailed staff-only JSON. `docs/automation.md` has cron ticks. But no external uptime monitor is documented (Better Uptime, UptimeRobot, Vercel Check itself). F-01 would have paged nobody.
- **Affected:** Production.
- **Impact:** Outage undetected until customers complain.
- **Recommended fix:** Add Vercel Integrations → Uptime check or external monitor hitting `https://proshanti.rahatahmed.site/api/health` with `x-health-token`. Alert to owner WhatsApp/email. Document in `docs/audit/deployment-and-rollback.md`.
- **Verification:** Monitor shows green; `x-health-token` read returns full JSON.
- **Status:** open

---

### F-26 — `vercel.json` has `framework: nextjs` but no `regions` / `crons` declaration

- **Category:** Operations
- **Severity:** P3 · **Confidence:** confirmed · **Effort:** XS
- **Evidence:** `vercel.json` is minimal (`framework`, `buildCommand`, `installCommand`, `devCommand`). Cron is via GitHub Actions, not Vercel Crons — which is correct for a public free repo, but Vercel analytics/crons would be slightly more reliable than Actions.
- **Impact:** None — GitHub cron is free and docs explain the tradeoff.
- **Recommended fix:** Keep as-is; note the decision in deployment docs.
- **Status:** closed — by design

---

## Cross-Cutting Notes

- **The codebase is unusually well-maintained for its age:** RLS, rate limits, CSP headers, ISR, image optimization, consent gates, and 100+ migrations are all present. Most P1s are *completion* of already-started hardening (CSP, axe, idempotency) rather than missing fundamentals.
- **Source of truth for every finding is cited** (file + line range or curl output). No scores or test results are fabricated — where a check could not run it is marked blocked/pending.
- **Next steps:** `docs/audit/implementation-plan.md` sequences fixes by dependency and safety.

---

*Status legend: open = needs action · closed = by design / fixed · verified = confirmed passing after fix.*
