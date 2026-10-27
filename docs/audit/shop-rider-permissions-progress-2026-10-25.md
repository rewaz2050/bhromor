# Permission implementation — staged progress

Started: 25 October 2026. Updated: 26 October 2026. Branch: `arena/bcb37d54-bhromor`.
Status: **Checkpoints 1–11 implemented locally, plus the owner's pickup-location decision. Latest full suite: 619 files / 4,662 tests PASS; production build, TypeScript, ESLint (no warnings) and whitespace checks PASS; browser contracts 12/12; disposable real-PostgreSQL workflow groups 22/22. Checkpoint 10 closed the independent mixed-role shop-fulfilment defect; checkpoint 11 closes same-actor finance decisions (own payout, custody, claim, wallet credit, dispute and own-shop payout). Pickup location is now decided by the owner: Traffic Point is retained and is not converted to the shop's own address. Hosted six-role acceptance, old-token recovery and multi-person collusion remain separate.** No commit, push, merge, deployment, live account/payment tests or APK work in this batch.

## Checkpoint 1 — finance-write boundary

### Implemented

- Platform payment approval, rider-dispute decisions and dispatch/risk settings writes now require Admin/Super Admin at the API boundary (other pre-existing finance API restrictions remain).
- New SQL migration `202610250001_finance_permission_boundary.sql` introduces `ps_can_manage_finance()` without changing the broad operational `ps_is_admin()` helper.
- Five financial approval/adjustment RPCs use the new guard. Their installed accounting bodies remain otherwise unchanged. Platform wallet verification uses the narrow helper while retaining the existing per-shop verifier branch.
- Restrictive authenticated INSERT/UPDATE/DELETE policies on seven financial tables intersect existing permissive policies; they do not grant new writes.
- Direct authenticated edits of rider balances, shop commission/wallet routing and order payment/totals are guarded. Nonfinancial operational updates remain possible. Manager parent-record deletes cannot cascade away financial records.
- Protected settings include `ops`, literal `rider_`-prefixed keys, offer TTL and delivery retry limits; key-renaming bypasses are covered.
- Bootstrap mirror, generated bootstrap parts and migration checklist updated. Applying the migration twice is tested.

### First-checkpoint verification

| Check | Result |
| --- | --- |
| Focused API/domain/vendor/rider regressions | **11 files, 103 tests passed**, 8.64 seconds |
| `npm run test:money` | **44 PASS groups**: original 35 accounting groups plus 9 finance-boundary groups |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| Migration text versus full bootstrap and generated parts | Exact mirror verified |

The new SQL tests run the actual migration twice against disposable embedded PostgreSQL (PGlite), then **SET ROLE authenticated** with synthetic JWT identities. They install realistic legacy permissive staff policies in the minimal money fixture so denials cannot pass merely from absent permissions. Coverage includes:

- Manager/rider/vendor denial at all five privileged financial RPC entry points.
- Manager denial at wallet verification and direct rider/shop/order financial fields.
- INSERT, UPDATE and DELETE denial on every protected financial table, even with a legacy staff-write policy.
- Manager self-promotion and parent-deletion denial; protected-setting insert/update/delete/rename denial.
- Successful real rider payout request, dispute and cash claim; Admin decisions/settlement/payment verification; Super Admin adjustment.
- Persisted payout status and approving actor, approved dispute, verified payment, cash settlement and wallet/journal reconciliation.
- Authenticated rider delivery still posting automatic COD and journal-balanced earnings through trusted accounting functions.
- Existing own-shop wallet verification and anonymous financial RPC denial.

API handler tests explicitly exercise Manager 403 before financial code runs; Admin/Super Admin payment approval succeeds with the actor-bound database client. These are local handler tests, not live HTTP/Supabase acceptance.

## Checkpoint 2 — Shop-first fulfilment

Normal marketplace Confirm / Preparing / Ready actions now belong to the owning shop:

- Shared admin row actions show shop ownership rather than routine Confirm/Ready buttons. Order detail uses the same rule. Existing platform-only orders remain operable.
- Admin/Super Admin have a separate, collapsed **Emergency shop fulfilment override** panel. It requires a 10–300 character reason and records the target action. Manager and unresolved roles do not see it.
- The detail hook submits explicit `fulfilmentOverride: true` only for this exception. The API/DAL reads the actual order's shop/return metadata and uses the authenticated role, never a role from the JSON payload. A reason alone or a string `"true"` is not API authorization.
- New migration `202610250002_shop_first_fulfilment.sql` inserts the role/reason guard into the actual installed `ps_advance_order` implementation. Direct SQL overrides also require Admin/Super Admin plus a valid reason, and the history note is tagged `[Shop fulfilment override]` with the real actor. The installed state machine is otherwise preserved.
- Direct authenticated status/shop/return/pickup-mode table edits are blocked, including Admin direct edits: use the authorized workflow rather than bypassing shop ownership, payment checks or rider PIN/COD custody. Trusted definer workflows retain their own existing actor checks.
- Operational cancellation, return handling, failed-delivery coordination, platform-only fulfilment and Traffic Point handover are not reclassified as ordinary shop fulfilment. No physical collection policy was changed.
- Bootstrap mirror, generated parts and migration checklist include both permission migrations.

### Latest fresh verification

| Check | Result |
| --- | --- |
| Combined role/API/DAL/UI/hook regressions | **21 files, 208 tests passed**, 19.41 seconds |
| `npm run test:money` | **52 PASS groups**, including 8 new Shop-first groups after the prior 44 |
| `npm run test:dispatch` | **15 PASS groups**, existing dispatch compatibility suite |
| `npm run typecheck` | Passed after correcting a test-only query option typing error |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| Both migrations versus bootstrap and generated parts | Exact mirrors verified |

The new SQL groups apply the actual Shop-first migration twice, assert the original order-machine body differs only by the inserted guard, and execute as real `authenticated` roles. They verify all three normal shop transitions, Manager/stranger denial, missing/short/overlong reason denial, Admin/Super Admin actor/reason history, wallet-payment gating, direct-write bypass denial, preserved Traffic Point/cancellation/platform-only behavior, and active rider PIN/COD/earnings behavior. API tests run the **real route and DAL** with synthetic actor clients; forged JSON roles cannot grant access. Component/detail-page/hook tests cover Manager control visibility and the explicit exception payload.

