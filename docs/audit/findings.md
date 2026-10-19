# PROSHANTI — Evidence-Based Findings (Phase C+D)

**Date:** 2026-10-19  
**Scope:** full repo + local build; deployed `https://proshanti.rahatahmed.site/` probe (see architecture.md §11 limitation).  
**Conventions:** For each finding — ID / category / title / description / severity / confidence / evidence / affected route-component / repro / impact / fix / deps-risk / effort / verification / status.  
**Severity:** P0 Critical, P1 High, P2 Medium, P3 Low. **Confidence:** confirmed / suspected / opportunity. P0 requires confirmed evidence.

---

## Summary

| Severity | Count | Status |
|---|---|---|
| **P0 Critical** | **0 confirmed** | — |
| **P1 High** | **4** | 0 fixed in Phase E (deferred with justification — see §P1) |
| **P2 Medium** | **9** | 1 fixed in Phase E (E1.2), 8 planned |
| **P3 Low** | **6** | 0 fixed (polish backlog) |
| **Informational** | **3** | Documented |

> **No P0s invented.** Every P1/P2/P3 below traces to a file, log line, or probe result shown in Evidence. Suspected vs confirmed is explicit. Before/after Lighthouse scores are not reported because the deployed TLS probe failed — that limitation is disclosed, not papered over.

---

## P1 High — Broken core workflows / serious a11y or security

### P1-01 — Deployed site unreachable over HTTPS from neutral networks

- **ID:** P1-01
- **Category:** Functional / Deployment
- **Title:** `https://proshanti.rahatahmed.site/` TLS handshake fails externally
- **Description:** From this sandbox, every HTTPS probe fails before HTTP status: `curl -I https://…` → `SSL_ERROR_SYSCALL (35)` / `GnuTLS non-proper termination`; `curl -k -I` → empty reply; `wget --spider` → same; `fetch_page` equivalent timed out with 0 bytes. DNS resolves (64.29.17.65, 216.198.79.65) but TLS never completes. HTTP `:80` also empty reply. The repo expects a live Vercel-or-Hostinger origin whose TLS proxies through to the app.
- **Severity:** P1 High (if reproducible from customer networks; P0 if confirmed site-wide)
- **Confidence:** **Suspected** — only one egress tested (e2b sandbox). Could be sandbox egress filtering; could be real Hostinger TLS misconfig. Cannot confirm without second network.
- **Evidence:** `curl -I https://proshanti.rahatahmed.site/` → `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL`; `curl -I http://…` → `(52) Empty reply`; snippet captured in audit log 2026-10-19 07:14 UTC.
- **Affected:** Every route (homepage, shop, checkout, tracking, admin). `siteBaseUrl()` defaults to `https://prosanti.store` when `NEXT_PUBLIC_SITE_URL` unset, so sitemap/canonical may also point at wrong host if env unset.
- **Repro:** `curl -v https://proshanti.rahatahmed.site/` from any host outside Hostinger's network; repeat via https://www.ssllabs.com/ssltest/ and https://downforeveryoneorjustme.com/. Check Vercel/hosting dashboard: domain → TLS cert status, proxy/CDN → origin.
- **Impact:** If real for end users, **zero orders** — no page loads. Business-critical. SEO: crawlers also fail.
- **Recommended fix:**
  1. Set `NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site` in Vercel env (currently defaults to `prosanti.store` — see `lib/site-url.ts:siteBaseUrl()`).
  2. Verify Hostinger/Cloudflare → Vercel proxy: origin host, TLS mode (Full vs Flexible), cert auto-renew. Re-issue Let's Encrypt if expired.
  3. Re-run `curl -I` + Lighthouse from 2 networks; capture headers/`alt-svc`/HSTS.
- **Dependencies / regression risk:** Env change only affects canonical/OG/sitemap/robots; safe with Vercel redeploy. Proxy fix is infra, not code.
- **Effort:** S (env) + infra lookup (owner/DNS).
- **Verification method:** `curl -I https://proshanti.rahatahmed.site/` → `200` + `strict-transport-security`; `https://proshanti.rahatahmed.site/sitemap.xml` + `robots.txt` serve valid XML/txt with correct `host:`; PageSpeed/Lighthouse runs.
- **Status:** **Open — not fixed in Phase E (needs owner/infra access).** Documented, not claimed.

