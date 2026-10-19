# PROSHANTI — Deployment & Rollback Guide

**Date:** 2026-10-19  
**Branch:** `arena/d56529ee-bhromor` (from `a7a3b9262abe0cda29fcb123bd66c49d76cc65b0`)  
**Deployed site:** `https://proshanti.rahatahmed.site/` → origins on Vercel (framework: `nextjs`) behind Hostinger/Cloudflare proxy (DNS `64.29.17.65` / `216.198.79.65` observed).

> **Audience:** Owner / devops running the next production deploy. Follow steps in order; stop and ask before any destructive operation.

---

## 1. Pre-deploy checklist (30 min)

### 1.1 Code gate (local)

```bash
git checkout arena/d56529ee-bhromor
git status            # must be clean
npm ci
npm run lint          # expect: 0 errors, 0 warnings (post E1.2)
npx tsc --noEmit      # expect: no errors (takes ~55 s; or `npm run build` covers it)
npm test              # expect: 173 files passed | 0 failed (act warnings are noise)
npm run build         # expect: Compiled ✓ + Generated 83 pages + Route table
```

If any gate fails, **do not deploy** — fix first, re-tag.

### 1.2 What changed in this audit branch

| Commit | Change | Risk |
|---|---|---|
| `E1.2` | `src/app/api/track/reschedule/route.ts` — removed dead `WINDOW_MS`/`LIMIT` consts; `src/app/api/track/rider-location/route.ts` — removed dead `WINDOW_MS` | None — rate limiting was already via `gateTrackRequest` + edge proxy |
| `E1.3` | `src/lib/site-url.ts` — fallback `https://prosanti.store` → `https://proshanti.rahatahmed.site`; `.env.example` docs/examples aligned | Only affects canonical/OG/sitemap/robots when `NEXT_PUBLIC_SITE_URL` unset — now correct |

**Total diff:** `4 files changed, 4 insertions(+), 6 deletions(-)` — no DB migration, no API shape change, no breaking change.

### 1.3 Infra gate (owner action — before first post-audit deploy)

1. **Confirm P1-01:** From a second network (phone hotspot, not office/sandbox), run:
   ```bash
   curl -I https://proshanti.rahatahmed.site/
   curl -I https://proshanti.rahatahmed.site/sitemap.xml
   curl -I https://proshanti.rahatahmed.site/robots.txt
   ```
   Expect `200` + `strict-transport-security`, valid XML/txt. If still `SSL_ERROR`/`empty reply`:
   - Check **Hostinger/Cloudflare** → origin host → must point to **Vercel** (`cname.vercel-dns.com` or Vercel-provided).
   - Check **SSL mode**: Cloudflare `Full (strict)` or Hostinger equivalent (not `Flexible` against non-TLS origin).
   - Check **Vercel** → Settings → Domains → `proshanti.rahatahmed.site` → valid + ACME cert issued.

2. **Set Vercel env (once):**  
   `Vercel → Settings → Environment Variables` (Production + Preview):
   ```
   NEXT_PUBLIC_SITE_URL = https://proshanti.rahatahmed.site
   ```
   Keep existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_*` (if set), `PUSH_VAPID_*`, `CRON_SECRET`, `HEALTH_TOKEN`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_*`, analytics IDs.

3. **Optional but recommended:** Set Upstash shared rate limit (findings P2-02):
   ```
   UPSTASH_REDIS_REST_URL = https://...upstash.io
   UPSTASH_REDIS_REST_TOKEN = ...
   ```

4. **Validate canonical after next deploy:**  
   `view-source:https://proshanti.rahatahmed.site/` should show `rel="canonical" href="https://proshanti.rahatahmed.site/…"` (not `prosanti.store`), same for `/sitemap.xml` entries and OG `url`.

---

## 2. Deploy steps (Vercel)

### 2.1 Recommended path — PR via GitHub (audit trail)

```bash
# On your machine (or GitHub UI)
git push origin arena/d56529ee-bhromor
# Open PR: arena/d56529ee-bhromor → main
# Title: audit(a1): lint clean + canonical host fix
```

- Vercel creates a **Preview deployment** automatically (unique URL) — use it for smoke tests before merging.
- Check **GitHub Checks** → CI `lint → typecheck → test → build` (plus Preview’s `npm run build`).
- When green, **Merge via GitHub** (squash or merge) → Vercel auto-deploys `main` to **Production**.

### 2.2 Alternative — direct Vercel CLI

```bash
npx vercel --prod  # from repo root, already linked to Vercel project
```

Prefer PR path for this low-risk change (audited diff).

### 2.3 Post-deploy smoke (5 min, on Preview or Production)

```bash
# Quick curl (from any host)
curl -I https://proshanti.rahatahmed.site/
curl -s https://proshanti.rahatahmed.site/api/health | head -c 500
# Optional staff-gated detail (if you have HEALTH_TOKEN):
curl -s -H "x-health-token: $HEALTH_TOKEN" https://proshanti.rahatahmed.site/api/health | jq .checks
```

Manual click-through (5 routes, desktop + phone):
1. `/` — hero renders, category row visible on first viewport, offers rail only if offers exist
2. `/shop` — filters (category/price/size) → URL `?…` + “Show all zones” fallback
3. `/shops/<known>/p/<known>` — product gallery + purchase panel + reviews
4. `/cart` → `/checkout` — name/phone/para/house → Place Order disabled until valid, shortfall shown
5. `/track` — phone-gated lookup (no 500)

Check Vercel → Deployments → latest → **no function errors**, headers show `Content-Security-Policy-Report-Only`.

---

## 3. Environment variables reference

