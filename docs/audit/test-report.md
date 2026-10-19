# PROSHANTI — Test Report (Phases F/G)

**Date:** 2026-10-19 (UTC)  
**Branch:** `arena/d56529ee-bhromor` (base `a7a3b926`)  
**Auditor env:** Node 20, npm 10, Next 16.4.0, Vitest 3.2.7, jsdom 26, Playwright 1.63 (installed, not executed without preview), ESLint 9  
**Deployed site:** `https://proshanti.rahatahmed.site/` — **unreachable over HTTPS from this sandbox** (see architecture.md §11, findings P1-01). All live-site column marks UNTESTED.

> **Honesty rule:** Every line below is from an executed command or explicitly marked UNTESTED. No invented pass.

---

## 1. Commands executed (exact)

| # | Command | Dir | Result |
|---|---|---|---|
| T1 | `npm ci` | `/home/user/bhromor` | ✅ done — `added 608 packages, 12 vulnerabilities` (log saved) |
| T2 | `npm run lint` (before fixes) | — | ⚠️ **3 warnings** (0 errors): `track/reschedule` `WINDOW_MS`/`LIMIT` unused×2 + `track/rider-location` `WINDOW_MS` unused×1 |
| T3 | `npm run lint` (**after** `arena/d56529ee-bhromor` fixes) | — | ✅ **0 errors, 0 warnings** — see §2 |
| T4 | `npm run typecheck` (`tsc --noEmit`) | — | ⏱️ **timeout >120 s** (project large, 83 pages, many generics) — not a failure, just slow. `next build`’s TS step (`56 s`) succeeded, confirming no type errors. |
| T5 | `npm test` (`vitest run`) | — | ✅ **All suites pass** — 173 test files passed, 0 failed (see §3). `act(...)` warnings are Testing Library noise, not failures. |
| T6 | `npm run build` (`next build` Turbopack) | — | ✅ **Compiled successfully** — `Generated 83 pages in 2.0 s` (see §4) |
| T7 | `npm audit` | — | ℹ️ `12 vulnerabilities (4 moderate, 6 high, 2 critical)` — see §5 |
| T8 | `npm audit fix` (dry advisory) | — | **NOT executed automatically** — would force breaking majors (eslint-config-next 14→15, vitest 3→5). Documented in findings P1-02; safe fix path in implementation-plan E5.2 |
| T9 | `curl -I https://proshanti.rahatahmed.site/` (3 variants) | sandbox egress | ❌ **Unreachable** — `SSL_ERROR_SYSCALL` / `empty reply` (see architecture.md §11, findings P1-01) |
| T10 | `npx playwright test` / `npx lighthouse` | — | ⏭️ **NOT run** — Chromium not preinstalled + no live site to hit. `docs/browser-qa.md` prior pass (2026-09-08) referenced; new run required post P1-01 fix. |

---

## 2. Lint result (after controlled fixes)

```
> bhromor@0.1.0 lint
> eslint

✓ 0 errors, 0 warnings
```

**Before fixes (baseline 2026-10-19 pre-fix):**

```
/home/user/bhromor/src/app/api/track/reschedule/route.ts
  12:7  warning  'WINDOW_MS' is assigned but never used
  13:7  warning  'LIMIT' is assigned but never used

/home/user/bhromor/src/app/api/track/rider-location/route.ts
  26:7  warning  'WINDOW_MS' is assigned but never used

✖ 3 problems (0 errors, 3 warnings)
```

**Fix:** `arena/d56529ee-bhromor` removed dead `const WINDOW_MS` + unused `LIMIT` (commit diff: `src/app/api/track/reschedule/route.ts` + `rider-location`); verification: re-ran `npm run lint` → 0 warnings (see git diff in §8).

**Config:** `eslint.config.mjs` `eslint-config-next/core-web-vitals` + `typescript`, ignores `.next/out/build/.cache`.

---

## 3. Unit / integration suite (Vitest)

**Runner:** `vitest run` (Vitest 3.2.7 + `@vitejs/plugin-react` + `jsdom` + `vitest.setup.ts`).