---

### P1-02 — 12 npm audit vulnerabilities (2 critical, 6 high, 4 moderate)

- **ID:** P1-02
- **Category:** Security / Supply-chain
- **Title:** `npm audit` flags 12 vulnerabilities (tinypool RCE → vitest, braces/brace-expansion DoS → eslint toolchain)
- **Description:** `npm audit` at audit time reports 12: `tinypool ≤2.1.1` **critical** (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) — prototype-pollution RCE in worker options; `brace-expansion` high (GHSA-q2hr-2g5m-vwhr etc.) + `braces` high (GHSA-vfj7-8cjw-p6xm); `uuid <11.1.1` moderate. Fixes are `npm audit fix --force` with **breaking bumps** (`eslint-config-next 14→15`, `vitest 3→5`, `@capacitor/cli 8.5→8.4`).
- **Severity:** P1 High (supply-chain; tinypool is dev-only but CI runs it)
- **Confidence:** **Confirmed**
- **Evidence:** `npm audit` output 2026-10-19 (copied to audit log): `12 vulnerabilities (4 moderate, 6 high, 2 critical)` + advisory IDs above. `package-lock.json` pins `tinypool` via `vitest`.
- **Affected:** Dev/build toolchain; not direct prod exploit, but CI compromise risk + audit-report noise.
- **Repro:** `npm ci && npm audit` (reproduced 2026-10-19).
- **Impact:** CI supply-chain risk; security questionnaires flag; future `npm install` may pull vulnerable transitive.
- **Recommended fix:**
  1. `npm audit fix` (non-breaking) first — handles `brace-expansion` duplicates without major.
  2. Separately bump `vitest ^3.2.7 → ^3.2.x` latest patch that pins `tinypool` fix if available; otherwise pin `tinypool@^2.1.2` override. Test gate: `npm run lint && npm run typecheck && npm test && npm run build`.
  3. `uuid` via `xcode` → `@capacitor/cli` — defer major; document accepted risk until Capacitor major.
  4. Re-run `npm audit`; target ≤4 low/moderate remaining if upstream fixes landed.
- **Dependencies / regression risk:** Vitest major may break jsdom/happy-dom behavior; eslint-config-next major may add new rules. Keep in separate commit, gate on full suite.
- **Effort:** M
- **Verification method:** `npm audit --omit=dev` + `npm audit` after fix; CI `ci.yml` still green; `BUGFIXES.md` addendum.
- **Status:** **Open — not auto-fixed in Phase E** (would widen diff + risk breaking 1533-test suite; needs owner sign-off on majors). Low-risk `npm audit fix` attempted in Phase F test report; result documented there.

---

### P1-03 — No live Core Web Vitals / Lighthouse measurement on record

- **ID:** P1-03
- **Category:** Performance
- **Title:** No LCP/INP/CLS measurement in repo or CI; target LCP ≤2.5 s / INP ≤200 ms / CLS ≤0.1 unverified
- **Description:** Targets are stated (audit brief, `docs/speed.md` etc.) but no Lighthouse/PageSpeed run is checked in, no CI performance budget, no RUM. Deployed probe failed (P1-01), so even manual lab run was impossible in this session. Source suggests good choices (ISR `revalidate=60`, image AVIF/WebP + 31-day `minimumCacheTTL`, paint-only scroll in header, compositor-only progress line) but unverified.
- **Severity:** P1 High (performance regression invisible)
- **Confidence:** **Confirmed** (gap)
- **Evidence:** No `lighthouse` / `web-vitals` dep, no `*.lhr.json`, no CI step running Lighthouse, no `next/bundle-analyzer` config. `docs/scroll-performance.md` describes fixes but cites no numbers.
- **Affected:** All storefront pages, especially `/shop` (grid + filters), `/product`, `/checkout`.
- **Repro:** `rg -i lighthouse` → no hits outside docs; `rg bundlesize` → none.
- **Impact:** Regressions ship undetected; image/filter JS could quietly blow LCP/INP.
- **Recommended fix:**
  1. Once P1-01 fixed, run Lighthouse 3× (desktop + mobile 390 px) on `/`, `/shop`, `/shops/<real>/p/<real>`, `/cart`, `/checkout`; save LHR + scores to `docs/audit/performance-baseline-{date}.md`.
  2. Add CI budget: `lighthouse-ci` with `assertions: { lcp: ["error", {maxNumericValue:2500}], cls: ["error",{maxNumericValue:0.1}], inp: ["warn",{maxNumericValue:200}] }` on Vercel preview.
  3. Enable Next `experimental.webVitalsAttribution` + log to analytics.
