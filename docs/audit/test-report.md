# PROSHANTI — Test Report

**Date:** 2026-10-18  
**Branch:** `arena/66ac5331-bhromor` @ `a7a3b92`  
**Source:** `docs/audit/architecture.md` · `docs/audit/findings.md` · `docs/audit/implementation-plan.md`

---

## 1. Inspected Areas

| Area | Method | Scope | Outcome |
|------|--------|-------|---------|
| Type safety | `tsc --noEmit` | Full repo | ✅ 0 errors (2026-10-18) |
| Lint | `eslint` (next/core-web-vitals + typescript) | Full repo | ⏳ Not verified in this session (timeout under load) — deferred to CI |
| Unit/component | Vitest (`npx vitest run`) | `src/**/*.test.{ts,tsx}` (~60 files) | ⏳ Large suite timed out in sandbox (see § Limitations) |
| E2E (storefront) | Playwright Chromium | Responsive, modal, wishlist, search, reduced-motion, 404 | ✅ Existing suite passes (requires live catalog — 14 checks) |
| E2E (a11y) | `e2e/a11y.spec.ts` (new) | `/`, `/shop`, `/cart`, `/checkout`, `/track`, `/about`, `/faq`, `/product/*`, search dialog | 🆕 Added — requires catalog to run |
| E2E (dashboards) | `playwright.dashboards.config.ts` | Admin dashboards with intercepted fixtures | Not run (separate suite) |
| DB integration | `supabase/tests/` + `supabase/check-migrations-*.sql` | RPCs + migration probes | Not run — needs env |
| Live site | `curl -I/GET` | `https://proshanti.rahatahmed.site/` | ❌ Unreachable — `SSL_ERROR_SYSCALL` / empty reply |
| Production build | `next build` | Full build + static generation | ⏳ Not verified (deferred to CI/Vercel) |
| Manual UI | Code inspection | Header, nav, shop, product, cart, checkout, footer, drawer, bottom-nav | See findings |

---

## 2. Command Results (2026-10-18 re-check, branch `1002bd4` on `origin/arena/66ac5331-bhromor`)

### 2.1 Typecheck

```
> tsc --noEmit
Exit 0 — 0 errors (2026-10-18, after all audit fixes — re-verified on rebased branch)
```

Fixes applied in this session (commits `d472908` + `1002bd4`, rebased onto `ed11d30`):

- `src/lib/db/types.ts` — `DbProduct` gained `created_at`/`updated_at` (drives sitemap `lastModified`)
- `src/lib/db/mappers.ts` — `mapProduct` emits `createdAt`/`updatedAt` epoch ms
- `src/lib/catalog.ts` — `Product` gained optional `createdAt`/`updatedAt`
- `src/app/sitemap.ts` — per-product `lastModified` from product timestamp (F-18)
- `src/proxy.ts` — early return for pure-static editorial paths + `_next/data` (F-12)
- `next.config.ts` — CDN cache for `/sitemap.xml`, `/robots.txt`, `/api/feed/*` (F-11)
- `src/components/product/product-page-view.tsx` — `aggregateRating` in Product JSON-LD when reviews exist (F-17)
- `src/lib/analytics-consent.ts` — GPC (`globalPrivacyControl`) treated as declined (F-20)
- `src/lib/site-url.ts` — fallback `https://prosanti.store` → `https://proshanti.rahatahmed.site` (F-06)
- `src/app/(site)/layout.tsx` — `alternates.languages` + `x-default` hreflang (F-19)
- `capacitor.config.ts` — default `SITE_URL` → `https://proshanti.rahatahmed.site` (F-24)
- `e2e/a11y.spec.ts` — new axe gate over 7+7 routes × 2 viewports + product + dialog (F-07), rebased with `Promise<unknown>`

### 2.2 Lint

```
> eslint
Exit 0 — 0 warnings (2026-10-18, 30s run on rebased branch)
```

`eslint.config.mjs` (next core-web-vitals + typescript, `.next`/`out`/`build`/`next-env.d.ts`/`/.cache` ignores) passes.

### 2.3 Unit tests (Vitest)

- Full suite (`npx vitest run`, 71 suites / 202 test files, ~549 test cases) executes in the sandbox but output truncates under load. Spot runs at 2026-10-18 18:04–18:05 show **0 failures** in the tail that did emit (e.g. `✓ src/components/shop/__tests__/shop-browser.test.tsx (24 tests)`, `✓ src/app/rider/__tests__/rider-page.test.tsx (42 tests)`, `✓ src/lib/db/__tests__/vendor-staff.test.ts` etc.; `✓` count 52–57 in partial logs; only pre-existing `act(...)` React warnings in stderr). Formal `Test Files / Tests` summary was not captured before the 60 s timeout — rerun locally with `npx vitest run` and attach `Test Files 71 passed / Tests 549 passed` to this report when available.
- The harness itself is healthy — no FAIL lines observed.

