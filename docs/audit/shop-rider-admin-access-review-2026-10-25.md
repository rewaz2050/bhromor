# Shop–Rider–Admin workflow and access review

**Date:** 25 October 2026  
**Scope:** repository UI, API wrappers, domain helpers, migration definitions, targeted tests and a synthetic embedded SQL probe. **Not** deployed Supabase/RLS or real-account acceptance. APK work remains paused.

## Executive decision proposed

**Shop runs fulfilment. Rider runs delivery. Platform runs oversight, dispatch exceptions and controlled finance.** Admin should not be the routine bottleneck for accepting and packing marketplace orders.

Importantly, the code already supports shop confirmation. The problem is overlapping authority and several coarse access boundaries, not absence of the entire shop flow. No production permission or business rule was changed by this review.

## 1. Current verified behavior

| Area | Repository evidence | Finding |
| --- | --- | --- |
| Order placement | `src/app/api/orders/route.ts`, `notifyVendorsNewOrders` | New orders notify owning shops as well as staff. No missing shop-notification feature is assumed. |
| Shop fulfilment | `/api/vendor/orders/[id]/advance`; `advanceVendorOrder` in `src/lib/db/vendor.ts` | Shop can confirm, optionally prepare, mark ready and cancel in allowed early states. Lookup is scoped to verified `shopId`. |
| Ready → riders | Vendor advance route, SQL order flow/broadcast migrations | Ready triggers pending-offer push/no-coverage handling; normal shop flow need not wait for Admin confirmation. This is source/local-contract evidence, not deployed delivery proof. |
| Admin overlap | `/api/admin/orders/[id]/advance`, admin order detail, `src/lib/order-actions.ts` | Staff also receives routine Confirm/Ready actions. Route accepts optional note; it does not implement a dedicated reason-required emergency override policy. |
| Staff roles | `src/lib/staff-auth.ts`, `/api/admin/_lib.ts` | Manager/admin/super_admin exist. `roles:` is optional; without it all three pass the staff wrapper. |
| DB staff helper | `supabase/schema.sql: ps_is_admin()` | All three staff roles count as admin in broad policies/functions. API role distinctions do not automatically exist in SQL. |
| Counter collection | `primaryAction` in `src/lib/order-actions.ts`; `assertVendorTarget` | Vendor waits for PROSANTI staff to hand over at Traffic Point; vendor `delivered` is forbidden. This is an existing platform-counter model, not proof of a broken shop-counter implementation. |
| Wallet decisions | `src/lib/payment-verifier.ts`, `ps_verify_payment` migration, vendor payment route | Per-shop platform/shop/both verifier policy already exists. Current default is `both`; financial routing must be checked before changing it. Confirm and payment verification are separate actions. |
| Shop staff | Generic vendor routes for products/earnings vs owner-aware profile/staff helpers | Product create/update and earnings reads do not distinguish owner/staff at their API boundary. Staff management and some profile/holiday fields already restrict owners. Existing access is broader than the recommended least-privilege policy, not automatically an exploit. |
| Rider | `requireRider`, assignment RPC routes, `riderOrderView` | Active-only operational gate, actor-scoped jobs, pickup/delivery actions; delivery requires customer PIN and proof/allowed no-photo path. Preserve these protections. |
| Rider privacy | `src/lib/rider-order.ts` | Delivery PIN/payment reference/proof URL removed from rider view; contacts/location masked before accept and for non-active assignment states. Do not invent a missing masking feature. |
| Finance | Settlement/adjustment API roles versus SQL functions | Specific role-depth mismatch reproduced locally; highest-priority permission work below. |

## 2. Prioritized changes

### P1 — Enforce finance privileges in the database too

The settlement endpoint `/api/admin/riders/[id]/settle` requires admin/super_admin, but `ps_admin_settle_rider` in `202610010004_cod_netting.sql` checks only `ps_is_admin()`, which includes manager. The function grants EXECUTE to authenticated; the later grant-hardening migration deliberately preserves these session RPC grants.

**Executed probe:** a minimal embedded PGlite schema used the actual repository `ps_is_admin()` and settlement function bodies, the authenticated EXECUTE grant and a manager JWT-sub claim. A synthetic rider with cash custody **10,000 paisa** was successfully settled by that manager directly through the RPC. No Next API was involved and no live account/money was touched.

This establishes an API-vs-SQL authorization mismatch for that RPC in the tested source model. It does not prove a deployed exploit, installed migration state, or that every financial RPC has been dynamically tested. `ps_admin_adjust_rider` has the same broad helper/grant pattern in source and needs its own negative SQL tests.