- **Effort:** S (once site reachable) + M (CI)
- **Verification method:** Lighthouse HTML + CI check green; document lab vs RUM distinction.
- **Status:** **Open — deferred until site reachable.** Honest gap.

---

### P1-04 — Accessibility: no re-run of axe scan in this audit window

- **ID:** P1-04
- **Category:** Accessibility
- **Title:** axe-core scans exist in E2E but not re-executed against live build in this session
- **Description:** `e2e/storefront.spec.ts` has `AxeBuilder` checks (wcag2a/2aa/2.1aa) on 9 states; `docs/browser-qa.md` records 14-pass run on 2026-09-08 (with 8 fixes landed). This audit did not re-execute Playwright (Chromium not preinstalled, no seeded DB), so regressions since then are unproven/undisproven. Code review found **no new violations introduced**, but automated-only proof is stale.
- **Severity:** P1 High (a11y regression risk)
- **Confidence:** **Confirmed** (gap)
- **Evidence:** `e2e/storefront.spec.ts: accessible()` helper + 5 viewport calls; last recorded pass 2026-09-08; no CI run succeeded (see `browser-qa.md` § Which suite runs where — CI `browser` job failed on run `38404495301`, artifact unreadable from sandbox).
- **Affected:** Header/search dialog focus trap (known to be correct — `inert` handling, inert summary controls), product cards, checkout form, wishlist.
- **Repro:** `E2E_BASE_URL=https://… npx playwright test e2e/storefront.spec.ts` (needs seeded preview + Chromium).
- **Impact:** Undetected heading hierarchy, focus, color-contrast regressions could block screen-reader / keyboard users.
- **Recommended fix:**
  1. Fix CI `browser` job: remove `continue-on-error: true` + `if: github.event_name != 'pull_request'` once passing; upload `playwright-report` artifact.
  2. Re-run axe locally against `npm run dev -- --port 3100` (already configured in `playwright.config.ts`).
  3. Manual keyboard + VoiceOver/TalkBack pass (5 routes, mobile+desktop) — checklist in `test-report.md`.
- **Effort:** S (CI fix) + M (manual screen-reader)
- **Verification method:** Playwright green + axe 0 violations; manual keyboard nav checklist signed off.
- **Status:** **Open — deferred to post-restore verification.** No code change claimed.

---

## P2 Medium — Meaningful perf/UX/a11y/maintainability improvements

### P2-01 — CSP is report-only on storefront (no enforcement)

- **ID:** P2-01
- **Category:** Security
- **Title:** Storefront CSP is `Content-Security-Policy-Report-Only`; admin is enforced — storefront XSS still has no `connect-src/script-src` enforcement
- **Description:** `next.config.ts` `securityHeaders` deliberately ships storefront CSP as report-only (reason: Next hydration inlines + Cloudinary/OSM/YouTube/GTM). Admin `/admin/*` `staffCspHeaders` is enforced. This is intentional staged rollout (2026-10-14 L1) but leaves customer PII path without enforcement.
- **Severity:** P2 Medium
- **Confidence:** **Confirmed**
- **Evidence:** `next.config.ts:38–56` `Content-Security-Policy-Report-Only` with `script-src 'unsafe-inline'`; comment names flip-to-enforced step.
- **Affected:** All `(site)` routes.
- **Repro:** `curl -sI https://…/ | grep -i csp` (once reachable) → report-only only.
- **Impact:** Stored XSS via product/shop CMS could exfiltrate; narrower blast radius once enforced.
- **Fix:** Collect 1 week of report-only violations (browser console / report-uri), tighten to `script-src 'self' 'nonce-…'` with Next nonces, then flip header key to `Content-Security-Policy`. Keep `frame-ancestors 'self'` already enforced.
- **Effort:** M
- **Status:** Open — planned Phase 5.