These are local disposable embedded SQL and UI/handler tests, **not** deployed Supabase, live HTTP acceptance or fresh full-bootstrap execution on real PostgreSQL. The dispatch suite is compatibility evidence, not a replacement for the new real-role authorization tests. No fresh full browser/full repository suite or production build is claimed at this intermediate checkpoint.

## Checkpoint 3 — Owner/Staff delegation

Existing Staff logins receive an empty permission array (no automatic grandfathered extra grants). Owner capabilities are implicit and remain available. Four **explicit** grants are exposed in the owner's staff roster:

| Grant | Authority | Not granted |
| --- | --- | --- |
| Catalog | Catalog editor, prices, stock/variant structure, media, categories and CSV operations | Platform curation, shop identity/routing, financial reports, payouts, promos or team access |
| Inventory | Stock-only workbench and atomic available-stock adjustment | Prices, variant structure, customer reservation edits or finance |
| Cashier | Own-shop wallet verification/rejection under the configured platform/shop/both verifier policy | Payouts, earnings/report/team access or general cancellation |
| Cancellation | Eligible own-shop order cancellation through the existing state machine | Delivery completion, PIN bypass, financial approvals or team access |

**Cashier rejection retains the existing automatic order cancellation/payment-rejection behavior.** It is not a general cancellation grant; separating that automatic consequence would change existing payment/stock semantics. The catalog checkbox explicitly names prices and stock; grant Inventory instead when only stock work is intended.

### Implementation

- `202610250003_vendor_staff_permissions.sql` adds validated grants, active-shop scoped helpers, restrictive table policies, RPC entry checks and field-level product/variant protection. Existing permissive policies cannot restore default Staff write authority.
- Normal Confirm/Preparing/Ready stays available to active own-shop Staff. General cancellation and cashier RPCs independently check current database grants, including direct RPC calls.
- `vendor_permission_audit` records actor, target, old/new grants and time. Grant/revoke changes and deletion of a granted staff link are recorded; authenticated and service-role callers cannot directly mutate/delete the audit table. Owner and authorized Admin/Super Admin may read the appropriate history.
- Only Owner may grant/revoke Staff permissions through the API. Manager's broad legacy staff membership cannot write the team table. Existing immutable shop/person/role and last-owner guards remain installed; Staff cannot self-promote or grant permissions.
- Owner-only APIs now protect earnings, business funnel/follower reports, promos and shop settings. Cashier is not shop finance access. Shop-ledger/payout SELECT restrictions also protect the invoker balance aggregate from ordinary vendor Staff.
- The vendor shell does not mount restricted business pages or the owner's financial dashboard for Staff. Catalog/cashier/cancellation controls respect the grants. Personal password controls remain reachable; shop open/closed and prep/settings are Owner-only under the approved defaults.
- Owner's Settings → staff roster has explicit grant/revoke controls. Staff should reload their dashboard after grants change; every API request and SQL authorization checks again, so stale visible controls are not authority.
- `/vendor/inventory` provides a dedicated stock-only screen. Its new SQL action locks product/variant rows, sets total stock to **reserved + requested available**, and preserves price, reservations and grid identity. The API normalizes both object and array composite-RPC responses and revalidates catalog caches.
- Variant reservations cannot be directly erased, stock cannot be pushed below reservations by a vendor, and reserved variants cannot be deleted. Product deletion stays archive-only. Trusted reservation/delivery/accounting workflows remain separate from direct authenticated edits.
- All three permission migrations are mirrored in bootstrap/checklist/generated parts. The splitter now avoids an extra EOF blank line in generated SQL.

### Latest fresh verification

| Check | Result |
| --- | --- |
| Vendor + prior role/API/DAL/UI/hook regressions | **58 files, 480 tests passed**, 50.60 seconds |
| `npm run test:money` | **60 PASS groups**: prior 52 plus 8 real-role delegation groups |
| `npm run test:dispatch` | **15 PASS groups** |
| TypeScript / ESLint | Passed |
| `git diff --check` | Passed |
| Three migration mirrors in bootstrap/parts | Exact text verified |

The previously allowed Staff open-sign test was updated to the explicitly approved Owner-only settings policy; the final focused suite has no failures. SQL tests execute the actual migration twice with actual `SET ROLE authenticated` and deliberately broad permissive fixture policies. They cover self-escalation/foreign-shop denial, stock/price/reservation separation, recipient-policy preservation, independent grants and revocation, owner financial reads without self-approved payout, audit retention/non-deletion, suspended-shop denial and the earlier Manager/Admin boundaries after the new migration.

Evidence is still local disposable PGlite SQL plus mocked-session API/component/hook tests. No live Supabase mutation, real-account payment, fresh browser/full-suite/build or real-PostgreSQL fresh-bootstrap certification is claimed here.

## Checkpoint 4 — finance-reporting access (scoped, not complete Manager isolation)

### Implemented locally

- Admin/Super Admin role checks now protect Money GET, financial audit GET, daily reconciliation GET, shop payout GET, full rider dossier GET, best-seller revenue GET and sales/AOV funnel GET. Export was already Admin-only. Denials happen before database/service-client access.
- Migration `202610250004_finance_reporting_access.sql` narrows **four existing reporting RPCs**: money summary, P&L, daily reconciliation and full rider overview. It changes only their entry guards, keeps the installed financial calculations unchanged, fails on missing/unexpected prerequisites and applies twice safely. `ps_is_admin()` remains unchanged.
- Seven restrictive authenticated SELECT policies protect shop ledger/payouts, rider earnings/payout requests/settlements/settlement claims and financial audit. Legacy permissive staff policies cannot bypass these. Existing permissive own-Rider and own-shop Owner reads remain necessary: these new policies do not grant otherwise-missing reads. Manager with an independent own-Rider or shop Owner account keeps only that account's existing financial entitlement, not platform reports.
- Manager roster GET and operational-save POST responses omit private `earningsBalance`. GET does not acquire a service client or load settlement-claim details for Manager. Operational cash custody, load, contact and rider status remain available.
- Admin shell blocks Money/Payouts/Payments/Reports and the full UUID rider dossier **before mounting the child page/hooks** for Manager or an unverified role. The restricted dossier notice links to rider operations and the COD-risk scorecard. The existing full dossier was not silently returned with fabricated zero finances.
- Sidebar and command palette filter the same finance routes, including saved recent commands. Manager dashboard shows today's order count rather than the sales aggregate. Staff wallet-payment controls on order detail are Admin-only; vendor/cashier PaymentCard behavior and the recipient policy are unchanged.
- Manager rider board, operational scorecards, dispatch and order routes stay mounted; the SQL operational scorecard still returns COD custody/performance facts. No settlement, payout or risk-policy write permission was added.
- Fourth migration is exactly mirrored in fresh bootstrap and generated 23 parts. Both migration checklists execute against the disposable SQL fixture and verify all four RPC guards plus seven restrictive read policies.

