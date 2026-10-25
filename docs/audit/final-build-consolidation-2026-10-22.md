# Final build consolidation — O22–O24 ও remaining acceptance

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

“Now build the rest” অনুযায়ী remaining locally reproducible follow-ups একত্রে implementation, dependency review এবং fresh application/browser/SQL regression checks। এটি production deployment বা সব সম্ভাব্য workflow/defect exhaustive certification নয়। Historical dirty work preserved; no push/deploy।

## এই batch-এ completed

### O22 — Admin successful malformed RPC body-কে analytics বানানো

Vendor [O21 RPC validation](funnel-rpc-validation-2026-10-22.md)-এর counterpart পরীক্ষা করে নিশ্চিত হয়েছে: `funnelReport()` raw success body সরাসরি forgiving `parseFunnelReport()`-এ দিত। Null/partial/invalid data zero/coerced metrics হতো। Parser raw `days` ব্যবহার না করে requested days বসাত; wrong-window raw report-ও client-এর expected days পেত।

**Fix:** নতুন `src/lib/funnel-rpc-validation.ts` migration `202609260004_storefront_events.sql`-এর actual JSONB output contract যাচাই করে, parser চালানোর আগে:

- Required finite numeric snake_case fields, bounced/repeat/home session counts এবং exact 7/28-day echo।
- Explicit nullable finite SQL AOV; null AOV existing parser-এর মতো display value 0 হয়।
- Source labels/counts, search query/count/max_results এবং scroll depth/session rows। Invalid row silently filter/coerce হয় না।
- Full valid zero ও populated reports accepted; extra fields harmless। Numeric strings/missing fields legacy repair হিসেবে accepted নয়।

`src/lib/db/reports.ts` guard failure-এ generic internal validation error দেয়। Existing route/staff wrapper এটিকে safe generic HTTP 503 করে; `missing:true`, raw diagnostic বা fabricated report নয়। Actual route → `apiGet` → rendered card tests error/Retry এবং পরে genuine empty recovery নিশ্চিত করে। SQL এবং existing rates/money calculations বদলায়নি।

### O23 — Admin missing-schema text explicit operational code override করত

Controlled error `{code:'57014',message:'function public.ps_funnel_report does not exist in timeout diagnostic'}` আগে missing-migration error হতো। এটি actual deployed diagnostic/incident হওয়ার দাবি নয়; code precedence problem-এর regression fixture।

**Fix:** Existing schema codes `PGRST202`/`42883`/`42P01` বজায়; code অনুপস্থিত/empty হলেই target function/table explicit missing text fallback। Explicit non-schema code আর text দিয়ে override হয় না। Uncoded target-function schema-cache absence-ও supported। Auth 401/403, rate limiting/Retry-After, day parsing এবং no-store safe error envelope unchanged। Staff authorization implementation/RLS বা route wrapper বদলায়নি।

### O24 — Old pending poll পরবর্তী enabled/interval lifetime আটকে রাখত

`usePoll()`-এর pending ref effect cleanup-এর পরেও বহাল থাকত। Old callback unresolved → disable/re-enable with new callback বা interval replacement → new poll শুরু হতো না। Old completion shared lock ছাড়ত; সেই ref শুধু blindly reset করলে old completion newer pending poll unlock করতে পারত।

**Fix:** Pending lock effect lifetime-এর local state; cleanup marks old ticker inactive। New enabled/interval lifetime নিজস্ব lock পায়; old resolve/reject নতুন lock পরিবর্তন করে না। Same active lifetime-এ pending refresh deduplicated; visibility/focus/interval, latest callback এবং sync/rejected error recovery unchanged।

**Limit:** Promise cancel করা হয়নি। Old lifetime-এর underlying request চলতে পারে; consumer-এর own response ownership guards এখনও প্রয়োজন। Same active lifetime-এ never-settling operation-এর arbitrary timeout/overlap policy যোগ করা হয়নি। Silent identity change while `enabled=true` detect করার নতুন identity API-ও নয়।

## Application/test changes

Application edits:

