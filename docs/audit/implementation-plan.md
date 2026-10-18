# PROSHANTI — Implementation Plan

**Date:** 2026-10-18  
**Source:** `docs/audit/architecture.md` + `docs/audit/findings.md`  
**Branch:** `arena/66ac5331-bhromor`  
**Rule:** Independent, testable phases. Smallest maintainable change. Preserve routes/APIs/data models unless defect requires change.

---

## Principles

1. **P0 first.** F-01 (site down) blocks every other measurement — fix or document before optimizing.
2. **Safety over polish.** P1 security/correctness before P2 performance/SEO.
3. **One finding → one acceptance test.** No phase claims pass until its verification method (from `findings.md`) passes.
4. **Rollback is real.** Every phase lists rollback (git revert SHA / Vercel rollback). No destructive migration.
5. **No migration without `supabase/tests/` probe.** Where a migration is needed, the phase requires an ephemeral DB check.

---

## Phase 0 — Backup, Baseline, and Critical Safety

**Goal:** Site reachable + baseline numbers captured before any code change.

| # | Action | Finding | Files | Steps | Tests | Acceptance |
|---|--------|---------|-------|-------|-------|------------|
| 0.1 | **Restore deployed site** | F-01 | Vercel dashboard only | Check Deployments → last green, domain mapping `proshanti.rahatahmed.site → cname.vercel-dns.com`, env vars present, rebuild with cache off | `curl -I https://proshanti.rahatahmed.site/` 200; `GET /api/health` JSON `{ live: bool, checks: {...}, nextSteps: [] }` | F-01 closed or documented with owner action + rollback |
| 0.2 | **Pin canonical origin** | F-06 | Vercel env only | Set `NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site` (Production), redeploy | View-source `/` has `canonical` = correct host; `/sitemap.xml` entries use correct host | F-06 closed |
| 0.3 | **Record baseline** | F-05, F-09 | Local + live | `npm run typecheck` → 0 errors (already passed). Capture `npm run build` chunk table. Capture Lighthouse lab (desktop+mobile) once F-01 green: LCP/CLS/INP. Save to `docs/audit/test-report.md` § Baselines | Build log + Lighthouse JSON attached | Baselines documented |

**Dependencies:** Vercel dashboard access (owner).  
**Effort:** XS (ops) + S (measurement).  
**Rollback:** Vercel → Deployments → Promote previous green deployment.

---

## Phase 1 — Security Hardening (P1)

**Goal:** Close P1 security gaps without breaking storefront.

### 1A — CSP enforcement prep

| # | Action | Finding | Files | Steps | Tests | Acceptance |
|---|--------|---------|-------|-------|-------|------------|
| 1A.1 | **Collect CSP report-only violations for 1 week** | F-02 | `next.config.ts` | Keep `Content-Security-Policy-Report-Only` as-is; open live site in Chrome with Console → filter `CSP`. Visit `/`, `/shop`, `/product/*`, `/checkout`, `/live`, `/admin/*`. Record any `script-src`/`img-src`/`connect-src` violations. | No unknown hosts in violations after 1 week | Reports captured |
| 1A.2 | **Add nonce support (prep, not enforce yet)** | F-02 | `src/proxy.ts` or `src/app/layout.tsx` + `next.config.ts` | Generate per-request nonce via `crypto.randomUUID()` in proxy, inject into `Content-Security-Policy-Report-Only` as `nonce-{…}` and `x-nonce` header; `next/script` `nonce` prop. Keep storefront report-only until step 1A.1 clean. Verify admin (`/admin/*`) stays enforced. | `curl -I /admin` still has `content-security-policy:`; `curl -I /` still report-only | Nonce path ready for enforcement |
| 1A.3 | **Confirm rate-limit backend** | F-03 | Vercel env + `src/lib/distributed-rate-limit.ts` | Check `UPSTASH_REDIS_REST_URL/TOKEN` in Vercel Prod; if absent, set them (Upstash free tier). Document memory fallback as dev-only. | `GET /api/products` 20× fast → no 429 when Redis on; with Redis off, note logged fallback | F-03 closed |

**Phase 1A exit:** `docs/audit/SECURITY-REPORT-2026-10-14.md` updated with report-only log + nonce decision.

