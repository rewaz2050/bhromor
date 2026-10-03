# Owner runbook — rider / money / shop-wallet / push rollout

This is the checklist for putting PR #40 live. Nothing here has been run against a live Supabase —
the workspace has no database. Do step 1 on **staging first** if you have one.

## 1. Run the migrations (Supabase → SQL Editor), in this order

Every file is safe to re-run. Paste the whole file, run, expect no error.
If a database is **brand new**, skip this list and use `supabase/bootstrap-parts/` (22 parts, in order) instead.

| # | File | What it adds | Turns on by itself? |
|---|------|--------------|---------------------|
| 1 | `202609300001_rider_delivery_accounting.sql` | delivery accounting | yes |
| 2 | `202609300002_rider_money.sql` | rider wallet / payouts | yes |
| 3–9 | `202610010001` … `202610010007` | failed-delivery handling, payment verifier, P&L, COD netting, vendor rider view, money audit, daily report | yes |
| 10–22 | `202610020001` … `202610020013` | rider inbox, overview, dispatch rules, push, licence, scorecards, disputes, rate limit, feedback, incentives, follow-ups, failed fee + weekly bonus, shop-own-wallet | bonuses / wallet / fee: **OFF** |
| 23 | `202610020014_shop_balance_totals.sql` | shop totals summed in the DB | yes (fixes the 1,000-row under-count) |
| 24 | `202610020015_peak_rain_bonus.sql` | peak / rain per-order bonus | **OFF** |
| 25 | `202610020016_daily_shop_wallet_split.sql` | daily report splits shop-wallet money | yes |
| 26 | `202610020017_streak_bonus.sql` | weekly streak bonus | **OFF** |
| 27 | `202610020018_vendor_push.sql` | shop push subscriptions | needs shop owners to opt in |
| 28 | `202610020019_gps_jump_flags.sql` | GPS-jump flags | **ON** (record only, nothing is blocked) |
| 29 | `202610020020_failed_delivery_proof.sql` | failed-attempt photo table | **OFF** |

Then run `supabase/diagnose.sql` — the last rows (`90`–`93`) must say present. Any "missing" row names the file to run.

## 2. Settings to decide (all optional, all default OFF unless stated)

| Where | Setting | Default |
|-------|---------|---------|
| Riders → Incentives | daily / weekly / referral bonuses; peak & rain bonus; streak bonus | 0 = off |
| Riders → Dispatch rules | cash cap ৳5,000, offer window 90 s, max attempts 2, load limit 2, failed-delivery fee ৳0 | as listed |
| Riders → Dispatch rules → Failed-delivery photo | off / optional / required | off |
| Admin → Shops → a shop | settlement model `platform` (default) or `shop_wallet` + its bKash/Nagad number | platform |
| `site_settings` (SQL) | `gps_jump_max_kmh` (120, `0` = off), `gps_jump_min_m` (2000) | on |

Payment-verification model (platform / shop / both) is chosen per configuration by admin staff.

## 3. After the migrations

1. Cron: the scheduler already ticks every 15 min (`docs/automation.md`). New jobs `rider-order-bonus` (also pays streaks) and `shop-owes-reminder` start by themselves; they need `cron_marks` (`202609240002`).
2. Shop owners: open the vendor dashboard on the counter phone → **Turn on notifications**. iPhone needs "Add to Home Screen" first.
3. VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`/private) must already be set — they are the same ones staff push uses.

## 4. Smoke test (10 minutes, staging or a quiet hour)

- Place a test order → the shop phone buzzes; staff inbox shows it.
- A rider accepts, picks up, reports a failed attempt (with the photo setting on, add a photo) → staff order page shows it.
- Deliver a COD order → rider wallet, shop ledger and `/admin/money/daily` agree.
- On a `shop_wallet` shop: pay by bKash, verify → shop balance goes negative → `/admin/payouts` "owes PROSANTI" filter lists it → record a remittance.
- Riders → a rider → "GPS jump alerts" shows the clean tick.

## 5. Not covered (be aware)

Native background GPS (a PWA cannot), NID OCR (needs an external service), Playwright e2e and a staging dry-run were **not** done —
no browser or live database in the build environment.

## 6. Rolling back

Features that are OFF can simply stay off. If a migration must be undone, restore the previous function
bodies from git history (`git show <old-commit>:supabase/migrations/<file>`) — never drop money tables
(`rider_earnings`, `shop_ledger`, `shop_payouts`, `money_audit_log`). New tables
(`vendor_push_subscriptions`, `rider_gps_flags`, `delivery_failed_proofs`) can be dropped safely; nothing else references them.