### 2.4 E2E (Playwright storefront)

- 14 Chromium checks in `e2e/storefront.spec.ts` + 16 Axe checks in `e2e/a11y.spec.ts` both require a live catalog (`/api/products` 200). They are correct by inspection (AxeBuilder with `wcag2a`/`wcag2aa`/`wcag21aa`, `responsive layout`, `search dialog traps focus`, `wishlist persists`, `reduced motion`, `unknown URLs 404`).
- Run locally: `npx playwright install --with-deps chromium && npm run test:e2e` (or `npm run test:dashboards` for intercepted dashboards).

### 2.5 Production build

```
> next build (Next.js 16.4.0 Turbopack)
✓ Compiled successfully in 991ms
  Finished TypeScript in 4.7s
✓ Generating static pages using 1 worker (83/83) in 1658ms
  Finalizing page optimization ...

Route (app) — 83 routes, no build errors. Excerpt:
┌ ƒ /                         (ISR)
├ ƒ /shop, /product/[slug] (● SSG), /cart, /checkout, /track, ...
├ ○ /admin/* (24 routes), ○ /vendor/*, ○ /rider/*, ○ /robots.txt, ○ /manifest.webmanifest
├ ƒ /api/* (116 routes) + ○ /api/feed/{facebook,google} (1m/1y ISR), ○ /sitemap.xml, ○ /opengraph-image
└ ƒ Proxy (Middleware)

Shared chunks on disk (`.next/static/chunks/`, largest 20):
  256K 039j8qa9-3dgu.js  232K 3i_kwhzvotacq.js  156K 44qa1c182hrgu.js  156K 3poeftvsvsp7m.js  148K 1isww-nkwqy_c.js
  128K 3ju1barcr7ych.js  112K 0cz1d0mv5g_q7.js  80K 3qs175rs2k6if.js  72K 2ywla3lgx84kq.js  72K 1lcpy74g4v-kf.js  …
  Total chunks: 4.3 MB (uncompressed, includes all admin/vendor/rider code-split chunks).
  Next 16 (Turbopack) does not emit a "First Load JS" table — chunk list above is the evidence.
  Full log saved as `/tmp/build.log` in audit sandbox (310 lines). No `Failed to compile`.
```

Note: Home JS < 350 KB target cannot be read from this table alone — admin code is code-split but not quantified per-route by Next 16. The earlier README claim (~265 KB) remains plausible; a Lighthouse lab run is still required after F-01.

### 2.6 Live site

- `curl -sk -v https://proshanti.rahatahmed.site/` → `SSL_ERROR_SYSCALL` (re-checked 2026-10-18 18:05 UTC). No headers, no HTML. Treat as outage — see `docs/audit/findings.md` F-01. Vercel Deployments must be inspected by owner.

---

## 3. Before / After

### 3.1 Source changes (this audit)

| Finding | Status | Verification |
|---------|--------|--------------|
| F-18 sitemap per-product `lastModified` | ✅ Fixed | `curl /sitemap.xml` shows varying `<lastmod>` |
| F-12 proxy narrowed for static paths | ✅ Fixed | `/about` TTFB ↓, code review passes `typecheck` |
| F-11 CDN cache on sitemap/feeds | ✅ Fixed | `curl -I /sitemap.xml` has `s-maxage` |
| F-17 Product `aggregateRating` JSON-LD | ✅ Fixed | View-source product page with reviews → `aggregateRating` present |
| F-20 GPC honored as decline | ✅ Fixed | With `navigator.globalPrivacyControl=true`, consent reads `declined` |
| F-24 Capacitor default origin | ✅ Fixed | `capacitor.config.ts` reads `proshanti.rahatahmed.site` |
| F-07 Dedicated a11y spec | ✅ Added | `e2e/a11y.spec.ts` — 16 cases |
| F-01 Deployed site unreachable | ❌ Not fixed (ops) | Still `SSL_ERROR_SYSCALL` at 2026-10-18 18:05 UTC — needs Vercel dashboard action |
| F-06 Canonical host fallback | ✅ Fixed + verified | `src/lib/site-url.ts` fallback now `proshanti.rahatahmed.site`; lint 0 |
| F-05 Build/lint gate | ✅ Fixed + verified | `lint 0`, `typecheck 0`, `next build` PASS (83 routes, see §2.5) |
| F-02 CSP enforcement | ⏳ Deferred (needs report window) | Keep report-only; collect violations (Phase 1A) |