| Var | Required | Scope | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | **Yes (now)** | browser+server | Canonical origin. Set to `https://proshanti.rahatahmed.site`. Old fallback `prosanti.store` removed from code. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | browser+server | Supabase project URL `https://…supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | browser+server | Anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | server only | **Never** `NEXT_PUBLIC_` — bypasses RLS |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | If media | browser+server | Cloud name |
| `CLOUDINARY_API_KEY`/`SECRET` | If media | server only | Signed uploads |
| `UPSTASH_REDIS_REST_URL`/`TOKEN` | Recommended | server | Shared rate limit (findings P2-02); no-store fallback if absent |
| `PUSH_VAPID_PUBLIC/PRIVATE/ SUBJECT` | If push | server+browser | Generate via `npx web-push generate-vapid-keys` |
| `CRON_SECRET` | If cron | server+GH secret | Must match GitHub Actions secret for `/api/cron/tick` |
| `HEALTH_TOKEN` | Optional | server | `x-health-token` header unlocks detailed `/api/health` |
| `NEXT_PUBLIC_GTM_ID`/`FB_PIXEL_ID`/`GA4_ID` | Optional | browser | Analytics, consent-gated, storefront-only |
| `NEWSLETTER_SIGNUP_URL` | Optional | server | Hosted newsletter form override |

All `SUPABASE_`, `CLOUDINARY_`, `CRON_`, `HEALTH_` secrets are **server-only**; never commit `.env.local`.

---

## 4. Rollback instructions

### 4.1 Code rollback (fast — recommended first)

**Option A — Vercel Instant Rollback (zero downtime):**

1. Vercel → Deployments → find **previous Production deployment** (before this PR) → `…` → **Instant Rollback**.
2. Verify `curl -I https://proshanti.rahatahmed.site/` → `200`; click through 5 routes.

**Option B — Git revert + redeploy:**

```bash
# On main after merge
git revert <audit-merge-sha>   # revert E1.2+E1.3 (or single commits listed in §1.2)
git push origin main           # Vercel redeploys previous revision automatically
# Alternatively roll back the branch before merge:
git checkout arena/d56529ee-bhromor
git reset --hard origin/main
git push --force-with-lease origin arena/d56529ee-bhromor
```

### 4.2 Env rollback

If new `NEXT_PUBLIC_SITE_URL` broke something (unlikely — it fixes canonicals):

1. Vercel → Settings → Environment Variables → `NEXT_PUBLIC_SITE_URL` → remove or revert to previous value.
2. Redeploy (Deployments → `…` → Redeploy) — ISR caches revalidate within 60 s.

**Note:** Old fallback `prosanti.store` no longer exists in code after E1.3, so unsetting the env now surfaces `proshanti.rahatahmed.site` (correct), not the stale host.

### 4.3 DB / data rollback

**No DB changes in this audit.** No migration to revert, no data written. If you later add migrations from implementation-plan phases (E2–E5), document each as a reversible `down` migration before deploying.

### 4.4 When to rollback

- `npm run build` fails in Vercel (should not — built locally with 83 pages).
- Health probe `/api/health` → `live: false` after deploy (check `counts`/`checks` with `x-health-token`).
- Console errors on critical routes (`/` `/shop` `/checkout` `/track`) — check browser DevTools + Vercel Function Logs.
- Sitemap/OG URLs point wrong host — wait 5 min (ISR), then check again; rollback env if needed.

---

## 5. Known limitations & manual actions

| Item | Status | Owner action |
|---|---|---|
| **P1-01 TLS/proxy** | Investigate second network before calling this deploy “prod-ready” | Confirm Hostinger/Cloudflare → Vercel mapping + cert |
| **P1-02 npm majors** | Not in this deploy | Separate PR: `npm audit fix` (non-breaking) + `tinypool`/`braces` majors with full gate |
| **P1-03 Lighthouse** | Not measured (site unreachable) | Run `npx lighthouse` ×3 on 4 routes after TLS fix; save to `docs/audit/performance-baseline-*.md` |
| **P1-04 axe re-run** | Last pass 2026-09-08; CI browser job needs fix | Fix `ci.yml` browser job (`continue-on-error` remove), re-run `npm run test:e2e` with seeded preview |
| **P2-02 Upstash** | Without env, rate limit is per-isolate | Set `UPSTASH_*` and verify 429 cross-isolate |
| **P2-08 bundle** | No budget | Add `bundle-analyzer` and size-limit in CI |

All manual actions are **authorized** (non-destructive, reversible) — no secrets will be accessed by audit branch beyond public env names.

---

## 6. Support contacts & links

- **Repo:** `rewaz2050/bhromor` (`main` = production)
- **Audit branch:** `arena/d56529ee-bhromor` — push-only here; PR to `main` when ready
- **Docs:** `docs/audit/architecture.md`, `findings.md`, `implementation-plan.md`, `test-report.md` (this deploy guide completes the set)
- **Owner runbook (prior):** `docs/go-live.md`, `docs/OWNER-RUNBOOK-RIDER-MONEY.md`, `docs/vercel.md`, `docs/media-setup.md`
- **Health probe:** `GET https://proshanti.rahatahmed.site/api/health` (+ `x-health-token` for detail)
- **Previous audits:** `docs/AUDIT-2026-09-16.md` etc. (archived, not re-audited)

---

## 7. Next recommended action (after this deploy)

> **Now:** Set `NEXT_PUBLIC_SITE_URL`, verify TLS from second network, merge audit branch (E1.2+E1.3).  
> **Next:** `npm audit fix` non-breaking PR → Lighthouse baseline → axe re-run → CSP enforcement staged → bundle budget.  
> **Do NOT:** `npm audit fix --force` or CSP enforce without 7-day report-only soak — both are breaking changes.