**Proposed fix:** explicit financial capability/role checks in new migrations and RLS policies; retain broad staff helper only where legitimate operational access is intended. Inventory all financial RPC/table entry points—do not patch only the UI or globally narrow `ps_is_admin()` and break normal dispatch. Test manager denial through direct SQL/RPC as well as API, while admin/super_admin continue to work and rider self-service remains valid.

### P1 — Make fulfilment ownership explicit end-to-end

- Shop-owned order: Shop Confirm → Ready. Admin sees **Waiting for shop confirmation/preparation**, not the same routine primary button.
- Optional emergency override: admin/super_admin only, dedicated action, mandatory reason and actor/timestamp audit; notify the shop. Manager cannot silently impersonate shop acceptance.
- Must enforce at UI, API **and SQL RPC/direct-write** boundaries. Hiding an admin button alone is not the fix.
- Existing platform-owned/counter workflows need an explicit rule before blanket removal of staff actions.

### P2 — Separate shop owner from operational staff

Baseline staff: own-shop order acceptance, packing, ready status, packing slip and necessary customer/rider contact. Owner: pricing/catalog publishing, financial statements, promotion budgets, staff roster and sensitive settings. Delegated stock editing/cashier payment verification should be explicit capabilities if needed, not an assumption that every packer can change prices or verify money.

Keep the existing own-shop row scope and platform-only commission/zones/approval controls. Add owner/staff negative tests to API and database; a restricted menu alone does not protect raw requests.

### P2 — Resolve counter collection policy

Current model says **Traffic Point/platform staff hands over**. If customers actually collect from their own shop, add a **separate shop-scoped collection action**, with collection confirmation/proof and ledger semantics preserved. Do not grant generic vendor `delivered`, which would also permit closing rider deliveries. Do not walk through fake rider assignments for a normal shop collection.

### P2 — Match payment authority to money visibility

Determine the actual wallet receiver for each shop/payment model. Platform wallet → authorized platform finance verifies; shop wallet → owner/designated cashier verifies. Keep existing verifier setting/migration compatibility until an approved conversion is specified. Rider reports actual COD collection via the delivery transaction; rider never verifies wallet transfers or changes order totals. A customer screenshot/TRXID is evidence to review, not automatic payment verification.

### P2 — Audit risk-bearing operations/settings

`/api/admin/dispatch-settings` PATCH currently has no explicit role whitelist and includes cash cap alongside dispatch timing/attempt limits. Separate operational knobs from financial/risk settings or reserve sensitive settings to admin/super_admin. Also inventory cancellations/refunds, dispute adjustments, payout approvals, return completion and direct table policies. The current API permission-matrix test documents that many distinctions exist only in routes; extend coverage to actual DB entry points.

### P3 — Work queues, privacy and escalation

- Shop: new → preparing → ready → handed over, payment blockers and overdue acceptance/preparation.
- Rider: eligible offer → accepted → picked up → delivered/failed, own cash/earnings and claim state.
- Admin operations: unresponsive shop, no rider coverage, pickup delay, failed delivery, disputes and reconciliation—not every normal Confirm action.
- Notifications go to the actor who must do the next action; other actors get read-only status where appropriate. Existing new-order shop notifications and Ready broadcasts should be retained.
- Alert on agreed SLA breaches; do not silently auto-accept/cancel or promise an invented delivery deadline.
- Preserve assignment-scoped rider contact visibility and PIN secrecy. Limit historical customer/KYC/proof exposure by purpose; exports/access revocation need review. Current role cache has a bounded lifetime, so do not promise globally instantaneous revocation without testing it.

## 3. Proposed permission matrix

**Own** means server-verified shop/rider scope, never a client-supplied actor ID. This table is a recommended future policy, not a claim all rows are implemented today.