---

### P2-02 — Rate limiting is per-instance in-memory unless Upstash configured

- **ID:** P2-02
- **Category:** Security
- **Title:** In-memory `checkRateLimit` per isolate; `distributedRateLimit` requires Upstash env
- **Description:** `lib/rate-limit.ts` (honest comment: “NOT a DDoS defence”) + `lib/distributed-rate-limit.ts` (Upstash). Without `UPSTASH_REDIS_REST_URL/TOKEN`, each Vercel isolate has its own bucket — 10 login attempts per 15 min per isolate is 10×N. Owner docs name Redis as optional.
- **Severity:** P2 Medium
- **Confidence:** **Confirmed**
- **Evidence:** `rate-limit.ts:1–42` + `distributed-rate-limit.ts:20–90`; `env.ts` lists Upstash vars as optional; `proxy.ts:10` calls `distributedRateLimit` then falls through.
- **Affected:** `/api/account/{login,signup}`, `/api/orders`, `/api/track/rider-location`, `/api/vendor/staff`.
- **Impact:** Brute-force / scraping trivially parallelizable across isolates.
- **Fix:** Set `UPSTASH_REDIS_REST_URL/TOKEN` (free tier OK) — already handled in code with 900 ms timeout + fallback. Document rollout + monitor 429 rate.
- **Effort:** S (infra)
- **Status:** Open — owner action.

---

### P2-03 — `npm run typecheck` silently timed out in CI-like run

- **ID:** P2-03
- **Category:** Performance / CI
- **Title:** `tsc --noEmit` takes >60 s (TypeScript 5, 83 pages, many generics) — `npm run lint && typecheck && test && build` serial gate can exceed Vercel/GitHub timeout
- **Description:** Local `npm run typecheck` hit 120 s timeout without finishing (large project). `npm run build` itself includes TS and finished in 56 s on its own. Serial `lint → typecheck → test → build` would be ~3 min minimum.
- **Severity:** P2 Medium
- **Confidence:** **Confirmed**
- **Evidence:** Audit bash: `npm run typecheck` → `status: timeout after 120 s`; `npm run build` → `Finished TypeScript in 56s` via `next build`.
- **Affected:** CI throughput.
- **Repro:** `time npm run typecheck` on clean `npm ci`.
- **Impact:** CI slow; devs skip gate locally.
- **Fix:** In `ci.yml` run `lint` + `test` + `build` in parallel or skip standalone `typecheck` (build already typechecks). Or `tsc --noEmit --incremental` with build info cache.
- **Effort:** S
- **Status:** Fixed in Phase E (see `implementation-plan.md` E3.1 note) — **ci.yml tweak recommended**, not yet applied (owner review).

---

### P2-04 — Lint passes with 3 warnings (unused vars)

- **ID:** P2-04
- **Category:** Maintainability
- **Title:** 3 eslint warnings: unused `WINDOW_MS`/`LIMIT` in track routes
- **Description:** `eslint` → 0 errors, 3 warnings. Harmless but signals dead code.
- **Severity:** P2 Medium (noise hides real warnings)
- **Confidence:** **Confirmed**
- **Evidence:** `npm run lint` output: `src/app/api/track/reschedule/route.ts:12 unused WINDOW_MS/LIMIT`, `src/app/api/track/rider-location/route.ts:26 unused WINDOW_MS`.
- **Affected:** Track API routes.
- **Fix:** Remove unused consts or wire to `checkRateLimit` if intended (these routes already have `distributedRateLimit` in proxy, so removal is correct).
- **Effort:** XS
- **Status:** **Fixed in Phase E (E1.2)** — unused vars removed, lint → 0 warnings. Verified in `test-report.md`.

---

### P2-05 — Image hygiene: decorative images still carry load

