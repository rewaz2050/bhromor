# Area delivery requests — 2026-09-25

## Workflow

Customer places an order → shop confirms → shop marks **Ready** → every
eligible rider in the delivery zone gets an invitation → **first acceptance
wins** → assigned rider picks up → existing customer-code delivery flow.
No admin needs to be present. Customer collection (`is_pickup`) never creates
rider invitations. Wallet payments must be verified before dispatch.

The area is the order's existing `zone_id` (delivery area), matched against
rider `zone_ids`; this is not a GPS radius or a shop-location radius.
Eligible means approved (`active`), online, on shift, below the existing COD
cash limit and below two accepted/in-transit jobs. These checks run again at
acceptance. Invitations themselves do not consume capacity.

## Deploy (required)

Apply `supabase/migrations/202609250001_area_broadcast_dispatch.sql` through
`supabase/migrations/202609250006_dispatch_health.sql` in numeric order after
the existing migrations, then deploy the application. Ensure the existing
two-tap migration `202609170001_two_tap_order_flow.sql` has been applied as
well. For fresh installations the migrations are also appended to
`bootstrap-fresh.sql` (regenerate `bootstrap-parts/` with
`node scripts/split-bootstrap.mjs`).
Do not run the entire bootstrap against an existing database.

No production database migration was executed by this coding session.
The migration is transactional and repeat-safe. It changes the existing
one-live-offer index to allow multiple invitations but **one accepted/picked-up
assignment**. Do not re-apply the older dispatch repair after it.

## Requests and retries

- The Ready transaction creates an invitation for every eligible rider.
- The rider job feed polls every 15 seconds while visible; reopening the app
  refreshes immediately. This is **in-app delivery requests**, not background
  phone push or SMS. Riders should keep their app open while waiting.
- An invitation lasts 90 seconds. Acceptance enforces expiry on the server,
  even if the housekeeping job has not run yet.
- The existing `ps_expire_stale_offers` service RPC now also fills waiting
  orders with newly eligible riders. Rider feed reads and the existing
  `/api/cron/tick` call it; no admin page load is necessary.
- Expired invitations can be repeated after a five-minute per-rider cooldown.
  An explicit decline is never re-offered to that rider for that order; an
  admin **withdrawal** is different — it cools down for five minutes and is
  then re-offered (`cancelled_by` records which side cancelled).
- If nobody is eligible the order stays Ready on the admin waiting board.
- Admin batch assignment replaces pending invitations with one exclusive
  90-second invitation. It cannot take work from an accepted/picked-up rider.
  If the manual invitation **is declined**, automatic broadcasting resumes at
  once (the superseded riders are re-invited immediately, the decliner is
  not); if it **lapses unanswered**, the area resumes at once while the
  lapsed recipient cools down. Manual assignment may override zone/shift,
  but not approval, online state, cash, accepted-load limits — and never an
  unverified wallet payment (`payment not verified` is refused outright).
- The expiry sweep is throttled in the database: at most one real run per
  10 seconds unless forced (`p_force`). Every rider-feed poll calls the
  unforced sweep; it is a cheap no-op when nothing is due.
- Delivery needs the 4-digit code in two steps: `ps_rider_deliver_check`
  counts the attempt (5 wrong codes lock code entry for 15 minutes), then
  `ps_rider_deliver` verifies and completes. A success resets the counter.
- Rider **Settle no longer zeroes cash**: it files a claim
  (`rider_settle_claims`, one pending per rider) and staff approve it from
  the admin riders page (Approve settles the full hand balance, Reject keeps
  it with a note).

## Consistency and privacy

Acceptance locks the common order row before the rider and invitation rows.
A competing rider re-reads the now-closed invitation and gets HTTP 409; the
client reloads the feed and explains that the request is no longer available.
The winning rider id, order status, history, invitation withdrawal and rider
load all change in one transaction. A unique index is a second ownership guard.
The shared order mapper only attaches an accepted/picked-up/delivered rider,
not the latest broadcast recipient.

All rider API job responses remove the customer delivery code, wallet reference,
proof photo and internal timeline. Only accepted/picked-up jobs expose customer
contact/address/GPS. Pending or closed invitations expose just the delivery area.
Public shop name/address/phone are available for pickup planning.

## Validation

- `npm run test:dispatch`: executes the actual migrations twice each in
  embedded PostgreSQL (PGlite), then tests eligibility, multiple invitations,
  ownership, losing acceptance, strict expiry, retry cooldown, declines,
  manual fallback, late riders, RPC grants, pickup/payment exclusion, load
  bookkeeping, manual-expiry resume, withdraw cooldown, unverified-wallet
  refusal, settle claims, the 5-strike PIN lockout, sweep throttling and the
  dispatch health probe (11 scenarios).
- `npm test -- src/lib/__tests__/rider-order.test.ts`: response privacy.
- `npm run typecheck` and the rider UI/API/domain tests.

PGlite is single-connection: it tests SQL behavior, not real concurrent sessions.
Before production rollout, use two staging rider accounts on the same request:
accept simultaneously; verify exactly one success, one 409, one history entry,
one accepted assignment, and one increment in rider load. Also test manual
assignment racing acceptance, and one rider accepting two orders at capacity.

## Profile and dashboard build (follow-up)

- `/account` now has **আমার তথ্য ও ঠিকানা**: edit the account name, view
  checkout-saved addresses for that phone, choose the preferred address or
  delete one. Addresses remain **browser-local**, not cloud-synced; the UI
  explicitly says so. New addresses are saved during checkout. The login
  phone is read-only to avoid silently moving account/order ownership.
- `/api/account/profile` authenticates the session cookie and whitelists only
  `name`; body-supplied target IDs, phones and privileged fields are rejected.
  The shared session snapshot now refreshes when a name changes, not just ID.
- Rider profile can edit name, phone and vehicle through the authenticated
  `/api/rider/profile` endpoint. Status, zones, cash and identity links remain
  admin-owned. Duplicate phone numbers report a conflict. Profile writes use
  the existing trusted service-role backend; no additional schema is needed.
- Shop profile explains the pickup workflow, shows approval state and prompts
  for missing contact/address. Required inputs and in-flight disabled fields
  make saving clearer. Empty shop names no longer silently disappear from a
  patch. Staff permissions are unchanged.
- Checkout prefills empty name/phone fields from the signed-in customer without
  overwriting typed details.
- Admin dispatch now explains broadcasts, distinguishes requesting orders from
  invitation count, deduplicates map orders and only shows actual assignments
  on rider map links. Manual assignment only lists Ready orders.

Background rider push, cloud-synced customer address books, profile photos and
a refund overhaul are not part of this build. Delivery-code verification now
locks for 15 minutes after 5 wrong codes, and settlement is a staff-approved
claim flow (see above) instead of an instant rider self-zero.

### Build validation

- `npm run build` — production build passed.
- `npm run typecheck` and `npm run lint` — passed.
- `npm test` — 189 files, 1,258 tests passed (some pre-existing React act warnings).
- `npm run test:dispatch` — SQL scenarios passed.
- Follow-up verification: 5 Chromium browser contract tests passed (fixture
  APIs plus unmocked signed-out API checks). Full-bootstrap workflow and
  two-session races passed on real local PostgreSQL. See
  `docs/VERIFICATION-2026-09-25.md` for the repairs and remaining live checks.
- Production preview runs with `next start --hostname 0.0.0.0 --port 3000`.
  This workspace has no configured live Supabase environment, so real account
  login, profile persistence and deliveries require deployment configuration.
