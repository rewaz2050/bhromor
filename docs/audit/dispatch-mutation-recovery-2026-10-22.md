# Dispatch action ownership — O25

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

[Final consolidation](final-build-consolidation-2026-10-22.md)-এর unconfirmed mutation-lifecycle lead থেকে একটি bounded subset পরীক্ষা করা হয়েছে: `useAdminDeliveries()`-এর offer, cancel, release এবং failed-delivery resolution। Controlled hook tests দিয়ে finding নিশ্চিত; real authenticated production write বা permission bypass-এর দাবি নয়। Upload/native-device workflows এই batch-এর অংশ নয়।

## Confirmed behavior before fix

চারটি action-এ captured `live` boolean শুধু শুরুতে check হতো; completion ownership check ছিল না। ফলে:

1. Enabled lifetime-এ রাখা callback disable হওয়ার পরে বা পরবর্তী enabled lifetime-এও write শুরু করতে পারত।
2. Pending old action failure signed-out/new-lifetime board-এ পুরোনো error বসাত।
3. Pending old success later lifetime-এর error clear করে current board refresh করত।
4. Old completion/finally নতুন pending action-এর `busyId` মুছে দিত।
5. Unmounted/stale action completion true ফিরিয়ে caller-কে current UI success বোঝাতে পারত।

Initial RED: **32 FAIL / 4 PASS**, 36 new scenarios। Current-lifetime normal action tests আগে থেকেই pass করছিল; stale ownership tests fail করেছে। এটি HTTP endpoint অন্য staff-কে unauthorized action করতে দেয়—এমন finding নয়। Existing server gates/DB transitions এই পরীক্ষায় bypass/rewrite করা হয়নি।

## Implementation

Application change শুধু `src/lib/use-admin-deliveries.ts`:

- Observed `live` lifetime-এর immutable callback identity। Cleanup invalidates old identity/action tickets। Saved old callback new active lifetime-এর permission/state ধার করে কাজ শুরু করতে পারে না।
- Read request counter থেকে আলাদা mutation ticket: polling/read refresh valid pending action-কে stale করে না।
- Shared `mutate()` handler: only latest action in the current active lifetime may set error, refresh, clear busy state or report current UI success। API response এবং post-action refresh await—দুটির পরেই ownership rechecked।
- Old success/rejection consumed safely; stale operation returns false, without refreshing or altering the current board।

**False here means current UI did not accept that operation's completion; it does not prove a server write failed or rolled back.** Already-started requests are not cancelled, deduplicated, retried or reverted। No automatic write retry added। Multiple requests may still run server-side; only UI completion ownership is bounded।

## Preserved contracts

- Same endpoints, POST methods, URL encoding and request payloads।
- Cancel still requires an existing `offered` assignment locally; server rules remain authoritative।
- Release reason, failed-delivery action/note এবং optional `payFee:true` unchanged; default false adds no fee override।
- Current mutation failure shows its existing error and releases its own busy state।
- Current committed success still returns true if its subsequent refresh fails; refresh error remains visible। Read failure is not falsely reported as rollback of a successful write।
- Normal success refreshes the board; existing read lifecycle/polling and roster recovery preserved।

Authentication implementation, roles/RLS, API routes, dispatch eligibility, order/payment/fee rules, migrations, dependency manifests ও UI components untouched in this batch।

## Regression evidence

New `src/lib/__tests__/admin-delivery-mutation-recovery.test.tsx`: **48 permanent scenarios**।

- All four actions: saved disabled/later-lifetime callbacks, old failure after disable/re-enable, old success against later read error, post-unmount completion।
- Old success/rejection while a newer action is pending; old completion while a newer enabled lifetime has its own pending action।
- Current errors/success, exact request contracts, cancel preconditions, default failed-delivery fee semantics।
- Lifetime change during post-mutation read; committed success with failed read।

`apiGet`/`apiSend` and roster live state mocked; actual delivery hook ownership/refresh logic exercised। This is React/jsdom controlled evidence, not real Supabase/account/device/network acceptance। No existing tests removed。

## Verification

| Check | Result |
| --- | --- |
| Initial new regressions before fix | **32 FAIL / 4 PASS**, expected red |
| New + existing hook/page tests | **4 files / 65 tests PASS**, 7.71 s |
| ESLint | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Full Vitest suite | **585 files / 4,173 tests PASS**, 589.42 s |
| Production dependency audit | **0 vulnerabilities** |
| `git diff --check` | PASS |

Focused includes the previous 8 board-read tests plus 5 reason-dialog and 4 coverage-page tests। Fresh `npm ci --ignore-scripts` completed; installed Next testing guide read before implementation। Historical changes preserved; no push/deploy。

Logs: `/home/user/mutation-{install,red,green,lint,types,build,full-suite,production-audit}.log`。

## Remaining limitations

- Lifetime boundary means observed `live` change or unmount, not silent user identity replacement while `live=true`। No new identity API added।
- No cancellation of initiated writes or caller-side side effects outside this hook। UI ownership does not replace server authorization/idempotency or establish that an old write did not commit।
- Latest-action ownership may leave earlier successful writes to appear on the next poll/manual refresh if a newer action superseded their UI completion। This is not a new server serialization guarantee।
- Same-session board-read errors from independent polling/manual refresh and mutation errors still share the existing error surface; this is not exhaustive arbitration of every possible read/write interleaving。
- Vendor/rider/product/upload mutation lifecycles and never-settling operation timeout policy remain separate investigations; this report does not mark them fixed or newly declare them confirmed bugs。
- Real staging roles, payment/dispatch concurrency, native GPS/push/device acceptance and S01 development dependency findings remain open as documented in the consolidation report。