- `src/lib/funnel-rpc-validation.ts` — pure admin raw JSONB guard।
- `src/lib/db/reports.ts` — guard ও bounded missing-schema classification; best-seller business logic untouched।
- `src/lib/use-poll.ts` — effect-owned pending lock ও inactive tick protection।

**67 new permanent tests:**

| File | New tests |
| --- | --- |
| `src/lib/db/__tests__/admin-funnel-rpc-validation.test.ts` | 34, required-field invalid-value matrices-সহ |
| `src/app/api/__tests__/admin-funnel-server-recovery.test.tsx` | 29, actual DB helper/route/wrapper/client/card controlled integration-সহ |
| `src/lib/__tests__/use-poll-lifetime-recovery.test.tsx` | 4, disable/re-enable, interval replacement, old resolution/rejection isolation |

Initial pre-fix DB/poll run: **35 FAIL / 3 PASS**, 38 scenarios। New API tests ও previous card/poll/best-seller tests-সহ focused run: **7 files / 104 tests PASS**, 6.51 s। No old assertions deleted to manufacture success। Auth provider/rate-limit decision/service responses mocked in integration tests; actual account/RLS/transport certification নয়।

## Fresh final verification

| Check | Result |
| --- | --- |
| Focused new + related regressions | **104/104 PASS**, 7 files |
| ESLint | PASS |
| TypeScript | PASS, final post-browser rebuild-এর পরেও |
| Production build | PASS, browser verification-এর পরে final production rebuild-সহ |
| Full Vitest suite | **584 files / 4,125 tests PASS**, 634.18 s |
| Embedded dispatch PostgreSQL/PGlite | **15 PASS groups** |
| Embedded rider-money PostgreSQL/PGlite | **35 PASS groups** |
| Browser recovery, 320/390/1280 px | **12/12 PASS**, 35.2 s |
| Browser dashboard contracts + selected actual unauthenticated denial | **7/7 PASS**, 28.7 s |
| Production dependency audit | **0 vulnerabilities** |
| Full dependency audit | **8 development entries**, 5 high / 3 moderate; still open |
| `git diff --check` | PASS |

Browser runs used isolated Next dev server with `verification.invalid` placeholders and Chromium 153, real hooks/components, controlled API fixtures except selected actual unauthenticated denials। Test server stopped afterward। These are fresh reruns, not newly authored browser scenarios or real authenticated acceptance। Dev React/CSP eval diagnostics appeared; CSP was not weakened to suppress them and no production CSP defect is inferred from those dev messages। Production build/types rerun after stopping browser server to leave final build verification separate from dev fixtures।

SQL tests use disposable minimal schemas and actual migration files, not the production database or full deployed concurrency。 Existing permission/money/dispatch definitions remain unchanged।

Logs in workspace (not Git artifacts):

- `/home/user/rest-final-{red,green,full-suite,lint,types,build,types-final,build-final,production-audit}.log`
- `/home/user/rest-final-{dispatch,money,browser-recovery,browser-dashboards}.log`
- `/home/user/rest-dependencies-before.json`

## Consolidated implementation ledger

| Findings/work | Status / evidence |
| --- | --- |
| O01–O04 order/resource recovery | Delivered; [orders report](orders-recovery-2026-10-22.md) |
| O05–O12 vendor/rider identity, tracking/GPS, money recovery | Delivered; [remaining recovery report](remaining-recovery-2026-10-22.md) |
| O13/O14 vendor client lifecycle/migration recovery | Delivered; [vendor report](vendor-funnel-recovery-2026-10-22.md) |
| O15/O16 admin client lifecycle/migration recovery | Delivered; [admin report](admin-funnel-recovery-2026-10-22.md) |
| O17/O18 browser report payload validation | Delivered; [payload report](funnel-payload-recovery-2026-10-22.md) |
| O19/O20 vendor server availability/classification | Delivered; [availability report](funnel-server-availability-2026-10-22.md) |
| O21 vendor raw RPC contract | Delivered; [vendor RPC report](funnel-rpc-validation-2026-10-22.md) |
| O22/O23 admin raw RPC/classification | Delivered in this batch |
| O24 poll lifetime recovery | Delivered in this batch |
| S01 dev dependency security | Originally open; **closed 25 October** — [current verified closure](development-security-closure-2026-10-25.md) |