| Action | Shop owner | Shop operational staff | Rider | Platform manager | Admin / super_admin |
| --- | --- | --- | --- | --- | --- |
| See own-shop orders | Own | Own, necessary fields | Assigned/eligible view only | Operational scope | Oversight scope |
| Confirm / pack / Ready | Own | Own | No | Monitor/escalate | Reasoned emergency override only, if approved |
| Pickup parcel | Handover coordination | Handover coordination | Own accepted assignment | Monitor/exception | Controlled exception, not fake pickup |
| Mark home delivery complete | No | No | Own assignment + PIN/proof + COD rules | No routine bypass | Documented recovery only; preserve custody/ledger invariants |
| Counter collection complete | Only if shop-counter policy approved | Explicit delegation only | Not a rider task | Current platform-counter policy until changed | Current platform-counter policy until changed |
| Reject/cancel order | Own early state + reason | Defined early-state delegation + reason | Cannot cancel sale; reject/release own offer/assignment | Policy-limited support/escalation | Exceptional resolution/refund policy |
| Edit product price/publish | Own | No by default; explicit delegation if needed | No | Review/moderation scope | Moderation, not routine shop pricing |
| Edit stock/availability | Own | Explicit operational delegation | No | No routine edit | Audited correction only |
| Verify wallet payment | Only for authorized receiver/delegated cashier | No by default | No | No by default | Authorized platform receiver/exception policy |
| View shop financial statements | Own | No by default | Own earnings only | Operational summaries only | Finance/oversight permission |
| Approve settlements/payouts/adjustments | Submit/review own statements, not approve platform payout | No | Submit own claim/request; no self-approval | No financial approval | Explicit finance permission + audit |
| Dispatch/reassign/recovery | Ready + see incoming rider | Ready + handover | Accept/reject/release within rules | Yes within operational policy | Yes + exceptional authority |
| Commission/cash cap/payment routing | No | No | No | No sensitive financial changes | Admin/super_admin, audited |
| Manage shop staff | Own shop | No | No | No | Controlled support/admin scope |
| Grant platform roles | No | No | No | No | Admin delegated lower roles; super_admin protects highest privileges |
| Shop/rider approval/suspension | No self-approval | No | No self-approval | Review/escalate as authorized | Explicit approval authority |
| Customer data / KYC / exports | Minimum own-order data | Minimum fulfilment data | Minimum active-assignment data | Purpose-limited operations | Explicit sensitive-data/export permission |

## 4. Target operational sequence

1. Customer creates shop-scoped order(s), reservation/payment model retained.
2. Owning shop receives actionable notification and confirms/rejects with clear reason.
3. Shop prepares; required wallet verification occurs by the designated money receiver before fulfilment/dispatch gates permit it.
4. Shop marks Ready. Eligible rider offers/broadcast happen using existing atomic dispatch rules; first valid acceptance wins, not an admin Confirm tap.
5. Shop sees incoming rider; rider verifies pickup and starts delivery.
6. Rider completes with customer code and proof/allowed exception. COD custody, earnings and shop ledger remain transactionally consistent.
7. Owner/authorized finance views reconciliation; rider submits claims; authorized finance approves settlements.
8. Admin intervenes only on defined exceptions, with reason/audit and invariant-preserving recovery. Counter collection follows the separately agreed physical handover model.

## 5. Implementation order and acceptance

1. Finance role/RPC/RLS parity and direct-call regression tests.
2. Shop-first order actions + explicit admin exception policy; preserve normal notifications and status machine.
3. Owner/staff capability boundaries, menus and APIs.
4. Counter collection, payment receiver decisions and exception queues.
5. Browser contracts and SQL integration coverage: cross-shop denial, manager financial denial, staff price/finance denial, foreign rider assignment denial, simultaneous accept, double Ready/Delivered, wrong PIN/proof, payment blocker, expired/revoked actor and audited override.

Use additive migrations with bootstrap parity, not edits that only repair a fresh database. Review existing data/roles before rollout; stage first. No payment totals, commissions, balances or stock rules should be changed merely to implement access control.

## 6. Executed checks / limitations

- **8 targeted test files / 80 PASS / 7.58 s**: order actions, verifier rules, vendor guards/payment helpers, vendor/staff routes, admin API permission matrix and rider routes.
- Manager settlement RPC probe: **reproduced authorized-by-broad-SQL-helper behavior** on synthetic embedded data; not deployed Supabase.
- Probe source: ignored `.cache/role-audit/manager-rpc-probe.mjs`; logs `/home/user/role-audit-manager-rpc.log`, `/home/user/role-access-audit-tests.log`.
- No application code, role grants, migrations or live accounts changed in this audit. No new commit/push/deploy or APK retry.

## 7. Business decisions needed before enforcement

1. **Admin fulfilment:** allow admin/super_admin emergency Confirm/Ready with mandatory reason, or strictly shop-only? Recommended: shop-first plus tightly audited emergency override.
2. **Physical counter:** does the customer collect from their shop, platform Traffic Point, or both as distinct pickup locations? Do not infer this from the label alone.
3. **Shop delegation:** baseline staff order/packing only; add inventory/cashier privileges only when explicitly needed. Recommended default: no price/financial/roster access for ordinary staff.

The proposed baseline can be implemented after these responsibility choices are confirmed. Existing wallet receiver and financial rules must be preserved or explicitly separately approved.

## 7. Implementation checkpoint after permission-model approval

The review above records the **pre-implementation** findings. Following approval, the first finance-write boundary has been implemented locally; see `shop-rider-permissions-progress-2026-10-25.md` for changes, fresh test evidence and remaining work. This is not completion of the six-role model and is not a deployed migration.
