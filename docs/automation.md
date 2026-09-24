# The shop's clock — scheduled work (`/api/cron/tick`)

**One question this file answers: what happens in this shop when nobody opens
the panel?** Until 2026-09-24 the answer was *almost nothing* — every bit of
housekeeping ran lazily, whenever a human happened to load a page:

| Work | Before | Now |
|---|---|---|
| A rider offer nobody answered | expired only when an admin/rider next loaded a board | `expire-offers` every 15 min |
| "Your parcel comes this evening" | a phone call, or nothing | `delivery-reminders` ~2h before the window |
| Yesterday's takings / what is piling up | open `/admin` and read | `daily-digest` at 9am Dhaka |
| Price-drop / restock news | staff call list (a phone call each) | watched phones get a **push** at the moment of the save; only the unreachable numbers stay on the call list |

Nothing here costs money and nothing needs a new account: a **GitHub Action**
pokes a token-gated endpoint, and the app decides what is due.

---

## 1. What runs, and when

`.github/workflows/cron.yml` → `GET /api/cron/tick` every **15 minutes**
(`*/15 * * * *`, plus a manual *Run workflow* button). One tick runs three jobs
and answers with an honest report:

```json
{
  "at": "2026-09-24T04:00:00.000Z",
  "jobs": [
    { "job": "expire-offers",      "status": "ran",     "did": 2, "detail": "2 stale rider offer(s) expired and re-offered" },
    { "job": "delivery-reminders", "status": "ran",     "did": 1, "detail": "1 reminder push(es) sent · 0 already reminded · 1 in window" },
    { "job": "daily-digest",       "status": "skipped", "did": 0, "detail": "already sent today" }
  ]
}
```

`status` is `ran` / `skipped` (nothing due, or no marks table) / `failed`
(the reason is in `detail`). The tick itself answers **200 whenever it ran** —
read the jobs, not just the HTTP code.

| Job | What it does | Safe to repeat? |
|---|---|---|
| `expire-offers` | counts offers with `status='offered'` past `expires_at`, then calls `ps_expire_stale_offers` (the RPC that re-offers the order) | yes — idempotent, runs even without the marks table |
| `delivery-reminders` | orders with a `scheduled_at` inside the next 2 hours → push **"আজ আপনার পার্সেল আসছে 🛵"** with the shop's own window label | claimed per order (`delivery-soon:<order id>`); the claim is **released** when nobody could be reached, so a shopper who turns notifications on later in that window still gets it |
| `daily-digest` | once per Dhaka day, after 9am: one staff push (inbox row + phone) with yesterday's orders/takings, today's orders, what is still open, today's scheduled deliveries, low stock, and how many shoppers are waiting on a price/restock | claimed once per day (`digest:<YYYY-MM-DD>`) |

**The reminder is deliberately not fired for every order** — only orders that
actually chose a window (`scheduled_at`), and only about two hours ahead: a
shopper told "coming today" at 6am would just be confused.

---

## 2. Turning it on (one-time, ~5 minutes)

1. **Pick a secret.** Any long random string — `openssl rand -hex 32`.
2. **Vercel** → Project → Settings → Environment Variables → add
   `CRON_SECRET` = that string (Production + Preview), then **Redeploy**.
3. **GitHub** → the repo → Settings → Secrets and variables → Actions:
   - **secret** `CRON_SECRET` = *the same string* (a mismatch is the 401 in the log)
   - **variable** `SITE_URL` = `https://proshanti.rahatahmed.site` (optional;
     the workflow already defaults to it — set it if the custom domain is not
     the one serving the app, e.g. `https://bhromor-zeta.vercel.app`)
4. **Supabase** → SQL Editor → run
   `supabase/migrations/202609240002_cron_marks.sql` (or paste the last block
   of `supabase/bootstrap-fresh.sql`). Without it the two one-shot jobs report
   `skipped` with the migration name — the offer sweep still runs, and nothing
   is ever sent twice.
5. **Check it:** GitHub → Actions → **Shop clock** → *Run workflow*. The first
   run should answer 200. Then Vercel → the same tick, or:

   ```bash
   curl -s -H "x-cron-secret: $CRON_SECRET" https://<site>/api/cron/tick | jq
   ```

`/api/health` (staff session or `HEALTH_TOKEN`) reports the three facts that
matter — `checks.cronConfigured`, `checks.cronMarksReady` and
`checks.cronLastRunAt` — and puts the matching next step in `nextSteps` while
something is missing.

---

## 3. Why GitHub Actions and not…

| Option | Verdict |
|---|---|
| **GitHub Actions** (chosen) | free for a public repo, 15-minute cadence, logs and email-on-failure built in. Caveat: GitHub disables *scheduled* workflows after 60 days without repository activity — any push re-arms it, and *Run workflow* always works |
| **Vercel cron** | free tier allows **2 jobs, once per day** — fine for a daily digest, too coarse for reminders; the taka-per-month upgrade buys nothing else here |
| **Supabase `pg_cron` + `pg_net`** | works (1-minute cadence) but lives *inside* the database: a paused free-tier project stops the clock, and the HTTP call has no logs the owner can read |
| **Keep it lazy (the old way)** | this is what "system ta automate" was about: work that only happens when a human opens a page |

Whichever scheduler is used, the endpoint is the same: any cron service, uptime
pinger (with a custom header) or the owner's own `curl` can call it. GET and
POST behave identically, and the secret can be sent either as `x-cron-secret`
or as `Authorization: Bearer …`, compared in constant time.

---

## 4. Failure modes, and what they look like

| Symptom | Meaning | Fix |
|---|---|---|
| `503 {"configured": false}` | `CRON_SECRET` is not set on the host | step 2, then redeploy |
| `401` in the Action log | the GitHub secret and Vercel's value differ (trailing space counts) | re-paste both |
| `503 …SERVICE_ROLE…` | `SUPABASE_SERVICE_ROLE_KEY` missing | set it in Vercel |
| both one-shot jobs `skipped` with `202609240002_cron_marks.sql` | the marks table is missing | step 4 |
| `daily-digest` `failed` | read the `detail` — usually a missing table from an un-run migration | run that migration |
| nothing has ever run | `/api/health` says `cronLastRunAt: null` | GitHub → Actions → enable workflows / *Run workflow* |
| a late tick | GitHub's scheduler is best-effort under load | harmless: the reminder window is 2 hours, the digest is once per day |

The clock is **never required for correctness**: orders, tracking, payments and
the rider flow all work with the scheduler switched off. Every job is a
courtesy that saves a phone call, and the report says plainly what it did.

---

## 5. What is still manual (and why)

- **WhatsApp** — the status chips already write the Bangla message for staff
  (see `src/lib/admin-wa.ts`); sending automatically needs the WhatsApp Cloud
  API, i.e. Meta business verification and per-message pricing.
- **Email** — the newsletter table collects addresses, but a sender needs a
  verified domain (Resend/ZeptoMail free tier) before anything can leave.
- **SMS** — carrier gateway, paid per message.
- **bKash/Nagad verification** — needs a merchant/PGW account.
- **Calling the customers who are not on push** — the price/restock notes now
  list only the numbers that could not be reached, but a human still dials
  them. That is the honest design: a push is not a phone call.

Roadmap order for the rest: **WhatsApp draft-outbox → email sender → customer
in-app inbox** (`docs/customer-notifications.md` §2–4).