Previous storefront/mobile/copy/navigation/accessibility phases remain preserved; this batch does not claim their manual device acceptance from automated checks alone। Historical per-batch reports retain their original scope/result counts; this report is the current consolidation, not a rewrite of those runs।

## S01 — Fresh upstream review, no unsafe forced remediation

Fresh `npm audit --json` still reports **8 development package entries, not 8 independent proven exploits**:

- Next ESLint → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`: five high entries। Registry latest braces remains **3.0.3**; checked Next plugin **16.4.2** still pins fast-glob **3.3.1**।
- Capacitor CLI **8.5.3** → `xcode@3.0.1` → `uuid@7.0.3`: three moderate entries। Current registry CLI remains **8.5.3** with xcode `^3.0.1`।

Audit suggests Next ESLint **14.2.35** and Capacitor CLI **8.4.3**, outside current declared ranges; xcode **4.0.0** exists but is a cross-major transitive change। Native Xcode/Android acceptance is not available here। No `npm audit fix --force`, arbitrary uuid/xcode override, lint-chain removal, unreviewed local dependency patch or incompatible downgrade was applied merely to obtain a green audit। Repository dependency manifests unchanged in this batch।

**Next safe action:** adopt verified upstream patches when available, or separately validate an explicit tooling migration with native/CI acceptance। Until then, keep tooling on trusted source/config inputs, do not expose development/test servers as production services, and retain separate production/full-audit visibility। Dev-only does not mean harmless; production-only zero does not close S01।

## What still requires external acceptance / decisions

1. **Staging accounts and configured services:** actual staff/vendor/rider/customer roles/RLS, wallet/payment callbacks, order/return/settlement flows, notification delivery and deployed concurrency। Use dedicated test accounts/data; no production financial writes were performed here।
2. **Physical devices / accessibility / performance:** Android native shell, background/physical GPS, push delivery, TalkBack/VoiceOver and full WCAG/CWV acceptance। Browser fixtures/PGlite are not substitutes।
3. **Original map/scroll/image incident:** exact URL, screenshot, viewport and state still needed to claim that original incident reproduced/resolved। Earlier scoped fixes are not asserted to be that incident without evidence।
4. **Unconfirmed audit leads:** transport timeout/abort policy for never-settling reads/uploads and full in-flight mutation/session lifecycle review remain separate investigations, not newly declared confirmed defects or permission to alter order/payment semantics।
5. **Release:** branch work saved locally; no merge/push/deploy. Owner staging smoke and dependency risk disposition remain release gates, not hidden unfinished implementation checkboxes marked complete।

**Bottom line:** O01–O24 confirmed local follow-ups have implementations and automated evidence. S01 and external/manual acceptance remain explicitly open; this is not “every application workflow is production-certified.”

## Subsequent dispatch-mutation follow-up

[O25 dispatch action ownership](dispatch-mutation-recovery-2026-10-22.md)-এ broader unconfirmed mutation lead-এর একটি subset reproduced ও fixed: delivery offer/cancel/release/failed-resolution callbacks এবং stale completion ownership। Earlier O01–O24/counts এই consolidation run-এর historical evidence; new O25 verification ও remaining mutation/upload limitations ওই follow-up report-এ আলাদা।

## Subsequent push-hook lifecycle follow-up

[O26/O27 rider/vendor push lifetime recovery](push-lifetime-recovery-2026-10-22.md)-এ hook re-probing, stale callback/read/action/repair UI completion ও busy ownership fixed। Already-started subscription/repair effects cancel বা serialize করা হয়নি; displayed off মানে endpoint/delivery cessation independently verified নয়। Earlier consolidation counts historical; fresh evidence ও remaining device/protocol acceptance follow-up report-এ।

## Subsequent push recovery UI follow-up

[O28/O29 push recovery UI](push-recovery-ui-2026-10-22.md)-এ rider/vendor initial local-probe error-এ explicit Retry এবং on-state turn-off failure alert যোগ হয়েছে। Correct probe retry বনাম mutation control আলাদা; device/server delivery guarantees বা subscription-protocol serialization এতে যোগ হয়নি। Fresh test/build evidence follow-up report-এ।

## Subsequent failed-proof lifecycle follow-up

[O30/O31 failed-attempt proof/form recovery](failed-proof-lifecycle-2026-10-22.md)-এ rider failed-attempt form-এর stale settings/upload/report completion, assignment draft/proof scoping এবং newest-photo ownership fixed। Pending report lock still-mounted assignment form-এর close/reopen জুড়ে রাখা হয়েছে; Cancel report rollback/cancellation নয়। Broader upload/transport/staging acceptance remains separate; fresh results follow-up report-এ।

## Subsequent rider release-form and production security follow-up

[O32 release-form lifetime / S02 Next patch](release-form-lifecycle-2026-10-22.md)-এ rider release-এর stale completion/draft/callback ownership এবং pending transport lock separation fixed। Cancel/reopen pending write cancel করে না। Fresh audit newly affected `next@16.4.0` দেখানোর পরে compatible exact **16.4.2** patch applied; historical production-zero snapshots আগের সময়ের ফল, old version-এর current clearance নয়। Patched framework: **589 files / 4,273 tests**, **24 browser contracts**, lint/types/build/diff PASS; production audit **0**, **S01 8 dev entries still open**। No push/deploy; scope/fixtures/remaining staging gates follow-up report-এ।

## Subsequent settlement-modal ownership follow-up — 23 October

[O33 rider settlement modal lifecycle](settlement-modal-lifecycle-2026-10-23.md)-এ actual rider page/modal deferred tests দিয়ে pending duplicate submissions এবং abandoned success callback reproduced/fixed। Owner remains mounted across close/reopen; rider/session-keyed view ownership protects new dialogs while preserving pending financial request lock। Claim API, amounts, approval/auth/ledger rules untouched; Cancel is not claim cancellation। **11 added tests; full 589 files / 4,284 PASS**, final focused **128 PASS**, money SQL **35 PASS groups**, lint/types/build/diff PASS; production audit **0**। Full run preceded a test-only act synchronization refinement; exact verification boundaries and remaining hook/staging/device/S01 limits follow-up report-এ। No push/deploy।

## Subsequent delivery PIN proof-upload follow-up — 23 October

[O34 PIN proof-upload ownership](pin-proof-upload-lifecycle-2026-10-23.md)-এ stale/out-of-order photo result ও late upload flash reproduced/fixed; latest selected upload owns proof/error/busy publication। Pending newest upload blocks starting delivery submission, but already-started delivery mutations/parent success effects remain outside this batch। **13 new tests; full 590 files / 4,297 PASS**, final focused **141 PASS**, lint/types/build/diff PASS; production audit **0**। Full run preceded test-only hook-return hygiene refinement; exact boundaries and remaining transport/media/mutation/staging limits are in the report। No push/deploy।

## Subsequent delivery-submit ownership follow-up — 23 October

[O35 delivery-submit lifetime](delivery-submit-lifecycle-2026-10-23.md)-এ O34-এর পৃথক mutation boundary reproduced/fixed: rider/session-scoped coordinator রাখে per-assignment pending locks এবং selected-intent generation; Cancel/reopen, task switching/reappearance, rider replacement ও abandoned completion isolation। Existing helper-owned refresh-এ task আগে সরে গেলেও still-current acknowledged success feedback preserved and tested। Raw delivery API/hook, PIN/proof payload, eligibility/financial rules untouched; no physical cancellation/global idempotency। **13 new tests; full 590 files / 4,310 PASS**, focused **154 PASS**, money SQL **35 PASS groups**, lint/types/build/diff PASS, production audit **0**। Exact intent-versus-feed-removal semantics, hook-internal/staging/device/S01 limits report-এ; no push/deploy।

## Subsequent rider board action ownership follow-up — 23 October

[O36 Accept/Reject/Pickup UI ownership](rider-task-actions-lifecycle-2026-10-23.md)-এ pending same-task non-overlap, preserved global one-Accept restriction, rider/enabled-context parent publication এবং busy snapshot ownership implemented। **26 new tests; full 591 files / 4,336 PASS**, focused **180 PASS**, money SQL **35 PASS groups**, lint/types/build/diff PASS; production audit **0**। Corrected refusal-fixture RED evidence and raw-hook/global-error versus guarded parent callback boundaries report-এ explicit; no claim that every raw mutation-hook side effect is now scoped। No cancellation/global idempotency, no push/deploy; staging/device/S01 gates remain open।

## Subsequent raw rider jobs hook ownership follow-up — 24 October

[O37 raw jobs read/mutation/realtime lifecycle](rider-jobs-hook-lifecycle-2026-10-24.md)-এ O36-এর tested raw-hook publication/refresh boundary implemented: token-scoped snapshot, effect-owned read deduplication, stale read/mutation dispatch/result/error/refresh guards এবং old-channel protection। Current payloads, 409 conflict policy, partial-read recovery ও silent location failure preserved। **35 new tests; corrected original-hook RED 23 FAIL / 12 PASS; full 592 files / 4,371 PASS**, focused **141 PASS**, money SQL **35 PASS groups**, lint/types/build/diff PASS, production audit **0**। Stale false is not proof of server rollback; remaining parent online/GPS, silent same-ID credential, transport/staging/device/S01 limits report-এ। No push/deploy।

## Subsequent rider availability and one-shot GPS follow-up — 24 October

[O38 availability lifecycle](rider-availability-lifecycle-2026-10-24.md)-এ parent online/offline write+refresh lock, scoped cash confirmation/override/error, visible busy control এবং stale one-shot GPS callback protection implemented। Payloads, cash consent, GPS options ও silent GPS failure preserved; rejected post-ack refresh reports verification failure, not server rollback। **21 new tests; original-page RED 10 FAIL / 85 PASS plus 2 unhandled rejection errors; final full 593 files / 4,392 PASS, 541.96 s**, focused **187 PASS**, money SQL **35 PASS groups**, lint/types/build/diff PASS, production audit **0**। Raw `useRiderSession.refresh` internal rider/status publication remains an explicit separate boundary; mocked parent tests do not certify whole-session safety. No physical cancellation/global serialization or authenticated staging/native GPS certification; S01 remains open. No push/deploy।

## Subsequent raw rider session-read follow-up — 24 October

[O39 session read/sign-out publication ownership](rider-session-read-lifecycle-2026-10-24.md)-এ O38-এর bounded internal read race reproduced/fixed: coherent snapshot, latest-started refresh revision, mount/Strict Mode ownership, sign-out read invalidation এবং pending sign-out probe suppression/deduplication। Current denial mapping, last-known authed refresh display এবং GET options preserved। **23 new tests; controlled original-session RED 13 FAIL / 10 PASS; full 594 files / 4,415 PASS, 591.81 s**, focused **163 PASS**, money SQL **35 PASS groups**, lint/types/build/diff PASS; production audit **0**। Sign-in/shift-save mutation intent, silent credential changes ও cross-mount/tab SDK synchronization remain separate; local guest is not remote revocation proof. No cancellation, auth-policy change, push/deploy or staging/device certification; S01 remains open।

## Subsequent rider shift-save follow-up — 24 October

[O40 shift-save ownership/recovery](rider-shift-save-lifecycle-2026-10-24.md)-এ authenticated rider-scoped PATCH/read lock, stale helper dispatch/result/refresh isolation, immediate sign-out revision invalidation এবং actual shift-card keyed draft/completion ownership implemented। Pending controls frozen; unexpected rejection releases UI for retry। Payload, sorted days, hours/null handling ও server scheduling rules preserved। **22 new tests; controlled old-method RED 12 FAIL / 2 PASS; original-card RED 6 FAIL / 1 PASS; full 596 files / 4,437 PASS, 583.75 s**, focused **60 PASS**, lint/types/build/diff PASS, money SQL **35 PASS groups**, production audit **0**। Port **3100** retained, homepage **HTTP 200**। Sign-in SDK concurrency, silent credential changes, cross-mount/tab serialization, already-visible global flash ও staging/device acceptance remain separate; no rollback or whole-auth certificate. S01 remains open; no push/deploy।

## Subsequent actual rider login-submit follow-up — 24 October

[O41 actual login submit ownership](rider-login-submit-lifecycle-2026-10-24.md)-এ inspection-confirmed direct SDK page path guarded: synchronous duplicate lock through SDK+probe, unmount follow-up/error/busy suppression, safe unexpected rejection and retry। Existing email/phone normalization, validation, SDK refusal guidance ও approval routing preserved। **14 new tests; controlled original-handler RED 5 FAIL / 9 PASS; full 597 files / 4,451 PASS, 622.00 s**, focused **61 PASS**, lint/types/build/diff PASS, money SQL **35 PASS groups**, production audit **0**। Preview **3100** running, `/rider/login` **HTTP 200**। Already-started SDK credential mutation cannot be cancelled by ignoring UI completion; global login/logout ordering, separate raw sign-in helper, cross-tab/provider/recovery coordination and staging/device gates remain open. S01 remains open; no push/deploy।

## Subsequent raw rider sign-in helper follow-up — 24 October

[O42 sign-in helper ownership](rider-signin-helper-lifecycle-2026-10-24.md)-এ separate public helper-এর SDK+probe ref lock, stale/unmounted entry/completion guard, sign-out auth-revision invalidation, safe rejection/retry এবং shift-intent isolation implemented। Trimmed credential payload, expected refusal/config guidance এবং API-driven eligibility preserved; null is not an independent eligibility certificate। **16 new tests; controlled old-method RED 11 FAIL / 5 PASS; full 598 files / 4,467 PASS, 546.24 s**, focused **77 PASS**, lint/types/build/diff PASS, money SQL **35 PASS groups**, production audit **0**। Preview **3100** running, `/rider/login` **HTTP 200**। Physical SDK login/logout may still overlap; no cancellation, compensating logout, global provider/mutex or cross-tab credential certificate. Staging/device/S01 gates remain open; no push/deploy।

## Final participating rider-auth integration and release handoff — 25 October

[O43 completion/release ledger](rider-auth-completion-2026-10-25.md)-এ actual rider login/helper/logout একই-client SDK lane-এ integrated; queued superseded login skip, running login-এর পরে logout, rejection recovery ও logout intent surviving unmount tested। Mounted rider sessions SDK auth-event subscribe/cleanup, deferred eligibility read, logout/old-read reset এবং same-batch identity-reset generation implemented। **18 new tests; full 600 files / 4,485 PASS, 613.85 s**, focused **95 PASS**, lint/types/build/diff PASS, money SQL **35 PASS groups**, production audit **0**। Preview **3100** running, `/rider/login` **HTTP 200**। Final ledger distinguishes completed selected client work from non-participating/cross-tab mutation coordination, SDK/server/device acceptance, S01 and deployment gates; no unsupported whole-app production-ready claim. No commit/push/deploy।

## S01 development dependency closure — 25 October

[Current tooling security closure](development-security-closure-2026-10-25.md) records fresh **4 entries (1 high, 3 moderate) → 0**, not a retroactive rewrite of the historical eight-entry snapshots. Compatible transitive **zod 4.6.7** plus deliberately scoped **xcode→uuid 11.1.1** override retain CommonJS v4 compatibility without downgrading Capacitor. **3 new toolchain tests**, clean-install, Capacitor **8.5.3**/Android plugin discovery pass; full **601 files / 4,488 PASS, 585.56 s**, lint/types/build/diff PASS, money SQL **35 PASS groups**, **full and production audits 0**. Override rationale, limitations and removal plan are permanent in the report. Preview **3100** retained, `/rider/login` **HTTP 200**. Other SDK/cross-tab implementation scope and real staging/device gates are not silently marked complete. No commit/push/deploy.

## Remaining browser SDK coordination completion — 25 October

[Browser auth coordination](browser-auth-coordination-2026-10-25.md) extends the rider lane to vendor login/logout, staff login/role verification/logout and self-service password change; Web Locks add origin-scoped non-overlap for participating tabs where supported. Staff role check remains mandatory; superseded refusal cannot sign out a newer queued login, old staff refresh cannot restore logout, and SDK failure permits safe retry. **11 new tests; controlled original-staff RED 4 FAIL / 4 PASS; final full 602 files / 4,499 PASS, 670.66 s**, focused **66 PASS**, lint/types/build/diff PASS, money SQL **35 PASS groups**, full+production audits **0**. Final full run restarted after DOM Promise-typing repair. Preview **3100**, `/rider/login` **HTTP 200**. Real two-tab SDK/cookie, unsupported-Web-Locks fallback, server apply/reset and native/staging/device acceptance remain explicit scope/operational limits, not invented production clearance. No commit/push/deploy.

## Native Chromium auth-lock/browser acceptance — 25 October

[Native browser acceptance](browser-auth-native-lock-acceptance-2026-10-25.md) executes actual lane code with native Web Locks across two tabs, not a mocked LockManager. Five new browser contracts plus existing access/checkout/gallery/shared controls give **16 PASS, 54.1 s**; CI-step command locally **5 PASS, 3.2 s**, new-spec lint/full types/diff PASS and fresh full dependency audit zero. CI browser job now includes the lock spec; remote CI not dispatched. Initial 127.0.0.1 HMR/hydration failures investigated and default localhost origin verified without app changes. No runtime/dependency changes; previous **602 files / 4,499** full-suite/build/money results remain historical, not claimed rerun here. Remaining configured SDK/cookie/staging/device acceptance stays explicit. Preview **3100** running; no commit/push/deploy.

## Real SDK browser session acceptance — 25 October

[SDK browser acceptance](browser-sdk-session-acceptance-2026-10-25.md) adds seven installed-Supabase-SDK contracts using real Chromium cookie/BroadcastChannel/Web Lock behavior and synthetic auth HTTP. Persistence, new/existing tab session propagation, refresh, pending login→queued logout, credential refusal and password update pass. Negative logout case confirms SDK locally clears cookies while still returning remote failure; local guest remains no remote-revocation proof. Combined **23 browser PASS / 43.2 s**, local CI auth command **12 PASS / 6.7 s**, lint/types/YAML/diff PASS, full audit zero; preview **3100 HTTP 200**. Only tests/workflow/docs changed; prior full-unit/build/money counts historical, not relabeled as fresh. Real authenticated server/RLS/deployment/native-device gates remain explicit; no commit/push/deploy.

## Complete configured browser regression — 25 October

[Full browser regression](full-browser-regression-2026-10-25.md): **94 default PASS / 9.6 min** plus **7 dashboard PASS / 21.3 s**, final sources, no skips/retries, combined process exit 0. Initial preview-env mismatch was diagnosed; complete corrected-env baseline 85 PASS/8 FAIL exposed legacy storefront catalog/checkout/retired-copy assumptions and a false PDP Axe pass on a 404. Test-only fixes preserve current UI, isolated non-empty ShopBrowser coverage, positive route statuses and honest missing seeded SSR-PDP acceptance. Managed Playwright servers explicitly use invalid-host fixture env and refuse silent preview reuse; CI now executes dashboards then the entire default suite, auth specs included once. Types/targeted lint/YAML/diff PASS, fresh full audit zero. Normal preview restored on **3100**, no fixture env. No app source/dependency/rule changes or new full-unit/build/money claim; real configured server/RLS/SSR/native-device acceptance remains separate. No commit/push/deploy.

## Android/native readiness — 25 October

User selected native/device acceptance. [Native readiness evidence](android-native-readiness-2026-10-25.md) records an actual blank-workflow-input `Invalid URL` CLI failure, minimal Capacitor URL fallback/trim fix and seven regression tests. Actual default/preview sync, generated config/offline asset/plugin assertions PASS; focused **6 files / 66 tests PASS / 4.80 s**, full types/targeted lint/diff PASS and full audit zero. No tracked Android diff or dependency change; auth/financial/eligibility/GPS timing policies untouched. Actual Gradle debug build attempt exits 1 before compilation because Java is unavailable; SDK/adb/device/emulator unavailable too. **APK/device acceptance remains BLOCKED**, not passed. Prior 101 browser/full-unit/build/money results historical. Device runbook and native push scope limitations documented; normal preview3100 HTTP200. No commit/push/dispatch/deploy.