### 1B — Authorization & idempotency

| # | Action | Finding | Files | Steps | Tests | Acceptance |
|---|--------|---------|-------|-------|-------|------------|
| 1B.1 | **Service-role route audit** | F-04 | All `src/lib/db/*.ts` + `src/app/api/**/*.ts` | Enumerate every `getSupabaseService()` call. For each, assert: caller identity checked (`requireStaff`/`requireVendor`/`requireRider` or phone-gate), resource ownership checked (order → customer phone, shop → vendor row, rider → rider row). Add missing check or document as reviewed. | `supabase/tests/workflow-postgres.mjs` passes; add a `grep` checklist in `docs/audit/findings.md` appendix | F-04 closed after DB probe |
| 1B.2 | **Checkout idempotency** | F-14 | `src/app/api/orders/route.ts`, `src/components/checkout/*`, `supabase/migrations/*` (add `orders.idempotency_key` UNIQUE, 24h partial index) | Client: UUID per checkout open → `x-idempotency-key` header, button `disabled` while `isSubmitting`. Server: store key, return existing order on dup. | Playwright: double-click Place Order → one row | F-14 closed |
| 1B.3 | **Apply review gate** | F-15 | `src/app/api/admin/shops/[id]/review/route.ts`, `src/app/api/admin/riders/[id]/review/route.ts` + UI review-actions | Require `confirmedPhoneCall: true` boolean before Approve (parallel to reset-request flow). Server returns 422 if missing. | Approve without tick → 422; with tick → active | F-15 closed |
| 1B.4 | **KYC upload hardening** | F-16 | `src/app/api/rider/kyc/sign/route.ts` | Restrict `resource_type: image`, add `max_bytes: 8_000_000`, allowlist `jpg/png/webp/heic`. Document EXIF handling. | Large/video upload → 422 | F-16 closed |

**Dependencies:** Phase 0 green (live site). 1B.2 needs a migration (idempotency column) — apply via Supabase SQL editor, verify via `diagnose.sql`.  
**Effort:** M.  
**Rollback:** Migration: `ALTER TABLE orders DROP COLUMN idempotency_key;` (new column, no data loss). Code: revert commit.

---

## Phase 2 — Core Functionality & Broken Workflows

**Goal:** Checkout, tracking, vendor/rider flows are provably correct.

| # | Action | Finding | Files | Steps | Tests | Acceptance |
|---|--------|---------|-------|-------|-------|------------|
| 2.1 | **Build + lint gate** | F-05 | CI + local | Run `npm run lint` (fix any `eslint` findings — likely `any`, unused vars, a11y), `npm run build` (fix any `metadata` export or `use client` error), commit fixes | `npm run lint && npm run typecheck && npm test && npm run build` all pass locally + Vercel Deploy green | F-05 closed |
| 2.2 | **Checkout valid/invalid/persistence** | F-14 (functional) | `src/app/(site)/checkout/*`, `src/app/api/orders/*` | Manual + Playwright: valid address/coupon/slot → order `pending`; invalid phone/empty bag/expired coupon → field error; reload `/checkout` → form persisted via zone/coupon store | E2E `checkout.spec.ts` passes | Critical journey passes |
| 2.3 | **Track + live map** | functional | `src/app/(site)/track/*`, `src/app/api/track/*` | Phone-gate lookup: correct ID+phone → order + map; wrong phone → not found; realtime channel joins + polling fallback | Manual + e2e `track.spec.ts` | Tracking works |

**Dependencies:** Phase 1 (idempotency).  
**Effort:** S.  
**Rollback:** Git revert.

---

## Phase 3 — Mobile UX, Navigation, Forms, and Accessibility

**Goal:** Thumb-reach, keyboard, screen-reader usable on 360px–1440px.