### Exact latest evidence

| Check | Result |
| --- | --- |
| Broad targeted Admin pages/components/APIs, Vendor components/APIs, delegation DAL and Rider hook regression | **93 files / 623 tests PASS** (83.04 seconds) |
| Actual-migration accounting and permissions suite `npm run test:money` | **67 PASS groups** |
| Dispatch SQL compatibility `npm run test:dispatch` | **15 PASS groups** |
| TypeScript, ESLint, whitespace checks | PASS after final code changes |
| Four permission migrations versus bootstrap/generated parts | Exact mirrors verified |

The expanded report restrictions initially exposed a stale funnel-recovery test fixture that mocked only broad `requireStaff` and called itself Manager. It was updated to an authorized Admin fixture plus role-aware authorization mocking; a new real-wrapper Manager denial test confirms no RPC call. Recovery/missing-schema/error-handling assertions are retained. Final broad results above have no failures. Some existing jsdom navigation / React act diagnostics occur in passing component tests; this is not browser acceptance.

### Boundary at checkpoint 4 (rider column addressed in checkpoint 5)

**Do not interpret this checkpoint as complete database financial-field isolation or deploy acceptance.** The legacy `riders` table still stores `earnings_balance` on the same row as dispatch data, and its broad staff SELECT policy has not been replaced with a column-safe operational projection. The API roster projection is not a direct-JWT database lock. A compatibility-safe database/DAL change is still required before claiming Manager cannot directly read another rider's wallet balance. Order values/COD custody remain operationally necessary; raw data minimization and other finance-derived views must be reviewed explicitly, not hidden with invented zero values. Broader Manager/Admin role/risk controls and ledger immutability review are also unfinished.

Evidence remains local disposable PGlite SQL with real `SET ROLE authenticated`, plus mocked-session API/component/hook tests. No full real-PostgreSQL fresh-bootstrap execution, live Supabase change, real-account/order/payment run, fresh browser session, full repository suite or production build is claimed.

## Checkpoint 5 — database rider wallet-column privacy

### Implemented locally

- Migration `202610250005_rider_wallet_column_privacy.sql` removes base-table SELECT and explicit `earnings_balance` column SELECT from authenticated/public/anonymous roles. Authenticated callers receive only explicit operational-column SELECT privileges; future columns are not automatically readable. Existing RLS and accounting storage are retained. No balance data is copied/moved/recomputed.
- Guarded `ps_read_riders()` returns actor-bound rider rows. Admin/Super Admin receive wallet values; a Rider receives their own wallet; Manager receives SQL NULL for other riders' wallets and can read their independently owned rider wallet. Nonstaff/non-Rider users receive no rows; anonymous execution is denied. The SECURITY DEFINER projection has a fixed search path and explicit row/field gates, not an unrestricted bypass of RLS.
- Direct `SELECT earnings_balance`, `SELECT *`, whole-row JSON, private-column predicates/sorts and `RETURNING *` are denied, including for authenticated Admin. Admin and own-Rider clients use the guarded projection / existing financial RPCs instead. Service-role accounting and job-read paths remain unchanged.
- Rider authentication and Admin rider roster now use the guarded projection. Rider creation/edit/review returns only the permitted ID from DML, then re-reads through the actor's projection, preserving authorized wallet values without a service fallback. Missing projection/schema authorization errors fail closed; Rider gate reports retryable 503 rather than claiming the authenticated person has no rider account.
- Intentional SQL NULL wallet redaction is omitted from the domain object rather than fabricated as zero. Genuine zero wallet and legacy absent-column behavior remain distinct.
- Bootstrap/generated parts exactly mirror all five migrations. Both checklists include the projection and effective private-column privilege checks. The PostgreSQL fixture now installs Supabase-style default grants BEFORE bootstrap; it must not re-grant table SELECT afterward and silently reopen the restriction.

### Exact current verification

| Check | Result |
| --- | --- |
| Full repository Vitest suite, final rerun (`npx vitest run --maxWorkers=2`) | **615 files / 4,621 tests PASS**, 330.87 seconds |
| SQL accounting/permission suite (`npm run test:money`) | **72 PASS groups** |
| Dispatch SQL compatibility (`npm run test:dispatch`) | **15 PASS groups** |
| Disposable actual PostgreSQL 18.4 full fresh bootstrap + workflows | **12 PASS groups** |
| TypeScript, ESLint and whitespace checks | PASS after final changes |
| All five migrations versus bootstrap / generated 23 parts | Exact mirrors verified |

The real PostgreSQL run creates and drops a NEW local disposable database. It verifies the full bootstrap, own-shop RLS and Shop-first Confirm/Ready, competing rider acceptance, pickup/PIN/lockout, delivery COD/accounting, settlement claim/approval, unpaid-wallet dispatch exclusion, capacity race and safe invitation withdrawal. Added actual-role privacy cases deny Manager direct column/whole-row/JSON/predicate/sort/RETURNING access, while preserving operational roster/scorecard, Admin balance and Rider self balance, foreign-Rider exclusion and repeat-safe migration application. Supabase Auth is represented by a local fixture; this is real PostgreSQL schema/RLS/workflow testing, **not** a hosted Supabase/auth-service or production-account test.

Initial full Vitest run had one stale rider-review fixture lacking the new RPC mock (614 files / 4,619 tests passed, one failed). The fixture now models the new ID-only DML plus guarded read. Its focused test passed; the subsequent entire rerun above is green. No runtime fallback to unguarded SELECT was added to make tests pass.

### Operational limits

- Existing databases need migration 005 before the new reader code. Applying it intentionally breaks old authenticated base-table `SELECT *` clients; all identified application callers were adapted. Do not later apply broad table SELECT grants over this column boundary. A schema-missing environment fails closed rather than receiving a privileged fallback.
- This closes the specific rider-wallet column hole, not every remaining role/risk/financial surface in the six-role proposal. COD custody and per-order monetary values remain available where operationally required.
- No browser acceptance or fresh production build is claimed for checkpoint 5. Preview port 3100 was preserved. No live database, real account/payment/order action, commit, push, merge or deployment was performed. APK remains deferred.

