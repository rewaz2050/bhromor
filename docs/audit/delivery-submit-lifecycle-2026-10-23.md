# O35 — Delivery submission ownership and same-assignment pending locks

২৩ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

O34 proof-upload follow-up-এর remaining delivery-submit/page-callback boundary examined and implemented। Existing dirty work preserved; no commit/push/deploy। This is bounded client ownership work, not delivery/financial/auth rule changes or deployed transaction certification。

## Evidence first

Actual `RiderPage`, actual PIN form, existing mocked session/jobs hooks and controlled delivery promises: initial **12 new scenarios: 10 FAIL / 2 PASS**, plus **2 unhandled unexpected-rejection errors**; original 53 rider-page tests passed।

Confirmed controlled observations:

- Repeated clicks could call `deliver()` more than once while the same assignment’s first request was pending。
- Cancel/reopen discarded form state but not the physical request; there was no persistent assignment lock. Old success could close the reopened form, flash success and refresh session/stats; old successful completion after page unmount or rider replacement could still invoke parent effects。
- A completion could affect a different currently visible task B. Opening A → B → A did not retain A’s pending transport lock or isolate its old view。
- Unexpected delivery callback rejection was unhandled; normal jobs hook already returns boolean for ordinary failures, so the throwing fixtures exercise a defensive boundary rather than proving normal transport failures throw。

No real duplicate stored delivery, financial write or production incident is inferred from mocked component calls。

## Implementation

### New `src/components/rider/dashboard/delivery-pin-dialog.tsx`

A persistent coordinator, keyed by rider/live-session identity in the page, owns:

- **Per-assignment pending set:** synchronous entry guard prevents another physical callback invocation for the same assignment while unresolved. Closing/reopening or switching A → B → A does not discard A’s lock. Different assignments retain independent locks; A settlement cannot unlock B。
- **Selected-intent generation:** Cancel invalidates immediately; changing selection or a new form appearance starts a new generation. Only a still-active rider/session owner and matching current selected intent can publish refusal or invoke delivery success effects。
- **Independent transport settlement:** even an abandoned view’s request releases its own assignment lock on settlement, without publishing its result into a later view. Owner unmount/rider replacement deactivates external callbacks; A → B → A rider identity replacement does not reactivate old owners。
- **Defensive helper rejection:** safe current inline fallback “ডেলিভারি সম্পন্ন করা যায়নি — আবার চেষ্টা করুন।” Explicit retry only; no private thrown diagnostics displayed or automatic resend。

Pending set entries are removed when their promises settle; this is not an ever-growing registry of completed task snapshots。

### Important feed-refresh compatibility

The existing raw delivery hook awaits its own jobs refresh before returning success. That refresh can remove the delivered task and unmount its visible form **before** the result returns. Blindly deactivating all success ownership when a task disappears would erase normal delivery success feedback and the existing session/stats refreshes。

Therefore **task disappearance alone does not cancel the current selected submission intent**. If the owner/selection is still current and no new view appeared, an acknowledged success can still flash and refresh after that disappearance. Cancel, another selection, owner unmount or rider change still invalidates it. If the same task reappears before settlement, its new form generation suppresses the old result while the per-assignment transport lock remains intact. The extra 13th test explicitly verifies normal success after helper-owned refresh removal; the remove/reintroduce test verifies the opposite new-view boundary。

### Page and PIN form wiring

`src/app/rider/page.tsx`:

- Existing `handleDeliver` retains task/PIN/photo/reason arguments and refusal/null result contract, but no longer directly performs parent success effects after await。
- Existing action-error clear, selected-task close, success flash and session/stats refresh move together into `onDeliveryCompleted`, called only through coordinator ownership checks。
- Coordinator remains mounted when no PIN form is visible, keyed with a unique `delivery:` prefix + live status/rider ID. The settlement owner remains separate. Visible PIN form is still assignment-keyed and unmounts when closed, preserving clean drafts/proof on reopening。