| # | Action | Finding | Files | Steps | Tests | Acceptance |
|---|--------|---------|-------|-------|-------|------------|
| 3.1 | **Responsive audit** | UX | `header.tsx`, `bottom-nav.tsx`, `shop/*`, `product/*`, `checkout/*`, `bag-drawer.tsx` | Playwright at 360×800 + 768×1024 + 1280×900: header (all actions fit narrow screens), filter drawer (action visible while scrolling), size/color chips (44px), quantity steppers, no overflow/clipped text/overlapping elements | Screenshots at all widths, no visual defect | Layout OK |
| 3.2 | **Axe sweep** | F-07, F-08 | `e2e/a11y.spec.ts` (new) + `playwright.config.ts` | New spec: `AxeBuilder(page).analyze()` on `/`, `/shop`, `/product/[slug]`, `/cart`, `/checkout`, `/track` at 375px + 1280px; fail on `critical`/`serious` | `npx playwright test e2e/a11y.spec.ts` → 0 critical/serious | F-07 closed |
| 3.3 | **Keyboard sweep** | F-08 | `e2e/keyboard.spec.ts` (4 checks) | Tab/Shift-Tab/Esc/Enter on header, search panel, filter drawer, chips, checkout; focus-visible on header link + search + chips; no `inert` trap; chip ≥44px | ✅ `npx playwright test e2e/keyboard.spec.ts` (requires browser) | F-08 closed |
| 3.4 | **Reduced-motion snapshot** | F-08 | `e2e/reduced-motion.spec.ts` (2 checks) | `emulateMedia reducedMotion: reduce`: hero anim `none`, filter/product/gallery instant (≤10ms) | ✅ `npx playwright test e2e/reduced-motion.spec.ts` | Motion OK |

**Dependencies:** Phase 2 (functional correct).  
**Effort:** M.  
**Rollback:** Revert `e2e/a11y.spec.ts`; no prod code change unless fix applied.

---

## Phase 4 — Performance Optimization

**Goal:** LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms lab; no regression.

| # | Action | Finding | Files | Steps | Tests | Acceptance |
|---|--------|---------|-------|-------|-------|------------|
| 4.1 | **Bundle audit** | F-09 | `next build` + `.next/diagnostics/route-bundle-stats.json` | Capture `firstLoadUncompressedJsBytes`; `/` 940 KB → ~265 KB gz (≤350 KB), `/track` 1248 KB (Leaflet), home-admin overlap 10/20 chunks verified | ✅ Done — chunk table in test-report §2.5.1 | F-09 fixed |
| 4.2 | **Image sizes audit** | F-10 | 45 `next/image` usages audited | 0 fill without sizes; 8 fixed-size correct; priority on 2 cats +1 gallery verified; code inspection passes | ✅ Done — see test-report §2.5.2 | F-10 fixed |
| 4.3 | **Cache headers** | F-11 | `src/lib/public-cache.ts`, `src/app/api/products/route.ts`, `sitemap.ts`, `feed/*` | Add `cache-control: public, s-maxage=60, stale-while-revalidate=300` (catalog) / `s-maxage=3600` (feeds/sitemap) | `curl -I` shows hit header | F-11 closed |
| 4.4 | **Proxy matcher narrowing** | F-12 | `src/proxy.ts` | Exclude static editorial paths from `distributedRateLimit` + `getUser()` | `/about` TTFB ↓, no ratelimit header on static | F-12 closed |
| 4.5 | **Lighthouse** | F-09 | Live origin (after F-01) | Lighthouse CI (mobile + desktop) on `/`, `/shop`, `/product/*`, `/checkout`; record LCP/CLS/INP vs targets | LCP ≤2.5s, CLS ≤0.1, INP ≤200ms or documented gap | Perf documented |

**Dependencies:** Phase 3 (a11y stable — perf fixes can affect layout).  
**Effort:** M.  
**Rollback:** Revert commit; cache header is safe.

---

## Phase 5 — Design Consistency and Visual Polish

**Goal:** SEO, feed, and surface polish without behavior change.