## Checkpoints 6–7 — rider controls, permanent financial history and atomic staff roles

### Implemented locally

- Migration **006** closes the legacy rider-upsert lifecycle path: POST `/api/admin/riders` is Admin/Super Admin only, and SQL rejects non-finance authenticated rider creation, identity/lifecycle/risk/profile mutations. Independent own-Rider online/availability updates remain allowed; GPS, accounting and trusted scheduler RPCs keep their definer workflows. Manager roster, dispatch and scorecards remain operational. Rider intake/edit buttons, dispatch-risk editor and auto-suspend switch are hidden from Manager; API/SQL remain the actual locks.
- Admin/Super Admin cannot directly overwrite rider cash/wallet balances or insert earnings/settlement/decision rows outside their supported finance workflows. Existing authorized adjustment, payout/settlement/dispute functions and automatic delivery accounting remain usable.
- Financial journal/paid-receipt updates, financial record deletion, parent cascades and `TRUNCATE` are guarded. Retained tables include earnings, shop ledger/payouts, settlements, payout requests, claims, disputes and audit histories. This includes normal application Super Admin access. A database owner able to ALTER/DISABLE triggers is an infrastructure authority, not constrained by an application role; no stronger guarantee is claimed.
- Shop-wallet re-netting is deliberately preserved: only a nested trusted accounting trigger may change the existing `payable` / `collected_by_shop` pair. Arbitrary direct privileged ledger edits fail. Actual full-schema PostgreSQL testing verifies late receipt verification still re-nets correctly.
- Rider control audit records actor, source role, changed fields and minimal status/user-link/licence snapshots. It does not copy KYC documents, coordinates, wallet values, customer PINs or proof URLs. Audit updates/deletes/truncation are blocked.
- Auto-suspend changes, and dispatch-policy removal/rename gaps, now enter the existing immutable `rate_change` audit. Existing rate/risk update audit behavior is retained rather than replaced.
- Migration **007** provides a **service-only atomic staff-role RPC**. Supported Admin API grants/revokes use it rather than direct service table mutation. It locks the role-change transaction, re-reads the actor's current database role, rejects self-change and unauthorized Super Admin grants/edits, preserves the last Super Admin, and writes actor/target/before/after audit in the same transaction. Audit cannot be updated/deleted/truncated. No authenticated caller can spoof the actor argument because EXECUTE is revoked from authenticated/anonymous roles.
- All `staffRoute` gates and `requireStaffRole` now request fresh role lookup before granting API authority; a positive memo on another instance does not authorize a revoked or demoted actor. A failed fresh lookup evicts the local memo. The legacy direct `requireStaff()` helper still supports its short memo for non-route callers; it is not used as cached authorization by these API wrappers.
- Missing atomic-role schema fails closed with 503; SQL denial maps to 403. No fallback to unaudited direct upsert/delete is provided. Existing rank/self guards and target cache invalidation remain defense in depth. SQL enum compatibility is tested against the real schema, not just the reduced text-role fixture.

### Exact final evidence for this checkpoint

| Check | Result |
| --- | --- |
| Entire Vitest suite after final source changes | **617 files / 4,633 tests PASS**, 302.83 seconds |
| SQL accounting/permission suite | **79 PASS groups** |
| Dispatch SQL compatibility | **15 PASS groups** |
| Real PostgreSQL fresh bootstrap/workflows | **15 PASS groups** |
| Chromium dashboard/permission contracts | **10 / 10 PASS**, 21.6 seconds |
| Fresh production build | **PASS** |
| TypeScript, ESLint, whitespace checks | **PASS**, no lint warnings in final run |
| Seven permission migrations versus fresh bootstrap / generated 23 parts | Exact mirrors verified |

Real PostgreSQL adds a concurrent **cross-demotion** test: two Super Admin sessions attempt to demote each other; only one succeeds, a Super Admin remains, and exactly one actor-bound audit row is written. Rider-control, direct-balance, rewrite/delete/cascade/TRUNCATE denials and legitimate shop-wallet re-netting are also exercised. Both migration checklists execute in the disposable SQL fixture and recognize the new prerequisites.

Browser checks use an explicitly fake backend URL and intercepted API fixtures, **not production accounts or payments**. They cover customer/rider/shop profile compatibility, invitation acceptance, Shop-first Confirm/Ready, dispatch invitation counts and recovery, real unauthenticated API denial, Manager direct financial navigation without financial requests, Manager operational roster without intake/edit, and Admin authorized controls. They do not certify hosted Supabase Auth, native Android/device behavior, full storefront E2E or all six-role combinations. Final unit checks additionally cover Manager dispatch-editor/policy-switch visibility.

Browser setup initially lacked native NSS libraries, then development HMR rejected the local 127.0.0.1 origin. Bundled disposable browser libraries were used; `allowedDevOrigins` now explicitly includes localhost/127.0.0.1 alongside the Arena preview host. No production CSP was weakened or bypassed. The final dashboard run was green. Temporary verification servers are stopped after use; no fake-backend server is left as the user's live site.

### Scope / rollout limits

- Install migrations **001–007 in order**, after their existing prerequisites, before this application code. Keep the new column ACL restriction intact; do not re-grant broad authenticated SELECT on riders. Role-change API specifically requires 007 and its service EXECUTE grant.
- Audit guarantees cover the supported application role-change workflow and normal financial/control DML. Direct database-owner/service maintenance or bootstrap grants are infrastructure operations, not a certified substitute for that audited API.
- These are completed local boundaries with broad regression evidence, **not blanket six-role or production-security certification**. Financial history protection deliberately prevents destructive cleanup of financially referenced entities; operational cleanup must not assume cascades can erase their history.

## Checkpoint 8 — prevent Rider/contact knowledge from bootstrapping a customer PIN

### Verified finding, not an inferred production incident

The existing `riderOrderView()` removed `deliveryCode` but retained the customer `trackToken` created by the shared mapper. Separately, public `/api/track` returned both PIN and a freshly minted tracking token to callers who knew only order ID and phone. Those values are deliberately available to an accepted operational rider. Push enrollment also accepted that contact pair alone, and subsequent milestone pushes supplied a signed customer tracking capability.

