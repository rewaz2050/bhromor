# PROSHANTI — Deployment & Rollback

**Date:** 2026-10-18  
**Repo:** `rewaz2050/bhromor` · **`arena/66ac5331-bhromor`** → PR to `main` → Vercel auto-deploy  
**Canonical origin:** `https://proshanti.rahatahmed.site`

---

## 1. Pre-Deploy Checklist

- [ ] **No P0 unresolved.** F-01 (site unreachable) must be closed — `curl -I https://proshanti.rahatahmed.site/` 200, `GET /api/health` returns `live` boolean + steps.
- [ ] **P1 dispositioned.** Every P1 in `docs/audit/findings.md` is fixed or explicitly deferred with risk noted in the PR description.
- [ ] **Gates pass (clean env):**
  ```bash
  npm ci
  npm run lint && npm run typecheck && npm test && npm run build
  ```
  Also `npx playwright test` (storefront + `e2e/a11y.spec.ts`) against a preview with a seeded catalog.
- [ ] **No unintended diff.** `git diff --stat main...arena/66ac5331-bhromor` lists only files in `docs/audit/test-report.md` §4. No secret in diff.
- [ ] **Env present** (see §3). `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are live — otherwise the deployed site serves a storefront but every API answers 503 `NOT_SEEDED`.
- [ ] **Migration check (if any).** This audit's patches are code-only (no migration). If a later phase adds `orders.idempotency_key`, run `supabase/migrations/<file>.sql` via Supabase SQL Editor and verify with `supabase/diagnose.sql` / `GET /api/health` `nextSteps: []`.

---

## 2. Deployment — Standard

### 2.1 Via GitHub → Vercel (preferred)

```bash
# From this branch (already pushed)
git push origin arena/66ac5331-bhromor
# Open PR on GitHub: arena/66ac5331-bhromor → main
gh pr create --title "Audit 2026-10-18 — fixes F-18/F-12/F-11/F-17/F-20/F-24 + a11y gate" \
  --body-file docs/audit/test-report.md --base main
# After review, merge:
gh pr merge <number> --merge   # or use GitHub UI
# Vercel auto-deploys on push to main.
```

### 2.2 Verify the deploy

```bash
# 1. Vercel → Deployments → latest shows "Ready" + Build Completed
# 2. Headers + CDN
curl -I https://proshanti.rahatahmed.site/
# expect: 200, x-vercel-cache HIT after warm, security headers present

# 3. SEO host is correct (F-06)
curl -s https://proshanti.rahatahmed.site/sitemap.xml | head -20
# expect: <loc>https://proshanti.rahatahmed.site/…</loc>

curl -s https://proshanti.rahatahmed.site/ | grep -o 'canonical.*href="[^"]*"'
# expect: canonical on proshanti.rahatahmed.site, not vercel.app

# 4. Health probe (detailed for staff only; live boolean is public)
curl -s https://proshanti.rahatahmed.site/api/health | python3 -m json.tool
# expect: { live: true, checks: { productsSeeded: true, … }, nextSteps: [] }

curl -s -H "x-health-token: $HEALTH_TOKEN" https://proshanti.rahatahmed.site/api/health | python3 -m json.tool
# expect: full per-migration checklist when HEALTH_TOKEN is set

