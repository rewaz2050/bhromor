# O33 — Rider settlement modal lifetime and pending-claim ownership

২৩ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

Release-form follow-up-এর পর bounded evidence-first review: cash pay-in claim modal, actual rider page callback এবং pending submission ownership। Existing dirty work preserved; no commit/push/deploy। Settlement amounts/approval/financial semantics change করার কাজ নয়।

## Evidence before implementation

Actual `RiderPage` + actual `SettleModal`, existing mocked session/jobs hooks এবং controlled settlement promises দিয়ে প্রথম **8 new scenarios** চালানো হয়েছে। Result: **6 FAIL / 2 PASS**; existing 42 tests PASS; unexpected-rejection fixture থেকে **1 unhandled error**।

Confirmed observations:

- Same open view repeated submit → multiple `settle()` calls; local pending guard ছিল না।
- Pending claim → Cancel → reopen → old success parent callback নতুন dialog বন্ধ করে success flash/session refresh চালাত। Modal-only unmount guard যথেষ্ট নয়: parent `handleSettleCash()` নিজেই await-এর পরে UI effects করত।
- Success after Cancel, page unmount বা rider replacement পুরোনো parent success effects চালাতে পারত।
- Unexpected settlement callback rejection unhandled হতো; ordinary hook already returns boolean for normal transport failures, so this is a defensive exception fixture—not a claim that normal failures necessarily throw।

Old refusal after close/reopen and refusal after unmount already did not show a new success callback; passing baseline cases retained। No production financial incident, duplicate stored claim or deployed exploit is inferred from these component fixtures।

## Implementation

### `src/components/rider/dashboard/settle-modal.tsx`

- Optional controlled `open` prop (default `true`) lets the **owner stay mounted while the dialog is hidden**। Pending ref lock + busy state survive Cancel/reopen। Submit control shows “দাবি পাঠানো হচ্ছে…” and is disabled while pending; synchronous owner guard also prevents overlapping callback invocation।
- Mounted/open-generation guard controls result publication and optional `onSuccess` callback। Cancel invalidates the view immediately, even before parent rendering; hidden/open transitions and owner cleanup invalidate abandoned completion।
- Separate private `SettlementForm` unmounts while hidden, so method/reference/error reset on normal close/reopen exactly as the former conditionally mounted modal did। Its local active guard prevents late refusal publication after unmount।
- Pending request’s settlement releases only its own mounted owner’s busy state, even if its original view has closed। No timeout or forced overlap policy।
- Defensive unexpected callback rejection becomes safe inline “দাবি পাঠানো যায়নি — আবার চেষ্টা করুন।” only in the current view; same-view draft is retained and retry is explicit। Stale rejection is consumed without leaking private error details into a reopened form।

### `src/app/rider/page.tsx`

- Settlement callback returns the existing refusal/null contract without parent success UI side effects。
- Existing clear-action-error, session refresh, dialog close and success flash moved together to `onSettlementSent`, invoked by the modal only for its current accepted completion। Ordinary current success still performs them।
- Modal owner remains mounted across close/reopen, keyed by rider ID + live-session status। Different rider/session ownership gets a distinct owner; A → B → A does not reactivate old A। A completion cannot release pending B’s lock or close B’s dialog。

**Unchanged:** `/api/rider/settle`, raw `useRiderJobs.settle` implementation, method/reference payload and trim, default cash submission’s empty reference, bank/bKash minimum reference validation and 120-character input cap, money amounts/calculations, claim-table availability/pending-claim controls, staff approval/RLS/auth and ledger rules। No dependency or schema changes in this batch; Next remains **16.4.2**。

## Permanent tests

`src/app/rider/__tests__/rider-page.test.tsx`: **11 added tests**; original 42 retained। Existing fixtures gained configurable rider identity and an observable session-refresh spy; no original assertions deleted。

Coverage: pending non-overlap through Cancel/reopen; no old success flash/refresh after close; old refusal isolation and fresh form state; defensive rejection/draft/retry and trimmed payload; success/refusal after unmount; rider replacement; duplicate submit; A → B → A; pending B lock against old A completion; stale rejection after reopen。

These render the actual page and modal. Session/jobs/mutation hooks are fixtures, not authenticated financial transport acceptance。

## Verification

| Check | Result |
| --- | --- |
| Focused page/dashboard/release/proof tests | **4 files / 128 tests PASS, 5.22 s** |
| ESLint | PASS |
| TypeScript | PASS |
| Production build (Next 16.4.2) | PASS |
| Production audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| Full application suite | **589 files / 4,284 tests PASS, 462.53 s**, exit 0 |
| `git diff --check` | PASS |

Full regression log includes non-fatal `act(...)` warnings, including the initial new retry fixture। After that full run, a **test-only `await act(...)` synchronization correction** was applied to its explicit retry; application code and assertions were unchanged। Final focused rerun (128 PASS) verifies that corrected fixture without settlement-component act warnings; existing unrelated rider-page warnings remain। The full suite was not repeated after this synchronization-only correction। This is not a warning-free suite claim। Money checks are the repository’s isolated SQL regression harness, not real staging bank/bKash/admin approval acceptance। No fresh browser/device acceptance claimed in this batch。

## Explicit limits / release gates

1. **Cancel closes a view, not an already-sent financial claim.** Server mutation can still commit; suppressing its old success UI does not roll it back, reverse a deposit or prove the claim absent。
2. Serialization is per mounted rider/session modal owner. Different mounts/tabs/devices can still have physical requests concurrently; no global idempotency/cancellation protocol added। A never-settling request keeps its owner locked until settlement/unmount; no arbitrary timeout added。
3. Raw settlement hook retains its own error/refresh behavior. Guards apply to dialog-owned publication and the page success callback—not every hook-internal side effect or all rider-page actions। Existing reads/realtime/polling reconcile committed server state; no new immediate-refresh or latency guarantee after abandoned completion।
4. Actual authenticated rider/staff permissions/RLS, cross-device concurrency, bank/bKash deposit, approval/rejection, deployed settlement reconciliation and native device acceptance still require configured staging accounts/services। Component mocks and SQL fixtures do not certify them。
5. Prior **S01 development dependency findings remain open**; production-only audit zero is not full tooling security clearance। Prior [S02 Next patch](release-form-lifecycle-2026-10-22.md) remains preserved。
6. No commit, push, merge or deploy performed。

## Evidence files

Workspace logs (not Git deliverables):

- `/home/user/settle-modal-{red,green,green-final,green-verified}.log`
- `/home/user/settle-modal-full-suite-final.log`
- `/home/user/settle-modal-{lint,types,build,production-audit,money}-final.log`
- `/home/user/settle-modal-types-verified.log` — final test synchronization correction-এর পরে incremental TypeScript check, exit 0

Previous work: [consolidation](final-build-consolidation-2026-10-22.md), [release-form lifecycle and security patch](release-form-lifecycle-2026-10-22.md)।