A new route-level regression file using the actual route and actual token gate/crypto reproduced **5 failed / 2 passed** before the fix. These are local fixture regressions, not evidence of exploitation or a test against real customers. Source inspection also found that TrackView did not forward the confirmation URL's `t` token to its lookup request; simply adding an API token requirement without fixing that client would have removed legitimate receipt access.

### Implemented

- Rider views strip **both the PIN and the customer tracking capability**, in offered, accepted, picked-up and historical assignment states. Existing contact/coordinate disclosure rules remain: an accepted/picked-up job gets its own delivery contacts, an invitation does not.
- Manual order-ID + matching-phone tracking still returns status and the public milestone timeline, under the existing durable budgets. Without a valid signed token it now returns **no PIN, no fresh tracking token, no private payment reference, no proof-photo URL and no timeline notes**. The route uses a separate projection rather than mutating the source order.
- Correctly signed confirmation links retain customer PIN, reference, proof and timeline-note access. Wrong-order, invalid and absent tokens cannot promote a manual lookup. This intentionally narrows the old manual lookup's private-data access; it does not change order state, prices, stock, payment decisions, PIN generation/verification, delivery accounting or counter location.
- Push enrollment requires the matching order/phone **and valid signed capability** before saving a device. Mere operational knowledge cannot enroll a new recipient. Unknown/mismatched orders retain the existing generic 404 behavior.
- Milestone push payloads no longer deliver signed PIN capabilities to **legacy subscriptions**, whose original enrollment proved only phone + order number. They retain status notification links. A legitimate customer's matching saved receipt supplies the token when the notification opens their tracker. Removing the token only from the Rider JSON would not have closed this secondary route.
- TrackView forwards confirmation-link proof on initial lookup and polling, and recovers matching unexpired local receipt proof. Proof is bound to its original order **and normalized phone**: editing either field, or loading a different saved order, never attaches the old proof.
- Without private PIN data, the map presents Bengali/English confirmation-link guidance instead of a fabricated/masked-code-as-if-verified UI. The current-order banner does not advertise a PIN that was not returned. Existing signed checkout receipt behavior is retained.

### Evidence for checkpoint 8's final functional state

| Check | Result |
| --- | --- |
| Focused tracker/Rider/push regression run | **20 files / 144 tests PASS** before final additional manual private-field assertions |
| Entire final Vitest suite | **618 files / 4,647 tests PASS**, 334.63 seconds |
| Production build | **PASS** |
| TypeScript / ESLint / whitespace checks | **PASS** |
| Browser / real PostgreSQL rerun for checkpoint 8 | **Not run**; checkpoint 7's browser 10/10 and PostgreSQL 15-group results remain historical evidence, not new checkpoint 8 coverage |

The 14 additional tests cover the 7 public API capability cases, 5 receipt-token client binding cases and 2 bilingual restricted-PIN guidance cases. Existing rider-view tests now assert token omission, the polling test asserts proof is preserved across refresh, and push tests assert legacy payloads do not carry capabilities. Logs: `/home/user/permission-eight-{before,focused,full-suite,build,types,lint}.log`.

No SQL migration was added in checkpoint 8; the migration/bootstrap baseline remains 001–007. No running verification server was needed or left behind in this checkpoint.

## Checkpoint 9 — staff/SQL PIN isolation and verified Traffic Point collection

### Implemented locally

New migration **`202610260001_order_pin_privacy_and_pickup.sql`** followed permission migrations 001–007 (the eighth permission migration at checkpoint 9). It is mirrored exactly in the fresh bootstrap and generated parts; checkpoint 10 later added a ninth migration and the current generated count is 24 parts. Both main SQL checklists recognize the new boundary; the older wallet-cancellation source check follows the preserved private order-machine implementation instead of incorrectly reporting its public wrapper as an obsolete installation.

**PIN reads and capability issuers**

- Authenticated base-table access cannot SELECT the stored `orders.delivery_code`, including App-role Super Admin. Table-wide SELECT and explicit PIN-column SELECT are revoked first. Non-secret operational columns remain readable under the original order RLS. Whole-row/JSON reads and PIN predicates/sorting are denied, not merely hidden in the UI.
- `order_operations` is a **security-invoker view** over explicit operational columns, with a NULL `delivery_code` placeholder. It preserves the original own-shop/staff/customer row rules instead of using a definer read that bypasses RLS. It is SELECT-only for application clients.
- Admin, shop, dispatch, failed-delivery and rider-feed full-order reads use this view. Shared mapping defaults to **no PIN and no tracking token**, even if an old cached/stub row contains a PIN. Only the service-backed checkout/tracking customer mapping explicitly opts into customer proof. The existing public tracking route then enforces checkpoint 8's signed-token disclosure rule.
- Every installed order-composite mutation RPC has all `return v_order` paths projected without the PIN, including idempotent returns. The migration aborts on an unexpected order-returning body rather than silently overlooking a new/unrecognized return pattern. Stored customer codes and the accounting/state logic are not replaced.
- Staff WhatsApp status/generic links ignore any cached PIN or customer token. Outbox generation no longer mints capabilities. The migration strips the existing canonical `&t=<24 hex>` capability from old persisted drafts, and a trigger sanitizes that field for stale writers too. It does not rewrite other message content or claim that a draft was delivered.
- Direct authenticated order INSERTs and explicit PIN/attempt/lockout UPDATEs are denied; trusted checkout and verification functions retain their execution context. Even setting the secret to a guessed **unchanged** value is denied, so UPDATE success cannot be used as a PIN oracle.

**Counter collection without showing the expected code**

