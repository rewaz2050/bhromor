# O36 — Rider Accept / Reject / Pickup UI ownership

২৩ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

Bounded next step after delivery-submit ownership: parent result publication, per-task pending state and synchronous non-overlap for Accept/Reject/Pickup। Existing dirty work preserved; no commit/push/deploy। This does not close all raw mutation-hook/session behavior or every rider action।

## Evidence and fixture correction

Initial actual-page run added 15 scenarios: **14 FAIL / 1 PASS**, plus **3 unhandled unexpected-rejection errors**; existing 66 tests passed। Duplicate Reject/Pickup, conflicting same-task Accept/Reject, late success publication, accept busy leakage across rider replacement and rider A → B → A old callback reactivation were reproduced with controlled promises। Existing ordinary Accept duplicate-click protection already passed; it was not falsely declared absent。

**Important fixture correction:** initial 3 refusal scenarios left the mocked jobs-hook error populated after rider replacement. The shared page error bar displayed that fixture value independently of the parent callback, so those initial failures alone were not valid evidence of late parent publication. Corrected fixtures clear the new rider's hook error before old completion. A controlled temporary rollback of the three page handlers to their pre-guard await/publication behavior then produced **3 FAIL / 78 skipped**; guarded handlers were restored immediately and corrected cases passed. This isolates the parent callback defect; it does not prove that the real raw hook suppresses every old error update。

Normal hook helpers already return booleans for ordinary failures. Throwing fixtures exercise a defensive unexpected-rejection boundary, not a claim that every network failure normally throws。

## Implementation

### New `src/lib/use-rider-task-actions.ts`

- Immutable rider/enabled-context token plus effect-local active owner and ref-held per-task pending map. Replacing/disabling the context or unmounting deactivates the old owner. Returning A → B → A does not reactivate old A。
- Synchronous lock blocks overlapping Accept/Reject/Pickup callback invocation for one assignment, including calls before a React render. Different tasks retain independent Reject/Pickup locks。
- **Existing global one-Accept-at-a-time restriction retained**, including different assignments. No broadened parallel accept policy/capacity change。
- Snapshot token scoping prevents old pending state painting a new rider's buttons. Only an active request owner can publish its completion or update its pending snapshot; old completion cannot unlock a new owner's pending action。
- Unexpected work rejection releases its own lock, returns a safe failure classification to current publication, and is consumed silently after owner cleanup. Explicit retry only; no automatic resend。

### `src/app/rider/page.tsx`

The three existing helpers/payloads are invoked through the coordinator. Existing success messages and ordinary refusal-source handling remain; parent error clear/set and success flash only run for the current owner. Unexpected rejection uses safe “কাজের আপডেট পাঠানো যায়নি — আবার চেষ্টা করুন।” Old local `accepting` state is replaced by scoped pending/accepting output。

### `src/components/rider/dashboard/task-card.tsx`

Optional `pendingAction` adds disabled/busy states for these three task controls. Pending Accept also blocks Reject for the same task; pending Reject blocks Accept for that task. Existing online, expiry, cash-cap and global accept conditions remain. Reject/Pickup gain concise pending labels and consistent disabled styling. Other child mutation controls retain their separate owners/rules。

**Unchanged:** raw `useRiderJobs.accept/reject/pickup` implementations, endpoints, arguments, offer/pickup eligibility, fees/COD/ledger/auth/permissions, online/location behavior, release/failed-attempt/delivery/settlement business rules and dependencies. Next remains **16.4.2**。

## Permanent tests

**26 added tests**, no original assertions removed:

- `src/app/rider/__tests__/rider-page.test.tsx`: **18 new**, original 66 retained (84 total). Duplicate/non-overlap matrices; old success/refusal publication; safe exception/retry; conflicting task action; new-rider accept against old busy state; old completion against a new pending accept; A → B → A; normal refusal/unlock/retry matrices. Existing fixture now restores test spies after each case。
- `src/lib/__tests__/use-rider-task-actions.test.tsx`: **8 new**. Unmount matrix, preserved global accept serialization, independent task locks, synchronous mixed same-task entry guard, disabled scope/stale captured callback, unexpected rejection after unmount。

Actual page/card/coordinator and actual hook render tests; raw session/jobs/mutation boundaries are fixtures. They are not authenticated server/financial concurrency certification。

## Verification

| Check | Result |
| --- | --- |
| Final focused page/card/proof/upload/release + hook | **6 files / 180 tests PASS, 7.59 s** |
| Targeted ESLint | PASS |
| Full application suite | **591 files / 4,336 tests PASS, 451.90 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |

Existing rider-page fixtures emit non-fatal `act(...)` warnings, including legacy action/delivery tests now also exercising coordinator state updates. All focused assertions pass; no warning-free suite, fresh browser or physical-device acceptance claim。

## Explicit scope limits / release gates

1. **No transport cancellation or rollback.** An old request can commit after rider change/unmount; suppressing its parent callback does not reverse its server effects。
2. Locks cover only these three actions in one mounted coordinator context. They are not shared with release/failed-attempt/delivery/settlement/online actions or other tabs/devices/page mounts. Replacing the rider context does not physically serialize its old transport with the new context's transport. Scope uses rider ID and observed enabled/disabled transitions, not silent credential replacement while the same rider stays enabled。
3. Never-settling work retains its task lock/global accept lock; no timeout or forced overlap policy introduced。
4. **Raw jobs-hook refresh/error writes remain unchanged.** This patch prevents abandoned parent callbacks from publishing; it does not guarantee the hook itself cannot update shared error/read state after identity change. Corrected refusal fixtures specifically distinguish these layers. Broader raw mutation-hook lifetime review remains separate, not silently marked complete。
5. Already-visible parent flashes/errors are not globally cleared by this coordinator on rider change. New late publication and pending ownership are its scope, not a complete page-state identity reset or every stale UI source。
6. Eligibility remains server-authoritative. Real rider/staff roles/RLS, expired/shared offers, capacity/cash-cap races, pickup/deployed concurrency, financial effects and native devices need configured staging/device acceptance. Component mocks and isolated SQL harness results do not certify them。
7. S01 development dependency findings remain open; production-only audit is not full tooling security clearance. No commit, push, merge or deploy。

## Evidence files

Workspace logs (not Git deliverables):

- `/home/user/task-actions-{red,refusal-red-corrected,green,green-corrected,green-final}.log`
- `/home/user/task-actions-lint-focused.log`
- `/home/user/task-actions-full-suite-final.log`
- `/home/user/task-actions-{lint,types,build,production-audit,money}-final.log`

Earlier work: [consolidation](final-build-consolidation-2026-10-22.md), [delivery-submit ownership](delivery-submit-lifecycle-2026-10-23.md)।

## Subsequent raw jobs-hook follow-up — 24 October

The tested raw mutation/read/realtime boundary left open above now has a separate implementation and evidence in [O37 jobs-hook lifecycle](rider-jobs-hook-lifecycle-2026-10-24.md). It guards the hook's own stale error/refresh/data publication and captured dispatch methods, not only the parent action callbacks. O36 evidence/counts remain historical; parent online/GPS workflows, complete page message reset, silent same-ID credentials and deployment/device/transaction acceptance are still separate limits.