`src/components/rider/dashboard/pin-modal.tsx`:

- Optional controlled `busy` prop from coordinator disables delivery submission with “ডেলিভারি হচ্ছে…”; submit entry checks it synchronously. File selection/upload entry is also blocked during delivery submission, so a new proof upload is not started for an already-sent payload。
- Existing latest-upload guards and pending-upload submission block remain intact. Refusal publication additionally checks active form ownership after await。

**Unchanged:** raw `useRiderJobs.deliver` implementation/refresh/error handling, delivery API and authentication/eligibility, PIN normalization/four-digit requirement, proof/no-photo payload and caps, server transactions/COD/fees/ledger rules, signing/Cloudinary protocol, settlement flow and dependencies。 Next remains **16.4.2**。

## Permanent tests

`src/app/rider/__tests__/rider-page.test.tsx`: **13 added tests**, original 53 retained (66 total). Existing fixture gained an observable stats-refresh spy; original assertions were not removed。

Coverage: duplicate submit; Cancel/reopen success/refusal and lock retention; closed-page success suppression; page unmount; A completion against pending B; task A → B → A; task removal/reintroduction; rider replacement; current unexpected rejection/draft/retry; stale rejection; current refusal/retry/payload/success effects; normal acknowledged success after its own refresh removes the task。

Actual page/form/coordinator are rendered; session/jobs/mutation boundaries are fixtures. They do not certify authenticated delivery transport or physical-device workflows。

## Verification

| Check | Result |
| --- | --- |
| Focused page/dashboard/upload/proof/release suite | **5 files / 154 tests PASS, 8.18 s** |
| Full application suite | **590 files / 4,310 tests PASS, 573.98 s**, exit 0 |
| ESLint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production dependency audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |

Focused run includes non-fatal `act(...)` warnings in existing rider-page fixtures, including legacy delivery tests (now also exercising coordinator updates), failed-attempt settings and acceptance scenarios. All assertions pass; no claim of a warning-free application suite or fresh browser/native-device acceptance. Money results are the existing isolated SQL regression harness, not authenticated production financial acceptance।

## Explicit limits / release gates

1. **Cancel does not cancel or roll back a delivery request.** Already-sent endpoint calls can commit; suppressed callbacks do not undo delivery/financial state。
2. Serialization is per assignment within one mounted rider/session coordinator, not global across separate page mounts, tabs or devices. Rider replacement creates independent UI ownership; it does not physically cancel the old transport。
3. A never-settling assignment request retains its lock; no timeout/forced overlap policy added. Other assignments can still be handled independently。
4. Raw jobs hook still performs its existing refresh/error updates. This does not prove every hook-internal side effect or every rider action is identity-scoped. Existing reads/realtime/polling reconcile server state after abandoned completion; no new latency guarantee or automatic resend。
5. Current intent can outlive a feed-driven form disappearance as described above; it is not equivalent to blanket suppression after every inner form unmount. New selection/reappearance and actual coordinator/page unmount are distinct boundaries。
6. Proof upload result guards do not abort remote uploads or delete orphan media (O34 limits remain). Real camera/Cloudinary signing/storage acceptance is separate。
7. Real rider/customer/staff permissions/RLS, valid/invalid customer PIN, concurrent delivery/financial transactions, deployed feed reconciliation and native devices still require configured staging/device acceptance. Component mocks and isolated SQL regressions are not substitutes。
8. S01 dev dependency findings remain open. No commit, push, merge or deploy performed。

## Evidence files

Workspace logs (not Git deliverables):

- `/home/user/pin-submit-{red,green,green-final}.log`
- `/home/user/pin-submit-full-suite-final.log`
- `/home/user/pin-submit-{lint,types,build,production-audit,money}-final.log`

Earlier work: [consolidation](final-build-consolidation-2026-10-22.md), [O34 proof uploads](pin-proof-upload-lifecycle-2026-10-23.md), [settlement ownership](settlement-modal-lifecycle-2026-10-23.md)।
