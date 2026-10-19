# PROSHANTI — Implementation Plan (Phase D)

**Date:** 2026-10-19  
**Branch:** `arena/d56529ee-bhromor`  
**Principle:** Smallest maintainable change per finding; reuse tokens/components; preserve routes/APIs/data-models unless defect. Evidence-based order (P1 → P2 → P3), dependencies respected.

---

## How this plan maps to findings

| Phase | Goal | Finding IDs | Gate |
|---|---|---|---|
| **E1 Backup, baseline & critical safety** | Backup + lint clean + env truth | P2-04, P2-07, P2-03 | lint 0 warnings, build green |
| **E2 Core functionality & broken workflows** | Confirm checkout→orders→track→rider loop; harden errors | P1-01 probe follow-up, P2-09, P2-02 | smoke order in staging; error reporting live |
| **E3 Mobile UX, nav, forms & a11y** | Header/nav/search focus, checkout/copy, axe pass | P2-06, P1-04, P1-04 infra | axe 0 violations on 9 states; manual keyboard pass |
| **E4 Performance optimization** | Measure, image priority, bundle budget, ISR tune | P1-03, P2-05, P2-08 | Lighthouse baseline file; no LCP regression |
| **E5 Design consistency & security polish** | Tokens, CSP enforcement staged, disclosure copy | P2-01, P3-02, P3-03 | report-only clean 7d → enforced in preview |
| **E6 Regression test & deploy prep** | Full gates + rollback doc + release criteria | All P1 closed/deferred, P2/P3 backlog | `test-report.md` + `deployment-and-rollback.md` signed |

Order may shift with evidence (e.g., P1-01 being infra can run parallel).

---

## Phase E1 — Backup, baseline & critical safety fixes

### E1.1 — Backup & baseline capture

| Item | Detail |
|---|---|
| **Finding** | — (prereq for all) |
| **Affected files** | `package.json`, `package-lock.json`, `src/**` (read-only at this step) |
| **Steps** | 1. `git status` clean (done 2026-10-19). 2. `npm ci` (done). 3. Capture `npm run lint` (3 warnings), `timeout 120 npm run typecheck` (timeout), `npm run build` (green 83 pages), `npm audit` (12 vulns) — all logged to `test-report.md`. 4. Tag baseline: `audit/baseline-2026-10-19` notes (no code tag needed; branch is baseline). |
| **Dependencies** | None |
| **Tests** | `npm test` log saved; `npm run build` stdout saved |
| **Acceptance** | Baseline files exist, branch pushed, `test-report.md` has exact commands + outputs |
| **Rollback** | `git reset --hard HEAD` on this branch; no prod deploy |

### E1.2 — Lint: remove unused vars

| Item | Detail |
|---|---|
| **Finding** | **P2-04** (3 warnings) |
| **Affected files** | `src/app/api/track/reschedule/route.ts:12–13`, `src/app/api/track/rider-location/route.ts:26` |
| **Steps** | 1. Open each file, confirm `WINDOW_MS`/`LIMIT` not referenced. 2. Delete `const WINDOW_MS = …` / `const LIMIT = …`. 3. Keep `distributedRateLimit` in `proxy.ts` as limiter — no re-add. |
| **Dependencies** | None |
| **Tests** | `npm run lint` → 0 errors, 0 warnings; `npm test src/app/api/track/__tests__/track-subroutes.test.ts` still green |
| **Acceptance** | `npm run lint` 0 warnings; diff limited to those lines |
| **Rollback** | `git restore src/app/api/track/...` |
| **Status** | ✅ **Done in this audit** (Phase E) — see diff in `test-report.md` |
| **Effort** | XS |

### E1.3 — Canonical host truth

| Item | Detail |
|---|---|
| **Finding** | P2-07 (fallback `prosanti.store` vs `proshanti.rahatahmed.site`) |
| **Affected files** | `src/lib/site-url.ts` (`siteBaseUrl()` fallback), `.env.example`, `vercel.json` docs |
| **Steps** | 1. Update fallback to `https://proshanti.rahatahmed.site` (or throw if neither env set, with friendly DX message). 2. Add `NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site` to `.env.example` commented example + `docs/vercel.md`. 3. Document in `deployment-and-rollback.md` that Vercel env must set it. |
| **Dependencies** | Owner must set Vercel env; fallback change is code |
| **Tests** | Unit: `site-url.test.ts` assert `siteBaseUrl()` fallback is `proshanti.rahatahmed.site`; E2E not needed |
| **Acceptance** | `sitemap.xml` + `robots.txt` + OG `url` point to `proshanti.rahatahmed.site` in staging build |
| **Rollback** | `git restore src/lib/site-url.ts .env.example` + revert Vercel env |
| **Effort** | XS |

### E1.4 — CI typecheck optimization

| Item | Detail |
|---|---|
| **Finding** | P2-03 (typecheck slow) |
| **Affected files** | `.github/workflows/ci.yml` |
| **Steps** | 1. Change job to `lint` + `build` parallel (build already typechecks). 2. Keep dedicated `typecheck` as optional `needs: build` or `tsc --noEmit --incremental` with cache. |
| **Dependencies** | None |
| **Tests** | CI still green on PR |
| **Acceptance** | `lint && build` completes <4 min |
| **Rollback** | Restore `ci.yml` |
| **Effort** | XS |