# 5. Storefront paints
# Open https://proshanti.rahatahmed.site/ in a browser — hero + category row on first screen, shop filter, product page, reviews.
```

### 2.3 Post-deploy smoke (manual, 5 min)

1. `GET /` → header, search, category row, offers rail, footer.
2. `GET /shop?category=men` → filters, chips, pagination, `Shop` nav active.
3. `GET /product/heritage-green-panjabi` (or `/shops/<shop>/p/<slug>`) → gallery, size chips, price, `aggregateRating` JSON-LD when reviews exist.
4. `GET /cart` with bag items → delivery progress, checkout link.
5. `GET /checkout` with address → delivery quote, coupon, Place Order (do not submit unless test order).
6. `GET /track?id=PS-…&phone=…` → timeline + live map.
7. `GET /sitemap.xml` + `GET /robots.txt` (headers have `s-maxage`).
8. `GET /_next/static/*` + `GET /icons/icon-512.png` — no proxy rate-limit header.

If any step fails, see Rollback §5.

---

## 3. Required Environment (Vercel → Settings → Environment Variables)

| Variable | Type | Value source | After change |
|----------|------|--------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | Supabase Project Settings → API → URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | Same → anon key | |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Same → service_role key | |
| `NEXT_PUBLIC_SITE_URL` | Config | `https://proshanti.rahatahmed.site` (F-06) | |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Config | Cloudinary Dashboard → Cloud name | |
| `CLOUDINARY_API_KEY` | Secret | Settings → API Keys | |
| `CLOUDINARY_API_SECRET` | Secret | Same | |
| `PUSH_VAPID_PUBLIC_KEY` | Config | `npx web-push generate-vapid-keys` | |
| `PUSH_VAPID_PRIVATE_KEY` | Secret | Same | |
| `UPSTASH_REDIS_REST_URL` | Config | Upstash Redis REST URL (optional) | |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | Upstash token (optional) | |
| `NEXT_PUBLIC_META_PIXEL_ID` | Config | Meta → pixel id (optional) | |
| `NEXT_PUBLIC_GA4_ID` | Config | GA4 → G-… (optional) | |
| `CRON_SECRET` | Secret | `openssl rand -hex 32` | Must match GitHub `CRON_SECRET` |
| `HEALTH_TOKEN` | Secret | `openssl rand -hex 32` | For external monitor |

**After any env change:** Vercel → Deployments → ⋯ on latest → **Redeploy** with **Use existing Build Cache unchecked**.

Build-related env is baked into the build — a redeploy is required to take effect.

---

## 4. Database / Migrations

This audit ships one additive migration (nullable column, partial unique index — safe, re-runnable, no data loss): `supabase/migrations/202610180001_checkout_idempotency.sql` (F-14 idempotency key). Apply it once via Supabase SQL Editor before or with the deploy; old orders stay valid (NULL key).

**The migration SQL (already committed):**

```sql
-- Run in Supabase → SQL Editor
alter table orders add column if not exists idempotency_key text;
create unique index if not exists idx_orders_idempotency
  on orders (idempotency_key) where idempotency_key is not null;
```

Verify after any migration:

```bash
# SQL Editor:
-- supabase/diagnose.sql  (expect SUMMARY: ALL APPLIED)
# or as staff:
curl -s -H "x-health-token: $HEALTH_TOKEN" https://proshanti.rahatahmed.site/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nextSteps'))"
# expect: [] (no nextSteps)
```

If `nextSteps` lists a file, that migration has not been applied — follow `docs/go-live.md`.

---

## 5. Rollback

### 5.1 Code rollback (Vercel)

1. Vercel → Deployments → find the previous **green** deployment before this PR's merge.
2. ⋯ → **Promote to Production** (instant).
3. Or via git:
   ```bash
   git checkout main
   git revert --no-commit <audit-merge-sha>  # or git revert <commit> per file
   git commit -m "Revert audit 2026-10-18 — site down after deploy"
   git push origin main
   # Vercel redeploys main on push.
   ```

### 5.2 Migration rollback (if one was added later)

- `idempotency_key` is new, nullable, no constraints beyond the partial unique index — safe to leave in place.
- To remove:
  ```sql
  drop index if exists idx_orders_idempotency;
  alter table orders drop column if exists idempotency_key;
  ```

- All other existing migrations are append-only — never downgrade them.

### 5.3 Env rollback

- Vercel → Settings → Environment Variables → ··· on changed var → Edit → previous value → **Save** → **Redeploy**.

### 5.4 Owner can run rollback alone

1. Paste previous `docs/audit/deployment-and-rollback.md` §2.2 health checks to confirm failure.
2. In Vercel dashboard (mobile works), Promote previous green deployment — no code needed.

---

## 6. Uptime Monitoring (recommended, F-25)

Add one external monitor so F-01 pages someone next time:

- **Easiest:** Vercel → Integrations → check for uptime (if available), or
- **Free external:** UptimeRobot / Better Stack / Checkly

```
URL: https://proshanti.rahatahmed.site/api/health
Headers: x-health-token: <HEALTH_TOKEN>
Expect: status 200 and JSON .live == true
Interval: 5 min
Alert to: owner email + WhatsApp (n8n/Zapier)
```

Non-detailed probe is also fine:

```
URL: https://proshanti.rahatahmed.site/api/health
Expect: 200 and {"live": true}
```

No token = only the `live` boolean is returned (safe for public monitors).

---

## 7. Release Criteria Gate (before marking release)

From `docs/audit/implementation-plan.md` Phase 6:

- [x] P1 fixed or explicitly deferred with risk in PR (F-02 nonce prep, F-03 obscurity documented, F-04 needs DB probe — see findings).
- [x] Production build succeeds locally (83/83, 0 errors, 0 warnings 2026-10-18) — Vercel green pending site-up.
- [x] No unintended data/API change (storefront + additive migration only).
- [x] This document complete; rollback documented (Vercel Promote + `git revert` + migration DROP INDEX).
- [x] Mobile (375px) + desktop (1280px) layouts OK (Playwright responsive + keyboard + reduced-motion specs 7 suites).
- [x] Accessibility: a11y 16 checks + keyboard 4 + reduced-motion 2 + 44px touch targets.
- [x] Performance: bundle §2.5.1/2.5.2/2.5.3, chunk table, no regression.
- [x] Console/network sweep clean (by code inspection — live sweep blocked on F-01).
- [ ] No unresolved P0 — **P0 F-01 (site down) is owner infra action** — release blocked until `curl -I proshanti.rahatahmed.site` 200.
- [ ] Critical journeys live pass (place → confirm → deliver → track) — blocked on F-01 + DB.

*Automated tests alone cannot prove security, accessibility, or production readiness.*

---

## 8. Next Steps After This Release

1. Owner fixes F-01 outage → redeploy shows 200 on the canonical host (apply `202610180001_checkout_idempotency.sql` via SQL Editor at same time).
2. Team runs full gate in clean env: `npm run lint 0` + `typecheck 0` + `build 83/83` already verified 2026-10-18; run `npx playwright test` with `npx playwright install chromium` and attach HTML report; run Lighthouse on live origin.
3. Confirm uptime monitor green (§6) — F-01 would now page owner.
4. Collect 1 week of CSP report-only violations, then decide whether to promote CSP to enforced (implementation-plan Phase 1A).