- **Traffic Point remains the pickup counter**. No shop-counter location was chosen or substituted.
- Staff enter the customer's 4-digit PIN into a masked input; the server verifies it. The list links to this verification form rather than performing an unchecked Delivered action. The detail page no longer displays the stored PIN. New instructions are Bengali/English.
- `ps_collect_pickup_order` requires a live staff identity (Manager/Admin/Super Admin), locks the order, accepts only a ready non-return pickup, requires verified wallet payment where applicable, and refuses accepted/picked-up rider custody. Own-shop membership alone does not grant platform counter authority.
- Wrong guesses **return a failure outcome rather than raising**, so the attempt increment commits. Five failures impose a 15-minute lock even on a correct subsequent code; after expiry the next failed guess starts a fresh budget. Direct attempts to reset the counter/lockout fail.
- A correct PIN withdraws only pending invitations and runs the existing state machine to completion in **one transaction**. There is no multi-request fallback. History records the real actor and a generic verification note, not the submitted/stored PIN. Retries serialize on the order lock and do not create duplicate delivery history or accounting.
- The existing machine was retained as a private function. Public `ps_advance_order` cannot move a pickup through rider-path/delivered states to bypass proof; direct table status edits remain guarded. The private machine has no PUBLIC/anonymous/authenticated/**service_role** EXECUTE grant. The new function calls it only inside the authorized verification transaction.
- Missing verification schema fails closed with 503. Unrelated transactional failures are not misdiagnosed as a missing migration. Unexpected response shapes are rejected, not treated as successful verification. API diagnostics do not log the submitted PIN.

### Exact final evidence

| Check | Result |
| --- | --- |
| Final complete Vitest suite | **618 files / 4,652 tests PASS**, 326.53 seconds |
| Final production build | **PASS** |
| Final TypeScript / ESLint / whitespace checks | **PASS**, no lint warnings |
| Embedded PostgreSQL money/permission integration | **87 PASS groups** |
| Real PostgreSQL 18.4 full-schema workflows | **20 PASS groups** |
| Dispatch SQL integration | **15 PASS groups** |
| Final Chromium dashboard/customer contracts | **12 / 12 PASS**, 24.9 seconds |
| Eight migration bodies at the checkpoint-9 baseline | **Exact mirrors verified** |

The real PostgreSQL additions exercise Manager/Admin/Super Admin/Owner/Rider PIN denial; default Shop Staff safe reads and Confirm/Preparing; foreign-shop RLS; denied private-machine service execution; persistent wrong-PIN lockout; two real concurrent staff handovers yielding exactly **one delivered history row, one shop ledger row and no rider earnings**; and no numeric PIN in generated handover history. A forced failure at the final Delivered update proves **all intermediate states, history and pending-invitation withdrawal roll back**. A successful retry then completes collection. It also tests old outbox cleanup, sanitization of stale writes, masked payment-verification return and repeat-safe migration/checklist behavior.

The browser suite includes the new Manager counter form at 390px, disabled empty-PIN submission, correct PIN payload (no forged exception/note), the resulting delivered screen, customer receipt-token forwarding and restricted manual lookup, alongside the existing customer/shop/rider/dispatch/financial-navigation checks. Browser API data is explicitly intercepted fixture data, except the real unauthenticated denial checks. These are **not hosted authenticated account/payment/device acceptance tests**. Temporary browser and private PostgreSQL verification servers were stopped after testing; no fake-backend preview is left running.

Relevant evidence logs: `/home/user/permission-nine-{full-suite,build,types,lint,money,postgres,dispatch,browser}.log`. The latest small SQL-only test additions were rerun against both PostgreSQL harnesses after the application suite/build; they did not change the application or migration bodies.

## Checkpoint 10 — independent mixed-role shop fulfilment

### Defect reproduced before the change

The final cross-role review found a concrete mixed-role failure, not a theoretical one. If the same user was a platform **Manager/Admin/Super Admin** and also an **Owner/Staff of a shop**, the vendor dashboard's Confirm/Preparing/Ready request called the platform entry point `ps_advance_order`. That entry correctly treats the caller as platform staff: Manager is refused, Admin/Super Admin are pushed into the emergency-override reason path, and the person's independent shop membership never gets to act as a shop. The regression test failed with `forbidden: shop fulfilment belongs to the shop` before the fix.

### Implemented locally

- New migration **`202610260002_scoped_shop_fulfilment.sql`** clones the installed private order machine into `ps_advance_order_scoped(..., p_shop_actor boolean)`, forcing `v_is_admin = false` only for the explicit shop lane. It reuses the one audited state/payment/stock/accounting body instead of duplicating it.
- `ps_vendor_advance_order` is the only public shop-lane entry. It requires a live `auth.uid()`, an allowed shop target, an order lock and current active own-shop membership, then calls the private scoped machine. Caller notes are ignored, so the shop lane cannot forge an Admin override note; the returned row masks the PIN.
- `ps_advance_order_scoped` has **no EXECUTE** grant to PUBLIC, anon, authenticated or service_role. The platform `ps_advance_order` and its Admin/Super-Admin reason guard are unchanged, and Manager still cannot use the platform override.
- The vendor DAL now calls `ps_vendor_advance_order`; the pre-two-tap legacy fallback also stays inside the scoped wrapper. A missing shop-lane RPC returns **503 naming the migration** and does not fall back to the platform entry point.
- Both migration checklists recognise the public and private entry points; the fresh bootstrap and all 24 generated parts contain the exact migration body.

Coverage exercises six role combinations (`manager`, `admin`, `super_admin` × shop `owner`, shop `staff`) plus a rank-only user: own Confirm/Preparing/Ready; explicit Staff cancellation; Owner cancellation; foreign-shop, dispatch-target, unverified-payment and suspended-shop denial; the platform exception lane unchanged; forged override note absent from history; direct private-RPC, anonymous and service-role denial; migration repeat-safety.

### Exact final evidence

| Check | Result |
| --- | --- |
| Final complete Vitest suite | **618 files / 4,655 tests PASS**, 426.12 seconds |
| Final production build | **PASS** |
| Final TypeScript / ESLint / whitespace checks | **PASS**, no lint warnings |
| Embedded PostgreSQL money/permission integration | **95 PASS groups** |
| Real PostgreSQL 18.4 full-schema workflows | **21 PASS groups** |
| Dispatch SQL integration | **15 PASS groups** |
| Final Chromium dashboard/customer contracts | **12 / 12 PASS**, 29.1 seconds |
| Nine migration bodies against bootstrap + 24 generated parts | **Exact mirrors verified** |

Relevant logs: `/home/user/permission-ten-{full-suite,build,types,lint,money,postgres,dispatch,browser}.log`. The browser server, Chromium extraction and disposable PostgreSQL instance were stopped after the run; no verification server is left listening.

## Checkpoint 11 — same-actor finance decisions

### Why this boundary

The checkpoint-10 review identified a concrete conflict: the finance RPCs authorize Admin/Super Admin by platform rank without comparing the deciding actor with the Rider/Shop account that receives the money. A staff member who also holds that account could therefore approve or settle their own money. That contradicts the approved model (Rider: no self-approval; Shop Owner: no self-approved payout) and was recorded as a remaining decision in the checkpoint-10 report. Checkpoint 11 closes the exact same-person case. It does **not** claim four-eyes control against two people colluding, and it deliberately does not change who else may approve, the amounts, the accounting, or the audit rows.

### Implemented locally

- New migration **`202610260003_finance_self_dealing_boundary.sql`** adds `ps_guard_self_finance(target_rider)`, which raises when the target rider is the caller's own Rider row (`ps_rider_id()`), and inserts that single call into the five installed finance bodies:
  - `ps_admin_decide_rider_payout` — cannot approve/reject their own payout request;
  - `ps_admin_settle_rider` — cannot clear their own cash custody;
  - `ps_admin_reject_settle` — cannot decide their own settle claim;
  - `ps_admin_adjust_rider` — cannot credit/debit their own wallet;
  - `ps_admin_resolve_dispute` — cannot decide their own dispute.
- The patch reuses each installed accounting body, verifies the anchor appears exactly once, and fails closed on an unexpected body. Re-running changes nothing (marker-guarded and repeat-tested).
- `shop_payouts` gains `trg_shop_payout_self_dealing`: a row whose `paid_by` is an **Owner of that same shop** is refused, including when that Owner also holds Admin access. The trigger is `SECURITY DEFINER` so `vendor_users` RLS cannot hide the ownership row; it exposes no data and only raises. Legacy rows or inserts without `paid_by` are unaffected. A different finance Admin records the line.
- The app maps the new refusals to clear 403s instead of generic errors: payout decision, cash settlement, settle-claim decision, dispute decision, wallet adjustment and the shop payout API all name the peer-review requirement.
- Both migration checklists recognise the helper, all five patched bodies and the payout trigger; the fresh bootstrap and all 24 generated parts mirror the exact migration body.

### Exact final evidence

| Check | Result |
| --- | --- |
| Final complete Vitest suite | **618 files / 4,659 tests PASS**, 534.13 seconds |
| Final production build | **PASS** |
| Final TypeScript / ESLint / whitespace checks | **PASS**, ESLint no warnings |
| Embedded PostgreSQL money/permission integration | **103 PASS groups** |
| Real PostgreSQL 18.4 full-schema workflows | **22 PASS groups** |
| Dispatch SQL integration | **15 PASS groups** |
| Final Chromium dashboard/customer contracts | **12 / 12 PASS**, 34.4 seconds |
| Ten migration bodies against bootstrap + 24 generated parts | **Exact mirrors verified** |

The real PostgreSQL group creates an Admin who is also a Rider and a Shop Owner, and a second Admin. Every self-directed call is refused (`cannot decide your own money` / `cannot record a payout for your own shop`); the peer Admin then completes the payout, wallet correction, cash settlement, claim decision, dispute decision and shop-payout record. The same migration is re-applied on the full schema to prove repeat-safety, and both checklists are executed.

Relevant logs: `/home/user/permission-eleven-{full-suite,build,types,lint,money,postgres,dispatch,browser}.log`. The temporary browser and private PostgreSQL servers were stopped after the run; none is left listening.

### Current permission coverage summary — not blanket production certification

| Actor | Locally implemented boundary retained/verified |
| --- | --- |
| Shop Owner | Own-shop fulfilment/catalog/authorized own finance and team scope; no platform finance, self-approved platform payout or recording of its own payouts; no operational stored PIN/customer token |
| Shop Staff | Default own-shop Confirm/Preparing/Ready; cancellation/catalog/inventory/cashier grants stay explicit; no default finance/team/pricing or counter authority; no stored PIN |
| Rider | Own offers, contacts after acceptance, delivery proof/PIN verification/COD and own wallet/claims; no customer PIN capability, balance rewrite or approval authority |
| Manager | Operations/dispatch/support plus PIN-verified Traffic Point handover; no platform finance/payment/payout/role/risk controls or stored PIN |
| Admin | Authorized approvals and audited fulfilment exceptions; no deciding money that belongs to their own Rider/Shop account, arbitrary ledger/balance rewrite, self-escalation, Super Admin grants or stored PIN |
| Super Admin | Authorized staff/security decisions with last-Super safeguards and audit; same-actor finance refusal, no ledger erasure or stored PIN |
| Customer tracking (separate consumer capability) | Receipt/saved-receipt proof retains PIN; manual phone/order lookup remains available without private proof fields |

A database owner who can ALTER triggers/grants is an **infrastructure authority**, not an application Super Admin. These controls do not purport to constrain that authority. Checkpoints 10–11 cover the independent Shop Owner/Staff × platform-rank fulfilment branch and the exact same-person finance case. Two staff members colluding, or a second Admin knowingly approving a related party, remain outside this boundary; other independent memberships keep the branches covered earlier. This summary still does not certify every possible multi-role combination or hosted configuration.

## Decision recorded — Traffic Point remains the pickup location

**Owner instruction, 2026-10-27:** “Traffic Point, not shop location.” The previously unresolved shop-counter option is therefore rejected; no physical location or fulfilment semantics change.

- Counter pickups continue to be collected at **Traffic Point, Sunamganj Sadar** on the existing hub coordinates. No order field, status, accounting or COD behaviour changed.
- The decision now has one source of truth, **`src/lib/pickup-location.ts`** (`PICKUP_LOCATION_KIND = "traffic-point"`, label/line from the existing `SUNAMGANJ_HUB`). The staff handover form reads its bilingual line from that module instead of a hard-coded string.
- A regression test (`src/lib/__tests__/pickup-location.test.tsx`) pins the value and the pickup-facing screens: checkout summary, customer tracking, Admin order detail, vendor order detail and the staff handover must name the approved hub and must not render the shop's own address as the collection point. It also re-asserts that the stored PIN never reaches the screen.
- Existing copy already said Traffic Point in all of those places, so this is a guard against drift — not a location migration. The shop address is still shown where it legitimately belongs (shop profile/storefront), never as pickup instructions.
- The PIN-verified handover semantics from checkpoint 9 are unchanged: staff enter the customer's 4-digit code, the server verifies it, attempts/lockout persist, and the stored code is never displayed.

Verification for this decision: the full suite is **619 files / 4,662 tests PASS** (539.37 seconds), with typecheck, build, ESLint (no warnings) and `git diff --check` all PASS; logs in `/home/user/pickup-{full-suite,types,build,lint,diffcheck}.log`. After the final documentation edits the SQL suites and browser contracts were re-run: money **103 PASS groups**, real PostgreSQL **22 PASS groups**, dispatch **15 PASS groups**, browser **12/12 PASS** (37.3s) — `/home/user/final-{money,postgres,dispatch,browser}.log`. Publishing, database rollout and hosted acceptance still require separate authorization.

## Remaining acceptance / rollout work

1. **Historical bearer-token/recovery decision — now an operator switch, still a policy call:** old capabilities already copied into a browser, sent WhatsApp link or other external location cannot be recalled by removing current API fields or cleaning stored drafts. The versioned design that used to be missing now exists (`src/lib/track-token.ts`, 2026-10-27): `TRACK_TOKEN_TTL_HOURS` mints expiring v2 links, `TRACK_TOKEN_REVOKE_LEGACY=1` refuses the timeless v1 links, and rotation of `TRACK_TOKEN_SECRET` remains the all-or-nothing incident response. Default behaviour is byte-identical to before, so **no link breaks until the owner chooses**. The rollout order and costs are in `docs/go-live.md` (“Old tracking / receipt links”). Still to decide: whether to set a TTL (and how long), and whether/when to revoke legacy links — the latter needs a support plan because a customer whose only receipt copy is an old link loses the PIN display. There is no claim of actual production exposure.
2. **PIN-recovery decision:** the checkout receipt is now the only place a customer can see the 4-digit code; manual lookup hides it and staff screens never show it, so a customer who loses the receipt on another device cannot complete a **counter** pickup. No re-issue endpoint exists because every candidate carries a real risk: OTP needs a funded SMS/WhatsApp gateway (none configured), account-based display lets an OTP-free phone claim read a future order's PIN, and staff-assisted reset reopens social engineering. Documented in `docs/go-live.md` (“Known gap”); the owner must choose before counter pickup is promoted, and until then receipt-on-device or home delivery is the safe path.
3. Complete the hosted six-role/platform acceptance review. The independent shop-membership fulfilment branch (checkpoint 10) and the exact same-person finance case (checkpoint 11) are now closed locally. Still open by design: two staff members can collude, and a second Admin can knowingly approve a related party; no four-eyes quorum or conflict-of-interest declaration exists. Other hosted Supabase/realtime/auth configuration is also untested locally. Local SQL tests stub the auth service while using real PostgreSQL roles/RLS; intercepted browser fixtures are not live-account evidence.
4. Existing databases must apply **001–007, then `202610260001_order_pin_privacy_and_pickup.sql`, then `202610260002_scoped_shop_fulfilment.sql`, then `202610260003_finance_self_dealing_boundary.sql`**, after their prerequisites, **before** the new application is published. Do not restore broad authenticated table SELECT on orders/riders. Old counter clients must refresh to the new PIN form; old vendor clients lack the scoped shop lane, so mixed-role operators must refresh too. There is intentionally no unsafe legacy fallback. `/api/health` now probes eight of the ten files from the live database and its `nextSteps` names the exact missing file in order; `202610250002` (trigger) and `202610250004` (policies/guard rewrites) are not visible through PostgREST and are covered by `supabase/check-migrations-all.sql` rows 95 and 97a–97k instead.
5. Publishing, live database rollout and real account/order/payment acceptance still require separate authorization. This work is committed and opened as a pull request on `arena/bcb37d54-bhromor`; nothing has been merged, deployed or run against a live database, and the APK remains paused.

## Post-PR follow-up (2026-10-27, PR #50 left open and unmerged)

Two items that were still open when the permission batch was pushed are now closed locally; nothing was merged, deployed or run against a live database.

1. **Tracking/receipt link expiry (was: “design missing”).** `src/lib/track-token.ts` now mints a version-2 token (`2.<issuedAt base36>.<ttlHours base36>.<mac24>`) when `TRACK_TOKEN_TTL_HOURS > 0`, and verifies the timestamp and lifetime from the MAC — editing either field cannot revive an expired link. `TRACK_TOKEN_REVOKE_LEGACY=1` refuses v1 tokens; unset keeps the original 24-hex token byte-identical, so no existing receipt changes behaviour. A v2 lifetime stays with the token even if the variable is later removed or raised. Covered by `src/lib/__tests__/track-token.test.ts` (14 tests, including tamper, expiry, clock-skew and configuration-change cases). Documented in `docs/go-live.md` and `.env.example`.
2. **Migration rollout visibility.** `/api/health` gained eight `*Ready` probes for the permission batch (`ps_can_manage_finance`, `vendor_users.permissions`, `ps_read_riders`, `rider_control_audit`, `staff_role_audit`, `order_operations`, `ps_vendor_advance_order`, `ps_guard_self_finance`) plus `ROUND_MIGRATION_WHY` sentences, so a half-applied rollout names the file to run in the existing `nextSteps` loop. `src/lib/__tests__/migration-probes.test.ts` (5 tests) pins that every named file exists, that the order list covers every key, and that the permission files stay chronological. The two files PostgREST cannot observe (`202610250002`, `202610250004`) are called out in code and docs and stay covered by `check-migrations-all.sql`.

Verification for this follow-up (2026-10-27): full Vitest **620 files / 4,679 tests PASS** (447 s, `/home/user/final2-full-suite.log`); `npx tsc --noEmit` PASS; `npx eslint src --max-warnings=0` PASS; `npm run build` PASS; `git diff --check` clean (`/home/user/final2-{build,lint}.log`). SQL and browser re-runs on the same tree: money **103 PASS groups** (`final2-money.log`), real PostgreSQL 18.4 **22 PASS groups** (`final2-postgres.log`), dispatch **15 PASS groups** (`final2-dispatch.log`), dashboard browser contracts **12/12 PASS in 11.9 s** (`final2-browser3.log`). The browser run needs a **production build**; under `next dev` the staff CSP (no `unsafe-eval`) stops staff pages from hydrating and 6 contracts time out — recorded in `docs/browser-qa.md`. That is a test-environment fact, not an app regression: the same spec passes 12/12 against `next start`.

The previously listed staff-side PIN projection and proof-free Traffic Point handover work is now implemented and covered locally. The physical pickup location is **settled** (see the decision record below), not merely unchanged by default. The remaining steps above are not represented as completed.