---

## Phase E2 — Core functionality & broken workflows

### E2.1 — Probe deployed site from second network (owner)

| **Finding** | P1-01 |
|---|---|
| **Steps** | Owner runs `curl -I https://proshanti.rahatahmed.site/` + SSLLabs scan; confirm TLS cert/domain mapping in Hostinger/Cloudflare → Vercel. Fix proxy/TLS mode, re-issue cert if expired. |
| **Affected** | Infra (DNS/Cloudflare/Vercel domain config) |
| **Tests** | `curl -I` → 200 + `hsts`; `sitemap.xml`/`robots.txt` serve; Lighthouse 3× (desktop+mobile) on `/`, `/shop`, `pdp`, `/checkout` |
| **Acceptance** | Site loads from 2 networks; owners sign off |
| **Rollback** | DNS revert |
| **Effort** | S (infra lookup) |
| **Note** | Out of sandbox scope — tracked, not coded here |

### E2.2 — Error reporting hookup

| **Finding** | P2-09 |
| **Affected files** | `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/rider/error.tsx`, `src/app/vendor/error.tsx`, new `src/instrumentation.ts`, `next.config.ts` (sourceMaps) |
| **Steps** | 1. Add lightweight sink (reuse `/api/events` or Sentry free tier). 2. In each `error.tsx` call `captureException(error)` after `console.error`, redacting PII. 3. Add `instrumentation.ts` to init client if using Sentry. 4. Gate behind env so local dev not noisy. |
| **Tests** | Unit: error boundary renders fallback; manual throw in `/admin` shows fallback + log in sink |
| **Acceptance** | Error in preview shows in dashboard within 1 min; PII redacted |
| **Rollback** | `git restore src/app/error.tsx src/instrumentation.ts` + disable DSN |
| **Effort** | M |

### E2.3 — Upstash shared rate limit enable

| **Finding** | P2-02 |
| **Affected** | Vercel env `UPSTASH_REDIS_REST_URL/TOKEN` |
| **Steps** | 1. Create Upstash free Redis (same region as Vercel). 2. Paste REST URL/TOKEN into Vercel → Settings → Env (preview+prod). 3. Monitor 429 rate via Vercel logs. |
| **Tests** | `curl -I https://…/api/account/login` 11×/15 min → 429 on 11th (cross-isolate) |
| **Acceptance** | 429 consistent |
| **Rollback** | Remove env; fallback to in-memory |
| **Effort** | S |

---

## Phase E3 — Mobile UX, navigation, forms & accessibility

### E3.1 — Checkout i18n consolidation

| **Finding** | P2-06 |
| **Affected files** | `src/components/checkout/*`, `src/lib/translations.ts`, `src/lib/bd-geo.ts` |
| **Steps** | 1. Move hard-coded Bangla strings in `checkout-view.tsx`/`checkout-errors.ts` into `translations.ts` keys (`checkout.*`). 2. Ensure `bnDigits` used via `lang === "bn"` branch only. 3. Add 2 E2E assertions (bn+en). |
| **Tests** | `npm test src/components/checkout/__tests__/checkout-*` + E2E checkout flow in both langs |
| **Acceptance** | No literal Bangla outside translation file; E2E green in both |
| **Rollback** | `git restore src/components/checkout/ src/lib/translations.ts` |
| **Effort** | M |

### E3.2 — Re-establish axe baseline

| **Finding** | P1-04 |
| **Affected files** | `.github/workflows/ci.yml` (`browser` job) |
| **Steps** | 1. Fix `ci.yml` `browser` job: remove `continue-on-error: true`, remove `if: github.event_name != 'pull_request'`. 2. Ensure `E2E_BASE_URL` points to seeded preview (document). 3. Run `npx playwright test --project chromium` locally; save HTML report. 4. Manual keyboard nav checklist (header, search dialog focus trap, checkout, cart drawer). |
| **Tests** | `e2e/storefront.spec.ts` + axe 0 violations; keyboard checklist signed |
| **Acceptance** | CI browser job green; 5 manual checks signed in `test-report.md` |
| **Rollback** | Restore `ci.yml` |
| **Effort** | S |

---

## Phase E4 — Performance optimization

### E4.1 — Lighthouse baseline (once P1-01 fixed)

| **Finding** | P1-03 |
| **Affected** | `docs/audit/performance-baseline-2026-10-xx.md` |
| **Steps** | 1. `npx lighthouse https://proshanti.rahatahmed.site/ --form-factor=mobile/desktop --output=json,html` ×3 on 4 routes. 2. Record LCP/INP/CLS, TTFB, bundle, image counts. Distinguish lab vs RUM. 3. Check `performance-baseline.md` into repo. |
| **Tests** | LHR files reproducible |
| **Acceptance** | File exists with 4 routes × 2 form factors + before/after plan |
| **Effort** | S |