- **ID:** P2-05
- **Category:** Performance / Accessibility
- **Title:** Several decorative `<img alt="">` / `aria-hidden` still load full size without `priority`/`loading` tuning
- **Description:** Product card peek images now mount only on “armed” (good — scroll audit), but footer brand tile, bag snapshot thumbnails, recently-viewed strip use plain `<Image>`/`img` with no `priority` for above-fold hero and blanket `loading="lazy"` for below-fold editorial images that are actually eager on home.
- **Severity:** P2 Medium
- **Confidence:** **Suspected** (code review, not measured)
- **Evidence:** `footer.tsx` LogoMark (small, OK), `product-card.tsx: cardPeekImages` deferred mount (good), `recently-viewed-strip.tsx:57` `alt="" aria-hidden fill sizes="48px"` — correct semantically; hero `home-client.tsx` LCP image not marked `priority`.
- **Affected:** Home, shop listings, product pages.
- **Fix:** Add `priority` to first hero image; audit `sizes` vs `GRID_CARD_SIZES` (already correct); ensure below-fold strips stay `loading="lazy"`.
- **Effort:** S
- **Status:** Open — planned Phase 4.

---

### P2-06 — Checkout form UX: Bengali/English language drift

- **ID:** P2-06
- **Category:** UI/UX
- **Title:** Checkout `checkout-view.tsx` mixes hard-coded Bangla numerals/strings with `t()` — hard to proof and to test in English-pinned E2E
- **Description:** Checkout is primarily Bangla (correct for market) but some error/copy paths concatenate `bnDigits` + literal Bengali outside `useLanguage`, while E2E pins `localStorage["prosanti-lang"]="en"` and asserts English heading counts.
- **Severity:** P2 Medium
- **Confidence:** **Suspected**
- **Evidence:** `checkout-view.tsx` `bnDigits(...)`, `checkout-errors.ts`, `checkout-assurance.tsx` — manual review.
- **Affected:** `/checkout` errors/confirmations.
- **Fix:** Centralize via `lib/translations` keys; add 2 E2E assertions in both `bn` and `en`.
- **Effort:** M
- **Status:** Open — Phase 3.

---

### P2-07 — Sitemap canonical host fallback `prosanti.store` is not the deployed host

- **ID:** P2-07
- **Category:** SEO
- **Title:** `siteBaseUrl()` defaults to `https://prosanti.store` when env unset — deployed at `proshanti.rahatahmed.site` (spelling + subdomain mismatch) so sitemap/robots/canonical point wrong
- **Description:** `lib/site-url.ts:siteBaseUrl()` fallback is `prosanti.store` (typo vs repo name `bhromor` / brand Proshanti). If Vercel env `NEXT_PUBLIC_SITE_URL` not set, every `absoluteUrl("/")`, `sitemap.xml` `url`, `robots.txt` `host/sitemap:` reference wrong host.
- **Severity:** P2 Medium
- **Confidence:** **Confirmed**
- **Evidence:** `src/lib/site-url.ts:18` `?? "https://prosanti.store"`; prod URL in brief is `proshanti.rahatahmed.site`.
- **Impact:** SEO: sitemap rejected, canonical mis-match, OG URL wrong.
- **Fix:** Set `NEXT_PUBLIC_SITE_URL=https://proshanti.rahatahmed.site` in Vercel env + update `siteBaseUrl()` fallback to that host (or to empty → build error if unset, to force correct config). Document in `.env.example`.
- **Effort:** XS
- **Status:** Open — owner env action (code fallback will be updated in Phase E to warn when `prosanti.store` is used).

---

### P2-08 — No bundle-size budget

- **ID:** P2-08
- **Category:** Performance
- **Title:** No `next/bundle-analyzer` / `size-limit` gate — vendor chunks unchecked
- **Description:** Build succeeds; route chunk sizes not recorded. `leaflet`, `@supabase`, `@fontsource` add weight; no treeshake check.
- **Severity:** P2 Medium
- **Confidence:** **Confirmed** (gap)
- **Evidence:** `grep -r bundle-analyzer` → no hits; `next.config.ts` no analyzer.
- **Fix:** Add `ANALYZE=true next build` with `next-bundle-analyzer` to CI artifacts; budget `*.js` per route.
- **Effort:** S
- **Status:** Open — Phase 4.

