# O34 — Delivery PIN proof-upload ownership

২৩ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

Settlement-modal follow-up-এর পরে bounded investigation: delivery PIN modal-এর proof-photo selection/upload lifecycle। This batch does **not** claim to complete the independent delivery-submit/page-callback lifecycle review। Existing dirty work preserved; no commit/push/deploy।

## Reproduction before changes

Actual `PinModal`, synthetic `File`s, mocked delivery-proof upload helper এবং controlled promises দিয়ে initial **11 scenarios: 10 FAIL / 1 PASS, plus 2 unhandled unexpected-rejection errors**।

Confirmed observations:

- Select A then B; B finishes first, A finishes last → A could overwrite B’s accepted proof and emit an obsolete flash।
- Old completion while newer upload pending cleared the shared uploading state; old error could publish into the newer upload view।
- Old success could attach a proof after the newest selection failed; old refusal could place an error after newest success।
- Successful upload after Cancel or unmount still called `onFlash`। Existing assignment-keyed caller remounts the modal, but that alone did not suppress its old external callback। A → B → A fixture confirmed that stale upload callbacks were not tied to the original mount’s lifetime।
- Delivery could be submitted with an already-attached previous photo while its replacement was still pending; selected newest proof had not settled yet।
- Unexpected helper rejection was unhandled and left upload state busy। Normal helper already catches ordinary upload failures and returns a result union; throwing fixtures exercise a defensive boundary, not proof of normal production throws。

These are controlled component results, not a claim that real customer proof media or a deployed delivery was affected。

## Implementation

`src/components/rider/dashboard/pin-modal.tsx`:

1. Per-mounted-modal active owner + monotonically increasing selection ticket。 Only the latest selection in the active owner can attach proof, set upload errors/no-photo fallback, emit upload flash, or release upload busy state。
2. Cancel invalidates upload ownership immediately before invoking the existing close callback; unmount deactivates the owner。 Existing rider page `key={pinTask.id}` remains the assignment boundary। Returning to A creates a new instance, not a reactivated old upload owner。
3. Upload helper await has defensive catch/finally。 Current unexpected rejection safely shows “ছবি আপলোড হয়নি — আবার চেষ্টা করুন অথবা নিচে কারণ লিখুন।” and releases its own upload lock; stale rejection is consumed without overwriting the newest result。
4. Submit button and synchronous submit entry guard block delivery submission **while the latest selected upload is pending**। Older settlement does not prematurely enable it। Existing four-digit PIN requirement is retained; no new photo/no-photo server validation policy。
5. A failed replacement retains the previously accepted photo, as before, with the current failure visible। When retry/newest upload succeeds, that accepted URL is sent with the PIN and null no-photo reason; existing no-photo reason behavior remains unchanged。

Unchanged: upload helper, rider-scoped signing endpoint, Cloudinary settings/parameters, file input accept/capture behavior, upload success flash text, PIN normalization/length, no-photo reason cap and payload, delivery endpoint/eligibility/financial/auth rules, parent delivery-success behavior and dependencies。 Next remains **16.4.2**。

## Permanent tests

`src/components/rider/dashboard/__tests__/pin-proof-upload-lifecycle.test.tsx`: **13 new tests**。

- Latest proof selection wins even when oldest success finishes last; submitted payload carries newest accepted URL。
- Old success/refusal cannot unlock newer pending upload or publish its error/flash。
- Old refusal after new success; old success after new refusal。
- Cancel before consumer unmount; unmount/reopen; keyed A → B → A。
- Pending replacement blocks submission of old accepted proof。
- Current defensive rejection/fallback/retry; stale rejection after newer success; rejection after unmount。
- Failed replacement preserves prior accepted proof and existing payload behavior。

Actual form/component rendering and controlled helper promises, not real camera/network/account acceptance। Existing dashboard/page/release/failed-proof assertions retained。

## Verification

| Check | Result |
| --- | --- |
| Focused dashboard/page/proof regression | **5 files / 141 tests PASS, 10.69 s** (final fixture rerun) |
| Full application suite | **590 files / 4,297 tests PASS, 582.48 s**, exit 0 |
| ESLint / TypeScript / production build | **PASS** |
| Production dependency audit | **0 vulnerabilities** |
| `git diff --check` | **PASS** |

Full suite executed the new file before a small **test-only fixture hygiene correction**: its `beforeEach` now explicitly returns void, so the reset mock is not registered as an unintended teardown callback. Application code and all assertions were unchanged. Final focused 141-test rerun, targeted ESLint and incremental TypeScript check passed after this correction; full suite was not repeated for that fixture-only refinement.

Focused run includes non-fatal `act(...)` warnings from existing unrelated rider-page scenarios; the new upload-lifecycle file passed without those warnings। This is not a claim of a warning-free full application suite。 No fresh browser or physical-device acceptance claimed in this batch。

## Explicit scope limits

- **Upload ownership is not transport cancellation.** Superseded/abandoned uploads can continue and leave remote media; no deletion/abort protocol or global upload serialization added。
- The lock is about the latest selected upload in one modal, not all old physical upload operations. A completed newest upload can enable Submit even if an obsolete upload request is still pending, whose result is ignored。
- A never-settling latest upload retains the pending lock; no arbitrary timeout introduced。 Cancel can close the modal but does not cancel that transport。
- Assignment isolation relies on the existing keyed caller or actual unmount. Changing arbitrary callback props on the same mounted/keyed modal is not a new identity API。
- **Already-started delivery-submit requests and parent `handleDeliver` success effects are unchanged.** This patch does not serialize duplicate delivery mutations, suppress every stale delivery callback, roll back a delivery or close the remaining delivery-mutation lifecycle investigation。 Tests here guard upload publication and prevent starting a submission while latest upload is pending; they do not certify independent mutation completion ownership。
- Real camera/file chooser, Cloudinary configuration/signing/storage cleanup, rider/customer/staff permissions/RLS, deployed concurrency, proof acceptance and native device workflows still require staging/device checks。
- Prior S01 development dependency findings remain open; production-only audit zero is not full tooling security clearance。
- No commit, push, merge or deploy。

## Evidence files

Workspace logs, not Git deliverables:

- `/home/user/pin-upload-{red,green,green-final,green-verified}.log`
- `/home/user/pin-upload-full-suite-final.log`
- `/home/user/pin-upload-{lint,types,build,production-audit}-final.log`
- `/home/user/pin-upload-{lint,types}-verified.log` — final test-fixture refinement-এর পরে targeted lint / incremental typecheck

Earlier work: [consolidation](final-build-consolidation-2026-10-22.md), [settlement modal](settlement-modal-lifecycle-2026-10-23.md), [failed-attempt proof](failed-proof-lifecycle-2026-10-22.md)।

## Subsequent delivery-submit follow-up

The independent delivery-submit/page-callback investigation noted above now has a bounded implementation and evidence in [O35 delivery-submit ownership](delivery-submit-lifecycle-2026-10-23.md). That coordinator retains same-assignment pending locks across Cancel/reopen, guards selected-intent publication and preserves normal success after helper-owned feed refresh. O34 counts/scope remain historical; transport cancellation, media cleanup and broader hook/staging/device limits are not closed by that follow-up.