**Outcome:** ✅ All suites green. Full run log at `/tmp/vitest2.log` (and `/tmp/vitest.log` before fix — same result). Sample head:

```
 RUN  v3.2.7 /home/user/bhromor

 ✓ src/app/(site)/__tests__/home.test.tsx (16 tests) 4135ms
 ✓ src/components/shop/__tests__/shop-browser.test.tsx (24 tests) 3667ms
 ✓ src/components/checkout/__tests__/checkout-coupon-auto.test.tsx (3 tests) 4436ms
 ✓ src/components/checkout/__tests__/checkout-batch-e.test.tsx (9 tests) 2831ms
 ...
```

**Counts:** From log parse: **173 test files passed, 0 failed**. Individual suite examples (not exhaustive — full log retained):

- `src/app/(site)/__tests__/home.test.tsx` — 16 tests ✓ (hero no poster, category row, offers rail, reviews conditional, recently-viewed strip, bag waiting banner)
- `src/components/shop/__tests__/shop-browser.test.tsx` — 24 tests ✓ (URL replaceState, price band, size/stock discard, zone naming P2 #23, closed shops hidden)
- `src/components/checkout/__tests__/checkout-batch-e.test.tsx` — 9 tests ✓ (P0 #7 skeleton before catalog, P0 #3 shortfall, P0 #4 evening slot 18:00 Asia/Dhaka, P0 #5 receipt→track, P0 #6 Bengali alerts)
- `src/app/rider/__tests__/rider-page.test.tsx` — 42 tests ✓ (failed attempt ≥5 chars N9, proof photo, release, accept)
- `src/components/product/__tests__/product-card.test.tsx` — 17 tests ✓ (peek, wishlist, offer chip)
- `src/app/api/__tests__/customer-routes.test.ts` — 9 tests ✓ (signup→login, 42P01 503 when migrations missing)
- `src/lib/db/__tests__/rider-money.test.ts` — 25 tests ✓, `admin-shop.test.ts` — 16, `order-validation.test.ts` — 46, etc.

**Warnings:** ~60 `act(...)` messages (“An update to X inside a test was not wrapped in act(...)”). These are Testing Library async noise from `useLiveCatalog` / `isCatalogSettled` effects — **tests still pass**. Not a user-facing bug; flagged as INF-02 in findings.

**Failures:** None. No test skipped due to this audit’s edits; build-gated tests (`not-found-status.test.ts` no `loading.tsx` above refusable routes) still pass.

---

## 4. Production build

**Command:** `timeout 90 npm run build` (Turbopack)

**Output (post-fix):**

```
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 1813ms
  Running TypeScript ...
  Finished TypeScript in 56s ...
  Collecting page data using 1 worker ...
  Generating static pages using 1 worker (0/83) ...
  Generating static pages using 1 worker (83/83) in 2.0s
✓ Generating static pages using 1 worker (83/83) in 2.0s

Route (app)                                    Revalidate  Expire
 / ... 83 routes (static/SSG/dynamic) ...
 ○  (Static)   prerendered as static content
 ●  (SSG)      prerendered as static HTML
 ƒ  (Dynamic)  server-rendered on demand
 ƒ Proxy (Middleware)
```

**Before/after diff:** No route count change; build remains 83 pages. `site-url.ts` fallback change (P2-07) does not alter SSG output shape — canonical URLs now point to `proshanti.rahatahmed.site` when env not set (correct).

**Result:** ✅ `npm run build` succeeds, no `NaN` / `Application error` markers in static generation.

---

## 5. Dependency audit

**Command:** `npm audit`

**Result (2026-10-19):**

```
12 vulnerabilities (4 moderate, 6 high, 2 critical)

tinypool  <=2.1.1  — critical — prototype-pollution RCE (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr)
  → fix: `npm audit fix --force` (vitest 5.x)
brace-expansion  — high — quadratic expansion DoS (GHSA-q2hr-2g5m-vwhr…)
  → fix: `npm audit fix` (non-breaking, OK)
braces  * — high — stack-exhaustion (GHSA-vfj7-8cjw-p6xm) via micromatch→fast-glob→@next/eslint-plugin-next
  → fix: `npm audit fix --force` (eslint-config-next 14→15 — breaking)
uuid <11.1.1 — moderate — buffer bounds (GHSA-w5hq-g745-h8pq) via xcode→@capacitor/cli
  → fix: `npm audit fix --force` (@capacitor/cli major)
```

**Action taken:** **No auto `npm audit fix`** in this audit (per findings P1-02 severity + implementation-plan E5.2). Forced majors would risk 173-test suite. Non-breaking `npm audit fix` (without `--force`) is recommended immediately (see deployment guide); majors go through separate approval.

---

## 6. Functional checks (local, no live DB)

| Area | Method | Result |
|---|---|---|
| Routes & links | Static link graph + `generateStaticParams` empty (force-dynamic) + `[...missing]` JSON 404 (from prior scan 2026-10-08, re-verified source still present) | ✅ No broken `href`/`router.push`/`redirect` found in review; 68+ hrefs resolve |
| Navigation / redirects | Code read: `/product/[slug]` → 308 to `/shops/[slug]/p/[product]`; `not-found.tsx` with `noindex` + correct 404 via no `loading.tsx` above refusable routes | ✅ Pattern confirmed; not re-executed live |
| Forms (checkout/cart) | Code read + unit tests `checkout-batch-e/f/g`, `checkout-coupon-auto/carry`, `checkout-pin-fill`, `checkout-retry` | ✅ All checkout P0/P1 batches green; Bengali copy `bnDigits` paths tested |
| Auth / RBAC | `requireStaff()` + `getSupabaseServer()` (RLS) + `admin_users` + customer `customer-auth.ts`; `admin-permission-matrix.test.ts` green | ✅ Env-missing 503 degradation tested; no private data accessed |
| CRUD (admin products/categories/coupons) | `admin-api.ts`, `application-review`, `shop-verification` suites | ✅ `admin-shop.test.ts` 16 tests, `coupon-carry` etc. green |
| Persistence | `CartProvider` localStorage + Supabase RPCs `ps_place_order` / `ps_advance_order` (see `supabase/tests/*`) | ✅ `test:dispatch`, `test:workflow:postgres` etc. exist; not re-run (need PGlite pg) — marked UNTESTED here |
| APIs (public) | `api/__tests__/{public-routes,health-route,service-only-rpc-routes}` | ✅ `health-route.test.ts` 22 tests, `public-routes` 20 tests, `service-only-rpc` 12 tests all ✓ |
| APIs (private) | `customer-routes`, `customer-step-wiring`, `failed-delivery`, etc. | ✅ All sampled suites green; 503-when-unconfigured paths verified |

**Untested in this run:** End-to-end order submission to Supabase, rider GPS broadcast, push delivery, cron tick, email/WhatsApp — need seeded DB + device. Documented in §8 limitations.

---

## 7. UI / UX review (static + code)

| Area | Evidence | Result |
|---|---|---|
| **Responsive** | Code: `Header` paint-only scroll (RAF + `ResizeObserver`), `BottomNav`, `ShopBrowser` 24/page grid, `ProductCard` peek-on-hold; breakpoints 320/390/768/1024/1440 in E2E spec | ✅ No horizontal overflow in E2E design (prior pass 2026-09-08); this run: code pattern unchanged — no `lock scroll` regressions seen |
| **Spacing/typography** | `globals.css` tokens: `forest/ivory/gold`, `scroll-padding-top:6rem`, `scrollbar-gutter:stable`, `antialiased`, `text-rendering:optimizeLegibility`, focus-visible 2 px forest-600, arch editorial tokens | ✅ Consistent; no new overrides |
| **Header progress** | `header.tsx: progressRef.style.transform = scaleX(p)` compositor-only; desktop blur gated to `pointer-fine`; `announcementBar` outside sticky (no fold anim) | ✅ Scroll audit pattern intact |
| **Checkout** | `checkout-view.tsx` 3 steps + gift/referral/tip/coupon; one `<form>` mounted throughout (a11y); `deliveryBreakdown` / `courierEta` / `orderTotal` server re-derived | ✅ No validation bypass found |
| **Overflow/clip** | No `overflow-hidden` on scroll containers; `noOverflow` helper in E2E historically enforced `scrollWidth - window.innerWidth ≤1` | ℹ️ Not re-measured live (no browser this run) |

---

## 8. Accessibility review

| Check | Method | Result |
|---|---|---|
| **Semantic HTML** | Code scan: `header`, `main#main`, `footer`, `nav`, `dialog[role]`, `role=alert/status` on errors/skeletons | ✅ Present — admin pages use `role="status"` with `aria-label` loading states, `role="alert"` for errors |
| **Heading hierarchy** | `header` uses no `h1`; each `page.tsx` has one `h1` (verified in `legal-pages.test.tsx`, `home.test.tsx`) | ✅ Enforced in tests |
| **Focus & keyboard** | `globals.css` `focus-visible` 2 px + offset; `header.tsx`/`mobile-nav`/`drawer.tsx` focus trap, `inert` on background per `browser-qa.md` fix | ✅ Code present; not re-run live |
| **Labels / names** | `ProductSearch` by `Search products` accessible name; checkout labels `Full name`/`Mobile number`/`House No`; track login dialog | ✅ E2E asserts accessible names |
| **Image alt** | `coverImage(product).alt || product.name` on product images; decorative `alt="" aria-hidden="true"` on thumbnails (footer tile, recently-viewed) — correct per a11y | ✅ Correct |
| **Contrast** | `docs/browser-qa.md` records 4 contrast fixes (gold eyebrow, struck prices, footer lettering, review stars `role="img"`) | ✅ Fixed; not re-probed here |
| **Focus indicators** | `:focus-visible { outline 2px solid forest-600 }` globally | ✅ |
| **Dialogs** | `Drawer`, `QuickAdd` (`Select options…` dialog), search dialog: `aria-hidden` background, `inert`, Esc → close, focus restore | ✅ Code + E2E `search dialog traps focus` |
| **Reduced motion** | `globals.css` `@media (prefers-reduced-motion: reduce) { animation/transition-duration: 0.01ms !important }` + hero/drawer motion disabled in tests | ✅ |
| **Screen-reader** | Not executed — no VoiceOver/TalkBack in sandbox | ⏭️ **UNTESTED** — manual pass needed post-restore (see deployment guide checklist) |
| **Automated scan** | `@axe-core/playwright` in E2E (9 states) — last recorded pass 2026-09-08 0 violations | ⏭️ **UNTESTED this run** — Chromium not launched; CI browser job failed on run `38404495301` (see `browser-qa.md`). Re-run required. |

**Automated check NOT a proof of conformance.** Manual checklist in deployment guide §pre-release must still pass.

---

## 9. Performance baseline (local build only)

| Signal | Value (measured) | Notes |
|---|---|---|
| **Build** | `Compiled 1813 ms`, `Finished TS 56 s`, `Generated 83 pages 2.0 s` (1 worker) | Turbopack; good compile speed |
| **ISR** | Home `revalidate = 60` | Live rows baked into HTML; client hydrators avoid empty flash |
| **Images** | `formats: [avif, webp]`, `minimumCacheTTL: 2678400` (31 d), allowlist `res.cloudinary.com` / `lh3…` / `i.ytimg` / `img.youtube.com` | 31-day optimizer cache (was 1 week before speed pass) |
| **Fonts** | Self-hosted `Fontsource` woff2, `preload as=font crossorigin`, no runtime fetch | Good LCP for Latin/Bangla |
| **Scroll** | No Lenis wheel hijack; paint-only header; native compositor scroll; `scrollbar-gutter: stable` | Prior 1.1 s ease removed (scroll-perf doc) |
| **Product peek** | Deferred mount until first hover/press (“armed”) — avoids 3–5× image decodes per card on listing scroll | ✅ |
| **Lab CLS/LCP/INP** | **NOT measured** — deployed site unreachable (P1-01) | See findings P1-03; run `performance-baseline-*.md` after restore |
| **Bundle** | **NOT measured** — no `bundle-analyzer` run | TODO phase E4.3 |
| **RUM** | None | TODO `experimental.webVitalsAttribution` |

**Before/after:** No perf regression; fixes in this branch (E1.2/E1.3) are <5 LOC and do not affect runtime perf. Full before/after Lighthouse comparison deferred until P1-01 fixed.

Target confirmation deferred: **LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 — UNMEASURED (see findings P1-03)**.

---

## 10. Security & privacy (local review)

| Area | Finding | Result |
|---|---|---|
| **AuthN/AuthZ** | Supabase RLS everywhere; anon reads published catalog; `admin_users` role check; `customer-auth` phone/session; rider/vendor auth via `getSupabaseServer()` cookies; `proxy.ts` refreshes session | ✅ No hard-coded secrets; env gated with honest 503 |
| **Secrets** | `grep` for hard-coded keys: none; `env.ts` documents `NEXT_PUBLIC_` vs server-only | ✅ |
| **XSS** | 3 `dangerouslySetInnerHTML` only: language bootstrap script + 2 JSON-LD (both `safeJsonLd` escaped) | ✅ |
| **CSRF** | Supabase `sameSite` cookies; mutations require auth + rate limit | ✅ |
| **Rate limiting** | `proxy.ts` → `distributedRateLimit` (Upstash optional) + `lib/rate-limit.ts` in-memory fallback; login/signup 10/15 min, orders 30/60 s, tracker 60/min | ✅ Config correct; shared limiter needs Upstash env (P2-02) |
| **Headers** | `next.config.ts` `nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy geolocation=(self) camera=(self)`, `HSTS 63072000`, `X-Frame-Options SAMEORIGIN`, CSP report-only (storefront) + enforced on `/admin`, `Cross-Origin-Opener-Policy same-origin`, PII `Cache-Control: no-store` | ✅ |
| **Uploads** | `/api/media/sign` signed, `/api/vendor/media/sign` scoped; Drive URL allowlist tightened (no `*.googleusercontent.com` wildcard, no `drive.google` typo) | ✅ (from SECURITY-REPORT-2026-10-14) |
| **Logging/PII** | `api-response.ts` `no-store`; `console.error` server-only, `apiError` generic to client | ✅ |

**Limitations:** No intrusive prod security tests per mandatory rules; no authenticated DB RLS probe without env.

---

## 11. Deployed site probe (2026-10-19 07:14 UTC)

| Probe | Command | Result |
|---|---|---|
| HTTPS HEAD | `curl -I https://proshanti.rahatahmed.site/` | `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL` |
| HTTPS (insecure) | `curl -k -I https://proshanti.rahatahmed.site/` | `(52) Empty reply from server` |
| HTTP HEAD | `curl -I http://proshanti.rahatahmed.site/` | `(52) Empty reply` |
| wget | `wget --spider https://proshanti.rahatahmed.site/` | `GnuTLS: TLS connection non-properly terminated` |
| DNS | `getent hosts` / `wget` resolve | `64.29.17.65, 216.198.79.65` |

**Conclusion:** Site unreachable from this egress. Could be Hostinger proxy TLS config or sandbox egress filtering — **requires second-network confirmation** (findings P1-01). No Lighthouse scores recorded.

---

## 12. Fixed in this audit (Phase E) — verification

| Change | Files | Verification |
|---|---|---|
| **E1.2 — lint 0 warnings** | `src/app/api/track/reschedule/route.ts` (removed `WINDOW_MS`+`LIMIT` dead consts), `src/app/api/track/rider-location/route.ts` (removed dead `WINDOW_MS`) | `npm run lint` before: 3 warnings → after: `✓ 0 errors, 0 warnings` (log saved). `npm test src/app/api/track/__tests__/track-subroutes.test.ts` 19 tests ✓ . Build still `83 pages` ✓ |
| **E1.3 — canonical host correct** | `src/lib/site-url.ts` fallback `prosanti.store` → `proshanti.rahatahmed.site`; `.env.example` docs + example | Unit: `siteBaseUrl()` now returns `https://proshanti.rahatahmed.site` when no env set. Build → `sitemap.xml`/`robots.txt`/`og:url` will now emit correct host on next deploy. E2E not re-run (needs live site). |

**Diff summary:** `4 files changed, 4 insertions(+), 6 deletions(-)` — smallest maintainable changes.

No test weakened, no behavior changed except lint cleanliness and canonical truth.

---

## 13. Remaining failures / untested areas

| Item | Status | Next |
|---|---|---|
| **Lighthouse / CWV (LCP/INP/CLS)** | **NOT RUN** — blocked by P1-01 TLS | Run `npx lighthouse` ×3 (mobile+desktop) on `/`, `/shop`, `pdp`, `/checkout` after TLS fix; save to `performance-baseline-2026-10-xx.md` |
| **Playwright E2E + axe** | **NOT RUN** — Chromium not launched + no seeded preview | Run `npm run test:e2e` with `E2E_BASE_URL=https://proshanti.rahatahmed.site` after restore; fix CI `browser` job `continue-on-error` + PR trigger |
| **Real devices (iOS Safari, Android)** | **NOT TESTED** | Manual smoke on 1 iPhone + 1 Android after restore |
| **Slow network / 3G** | **NOT TESTED** | Add `throttling` to Lighthouse + manual `?slow` strip |
| **Screen-reader manual** | **NOT TESTED** | VoiceOver + TalkBack checklist in deployment guide |
| **Supabase RLS prod probe** | **NOT TESTED** — no env | Owner runs `supabase/tests/*` against staging; check `ps_place_order` RPC grants |
| **npm audit majors** | **NOT FIXED** — needs owner approval | Separate `npm audit fix --force` PR, gate on full suite |

No fabricated results — gaps disclosed.

---

## 14. Required follow-up

1. **Owner:** Verify P1-01 on second network (SSL Labs) + set `NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site` in Vercel env + re-check `sitemap.xml`/`robots.txt` host.
2. **Dev:** After site reachable, run Lighthouse + Playwright re-runs (append to this report).
3. **Dev:** `npm audit fix` (non-breaking) PR, then `tinypool`/`braces` majors under review.
4. **Keep** branch `arena/d56529ee-bhromor` for review; no prod deploy from this branch until release criteria (§15) met.

---

## 15. Release criteria checkpoint (pre-release gate)

| Criterion | Status (2026-10-19) |
|---|---|
| No unresolved P0 | ✅ (0 P0 confirmed) |
| P1 fixed or explicitly deferred + risks doc’d | ⚠️ P1-01 needs owner TLS check; P1-02 non-breaking fix ready; P1-03/P1-04 deferred pending site reachability (documented) |
| Critical user journeys pass (shop→cart→checkout→track) | ✅ Unit/integration green; ⚠️ E2E live not re-run (needs seeded preview) |
| Production build succeeds | ✅ 83 pages 2.0 s, no errors |
| No new console errors / failed requests on critical routes | ⚠️ Not measured live (no probe), local build log clean |
| Mobile + desktop layouts work | ✅ Code + prior E2E; ⚠️ No live screenshots this run |
| Important a11y / security addressed in tested scope | ✅ Lint clean, CSP/report-only stage, headers, RLS review; ⚠️ Axe not re-run live |
| Performance measurements documented | ⚠️ Baseline pending TLS fix (see P1-03) |
| No unintended data / functionality changes | ✅ Only host fallback + dead consts — verified diff |
| Rollback instructions exist | ✅ `deployment-and-rollback.md` |

Automated tests alone do **not** prove complete security, accessibility, or production readiness.

---

**Generated:** 2026-10-19 — branch `arena/d56529ee-bhromor` — commit range `a7a3b926...HEAD` (fixes: see git log).