### E4.2 — Image priority tuning

| **Finding** | P2-05 |
| **Affected files** | `src/app/(site)/(home)/page.tsx`, `src/components/home/*`, `src/components/product/product-card.tsx` |
| **Steps** | 1. `priority` on first hero LCP image (above-fold). 2. Keep below-fold `loading="lazy"`. 3. Verify `sizes` match `GRID_CARD_SIZES`/`RAIL_CARD_SIZES`. |
| **Tests** | Lighthouse LCP Δ; no visual shift |
| **Acceptance** | LCP ↓ without CLS ↑ |
| **Rollback** | `git restore src/app/(site)/(home)/page.tsx` |
| **Effort** | S |

### E4.3 — Bundle budget

| **Finding** | P2-08 |
| **Affected files** | `next.config.ts` (analyzer conditional), `.github/workflows/ci.yml` (artifact) |
| **Steps** | 1. `npm i -D @next/bundle-analyzer` (dev). 2. `ANALYZE=true next build` artifact to `docs/audit/bundle-*.html` (gitignored, linked in report). 3. Add `size-limit` budgets for `/shop`/`/checkout`. |
| **Tests** | Analyzer output; no chunk >250 kB gzip budget crossed |
| **Acceptance** | Bundle report checked in as PNG/HTML summary |
| **Effort** | S |

---

## Phase E5 — Design consistency & security polish

### E5.1 — CSP enforcement rollout

| **Finding** | P2-01 |
| **Affected files** | `next.config.ts` |
| **Steps** | 1. Week of `Report-Only` violations reviewed (console/report-uri). 2. Tighten `script-src` to `nonce-*` (Next `headers: {}` supports per-request nonce in 16.3+). 3. Preview first, then prod flip `Report-Only` → enforced. |
| **Tests** | CSP evaluator (cspscanner) + manual `/shop`/`/admin` smoke |
| **Acceptance** | 0 violations in preview for 7 d; prod enforced without breakage |
| **Rollback** | Flip header back to report-only |
| **Effort** | M |

### E5.2 — npm audit remediation

| **Finding** | P1-02 |
| **Affected files** | `package.json`, `package-lock.json` |
| **Steps** | 1. `npm audit fix` (non-breaking) commit alone. 2. Separate bump: `vitest` patch → override `tinypool` if upstream lag. 3. Full `npm run lint && typecheck && test && build` gate. |
| **Tests** | `npm audit` ≤4 moderate left; full suite green |
| **Acceptance** | `npm audit --omit=dev` 0 critical/high |
| **Rollback** | `git restore package-lock.json package.json` |
| **Effort** | M |

---

## Phase E6 — Regression testing & release

| **Finding** | All |
| **Affected** | `docs/audit/test-report.md`, `docs/audit/deployment-and-rollback.md` |
| **Steps** | 1. Full gate: `npm ci → lint → typecheck → test → build`. 2. Manual 5-route smoke (home, shop, product, cart→checkout, track). 3. Confirm release criteria (no P0, P1 fixed/deferred with sign-off, build green, no new console errors, mobile+desktop OK, a11y/privacy addressed, perf documented, no unintended data changes, rollback steps). 4. Tag `audit/release-2026-10-19`. |
| **Acceptance** | All criteria met; `deployment-and-rollback.md` updated |
| **Rollback** | Vercel redeploy previous; branch revert |
| **Effort** | S |

---

## Commit strategy (on `arena/d56529ee-bhromor`)

| Commit | Message | Files |
|---|---|---|
| E1.2 | `audit(E1.2): remove unused WINDOW_MS/LIMIT — lint 0 warnings` | 2 track routes |
| E1.3 | `audit(E1.3): set site canonical to proshanti.rahatahmed.site` | `lib/site-url.ts`, `.env.example`, `docs/vercel.md` |
| Docs | `audit: add architecture, findings, plan, test report, deploy guide` | `docs/audit/*` |
| E5.2 (if) | `audit(E5.2): npm audit fix (non-breaking)` | `package-lock.json` |

Small, revertable, no prod deploy from audit branch without owner.

---

## Risk register (cross-phase)

| Risk | Mitigation |
|---|---|
| Breaking majors in `npm audit fix --force` | Do non-breaking only; majors in separate proposal |
| CSP enforcement bricks checkout map/GTM embeds | Report-only soak 7 d; preview canary + `report-uri` |
| ISR `revalidate=60` stale prices after admin edit | `revalidateTag(CACHE_TAG_HOMEPAGE)` already wired; test price edit → 60 s stale window accepted |
| Capacitor maps need OSM tiles in WebView allowlist | Already in `img-src` CSP; keep in sync with `next.config.ts:remotePatterns` |

---

## Next recommended action

> **Owner:** Fix P1-01 probe (second network check + TLS/Proxy) and set `NEXT_PUBLIC_SITE_URL` → `https://proshanti.rahatahmed.site` in Vercel. Then we can run Lighthouse/perf + axe re-run. Developer: land E1.2+E1.3 (this branch), open PR, keep P1-02 majors for review — not auto-force.