| # | Action | Finding | Files | Steps | Tests | Acceptance |
|---|--------|---------|-------|-------|-------|------------|
| 5.1 | **SEO structured data** | F-17 | `src/lib/marketing-feeds.ts`, `src/app/(site)/product/[slug]/page.tsx` | Add `Product` JSON-LD with `aggregateRating` + `Review` where approved reviews exist | Rich Results Test passes | F-17 closed |
| 5.2 | **Sitemap freshness** | F-18 | `src/app/sitemap.ts`, `src/lib/db/storefront.ts` | Use `product.updated_at` for `lastModified`; fallback now | `/sitemap.xml` `<lastmod>` varies per product | F-18 closed |
| 5.3 | **hreflang** | F-19 | `src/app/(site)/layout.tsx` or per-page `generateMetadata` | Add `alternates.languages` if URL param exists; otherwise document cookie-only limitation | View-source has hreflang or documented limitation | F-19 closed/doc |
| 5.4 | **Privacy GPC** | F-20 | `src/lib/analytics-consent.ts`, `src/app/(site)/privacy/page.tsx` | Honor `Sec-GPC: 1` as decline; ensure privacy copy lists Pixel/GA4 explicitly | GPC header → no gtag firing | F-20 closed |
| 5.5 | **Android APK origin** | F-24 | `capacitor.config.ts` | Default `server.url` to `https://proshanti.rahatahmed.site` | APK config.json correct | F-24 closed |
| 5.6 | **Fonts / scrollbar** | F-21, F-22 | `src/app/layout.tsx`, `src/app/globals.css` | Verify preload URL exists post-install; note scrollbar-gutter as progressive enhancement | No 404 on font preload | F-21/22 closed |

**Dependencies:** Phases 3–4 green (no layout regressions).  
**Effort:** S.  
**Rollback:** Revert commits; no migration.

---

## Phase 6 — Regression Testing and Deployment Preparation

**Goal:** Ship readiness per Release Criteria.

| # | Action | Finding | Files | Steps | Tests | Acceptance |
|---|--------|---------|-------|-------|-------|------------|
| 6.1 | **Full gate** | all | all | `npm run lint && npm run typecheck && npm test && npm run build` in clean env; `npx playwright test` (storefront + a11y) against preview | All pass | Green |
| 6.2 | **Critical journeys (manual)** | release criteria | `/`, `/shop`, `/product/*`, `/cart`, `/checkout`, `/track`, `/admin/orders`, `/vendor`, `/rider` | Place order (COD), confirm → deliver, track with correct phone, vendor adds product, rider accepts offer, admin settles cash | All journeys pass | Pass |
| 6.3 | **Console/network sweep** | release criteria | browser DevTools | No unexplained console errors or failed `fetch` on tested routes | Clean | Pass |
| 6.4 | **Mobile + desktop** | release criteria | 375×800, 768×1024, 1280×900 | Layout works at each, touch targets ≥44px, no overflow | Screenshots | Pass |
| 6.5 | **Deployment doc** | F-25, F-26 | `docs/audit/deployment-and-rollback.md` | Write deploy steps + rollback (Vercel promote previous / `git revert`), required env checklist, health probe, uptime monitor setup | Doc complete | Done |
| 6.6 | **Test report** | all | `docs/audit/test-report.md` | Before/after perf, test counts, before/after screenshots, untested areas, limitations, next action | Report complete | Done |

**Dependencies:** Phases 0–5.  
**Effort:** S.  
**Rollback:** `docs/audit/deployment-and-rollback.md` procedure.

---

## Ordering Adjustment

The phases above are default order. Adjust if:

- F-01 is environmental (Vercel down) → Phase 0.1 must be resolved by owner before any other phase yields value; phases 1–5 proceed on local/stack review meanwhile.
- F-02 (CSP) requires a report-collection window — do not enforce in Phase 1A.2 until 1A.1 window closes; enforcement moves to a later patch if needed.
- A Phase 4 perf regression (e.g. CLS from proxy change) → fix in Phase 4, do not backport to Phase 3.

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Live site stays down through phases 1–5 | Phases 1B/2/3/4/5 are local-first (static analysis + PGlite), not live-dependent; mark gaps as blocked in test-report |
| Supabase migration missed (`bootstrap-fresh.sql` drift) | All phases require `diagnose.sql` / `/api/health` `nextSteps` check; `split:bootstrap` regeneration is out of scope here — document instead |
| A11y fix breaks checkout keyboard flow | Phase 3.3 keyboard sweep is the gate before Phase 4 perf work |
| CSP nonce breaks Next hydration | Keep storefront report-only until Phase 1A.1 window + manual QA on 3 pages |

---

*Next: Controlled fixes begin on `arena/66ac5331-bhromor` in priority order, with per-change explanation and diff inspection. Release blocked until all P0 closed and P1 explicitly dispositioned.*