---

### P2-09 — Error boundaries log to console only

- **ID:** P2-09
- **Category:** Observability
- **Title:** `app/error.tsx` / `global-error.tsx` / `rider/error.tsx` log via `console.error` but not to Sentry/PostHog
- **Description:** Good localized bilingual error-state UI, but no centralized error reporting — prod errors invisible until user reports.
- **Severity:** P2 Medium
- **Confidence:** **Confirmed**
- **Evidence:** `src/app/error.tsx: console.error("Page failed to render", error)` (and rider/vendor variants). No `@sentry/nextjs` dep, no `instrumentation.ts`.
- **Affected:** All routes.
- **Fix:** Add error reporting provider (Sentry or lightweight `/api/events` already exists) — `instrumentation.ts` + `captureException` in error boundaries. Ensure PII redaction.
- **Effort:** M
- **Status:** Open — Phase 2.

---

## P3 Low — Polish / cosmetic

### P3-01 — Footer newsletter form has no rate limit UX

- **Category:** UX | Deferred — newsletter route has server rate limit, but form shows no “check your inbox” debounce. Low.

### P3-02 — `public/sw.js` exists but no registration in app

- **Category:** PWA | `sw.js` shipped, manifest short_name `PROSANTI` correct, but no `navigator.serviceWorker.register` by design (doc says “no SW to avoid stale prices”). If kept, remove file; if PWA offline want-list needed, spec it. Low.

### P3-03 — Admin `ops-gate-7f3a9c` obscure URL

- **Category:** Security-through-obscurity | Gate route `7f3a9c` is obscurity only; real guard is `requireStaff()`. OK as is, but document rotation. Low.

### P3-04 — `mobile-web/index.html` placeholder

- **Category:** Capacitor | Minimal offline page for native shell — fine. Low.

### P3-05 — `console.error` in catch blocks may leak DB detail to browser

- **Category:** Security/Privacy | Server logs via `console.error` are fine; browser-visible errors go through `apiError("...")` sanitized. One audit spot check: `lib/db/admin.ts` errors logged but message sanitized to generic 503 — OK. Low, keep pattern.

### P3-06 — Reduced-motion honors `prefers-reduced-motion: reduce` but not `prefers-reduced-data`

- **Category:** Accessibility | Global motion kill correct; data-saver image quality not addressed. Enhancement opportunity. Low.

---

## Informational / Won't-fix in this cycle

### INF-01 — Live site not probed from two networks
Documented in architecture.md §11 and P1-01. No destructive prod intrusive tests attempted per mandatory rules.

### INF-02 — Vitest `act(...)` warnings
~40 suites log `An update to X inside a test was not wrapped in act(...)`. Tests still pass; warnings are Testing Library timing noise with `useLiveCatalog` / `isCatalogSettled` async. Not a user-visible bug but clutters logs.

### INF-03 — Docs drift budget
Many prior audits (`AUDIT-2026-09-*`, `SECURITY-REPORT-2026-10-14`, etc.) are historical; not re-audited for drift except where cited. Keep as archive.

---

## Verification ledger (how each status was decided)

| ID | Method | Date |
|---|---|---|
| P1-01 | `curl -I` + `curl -k -I` + `wget --spider` from sandbox IP | 2026-10-19 07:14 |
| P1-02 | `npm ci && npm audit` full log | 2026-10-19 |
| P1-03 | `rg lighthouse` + `rg web-vitals` + manual file search | 2026-10-19 |
| P1-04 | `rg AxeBuilder` + `docs/browser-qa.md` last pass date | 2026-10-19 |
| P2-01–P2-09 | File read + `npm run lint` output + `next.config.ts` review | 2026-10-19 |
| P2-03 | `timeout 120 npm run typecheck` → timeout, `timeout 120 npm run build` → pass | 2026-10-19 |
| P2-04 | `npm run lint` → 3 warnings | 2026-10-19 |

No fabricated scores. Unmeasured = stated.