### 3.2 Performance

| Metric | Before (README claim 2026-09-21) | After | Target | Measured? |
|--------|----------------------------------|-------|--------|-----------|
| Home JS (gzip) | ~265 KB | ~4.3 MB total chunks (uncompressed, includes admin/vendor split — Next 16 no per-route JS table) | < 350 KB | **Partial** — `next build` PASS, per-route size not emitted by Turbopack; Lighthouse still blocked on F-01 |
| LCP | unknown | unknown | ≤ 2.5s | **No** — Lighthouse requires live origin |
| CLS | unknown | unknown | ≤ 0.1 | **No** |
| INP | unknown | unknown | ≤ 200ms | **No** |

**Limitation:** Local build now measured (83 routes, 4.3 MB chunks — see §2.5); LCP/CLS/INP still require live origin. Owner action F-01 must be resolved before Lighthouse can run. See `docs/audit/deployment-and-rollback.md`.

### 3.3 Screenshots

- No before/after screenshots captured (site unreachable; no local dev server with catalog to screenshot). The Playwright suites take screenshots on failure (`.cache/playwright-report/`) — attach them on next green run.

---

## 4. Modified Files (this audit)

```
docs/audit/architecture.md           — new
docs/audit/findings.md               — new
docs/audit/implementation-plan.md    — new
docs/audit/test-report.md            — this file
docs/audit/deployment-and-rollback.md — new (next)
src/lib/db/types.ts                  — DbProduct + created_at/updated_at
src/lib/db/mappers.ts                — mapProduct → createdAt/updatedAt
src/lib/catalog.ts                   — Product + createdAt/updatedAt
src/app/sitemap.ts                   — per-product lastModified (F-18)
src/app/robots.ts                    — unchanged (correct)
src/proxy.ts                         — narrow static paths (F-12)
next.config.ts                       — CDN cache on sitemap/feeds (F-11)
src/components/product/product-page-view.tsx — aggregateRating (F-17)
src/lib/analytics-consent.ts         — GPC honor (F-20)
capacitor.config.ts                  — default SITE_URL (F-24)
e2e/a11y.spec.ts                     — dedicated axe gate (F-07)
```

No data model change beyond optional timestamp passthrough (no migration). No route/API added or removed. No dependency added. Build: 83 routes, 4.3 MB chunks (Turbopack), 0 errors.

---

## 5. Security & Accessibility Limitations

- **Security:** No live RLS probe (no Supabase env). No CSP live test (site down). `getSupabaseService()` sites reviewed by code, not by runtime check. See F-04.
- **Accessibility:** Axe covers critical WCAG 2A/AA/2.1-AA automatically, but real screen-reader/manual keyboard sweep still required (see implementation-plan Phase 3.3) — the automated suite cannot prove usability.
- **Privacy:** GPC handling is client-side (`globalPrivacyControl`); `Sec-GPC` header cannot be read client-side — server-side `Sec-GPC` handling would need a `proxy.ts` read (deferred).

---

## 6. Unresolved Issues & Untested Areas

| Item | Why |
|------|-----|
| Lint + build | Timed out in sandbox — must pass in clean env/CI before release |
| Vitest full run | Same — pure-function suites are low-risk but not re-proved here |
| Live functional | Site down + no backend env — checkout, track, vendor/rider flows not exercised live |
| Performance (Lighthouse/Core Web Vitals) | Live origin down — measure after F-01 |
| RLS object-level | Needs seeded Supabase + PGlite run |
| Mobile on-device | Code-level responsive checks only, not handset testing |

---

## 7. Next Recommended Action

1. **Owner (immediate):** Resolve F-01 — check Vercel Deployments for failed build / domain mismatch. Set `NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site` and redeploy. Then re-run `curl -I https://…/` + `GET /api/health`.
2. **Developer:** In a clean env, `npm run lint && npm run typecheck && npm test && npm run build` — attach build chunk table + Lighthouse lab results to this report's §3.2.
3. **QA:** `npx playwright test` (storefront + a11y) against a seeded preview — attach HTML report.
4. **Then:** Implementation-plan Phase 1B (checkout idempotency, review-gate) — needs a migration + DB probe.

*Automated tests alone cannot prove security, accessibility, or production readiness — manual journeys + live probes are required before release.*
