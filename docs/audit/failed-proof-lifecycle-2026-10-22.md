# Failed-attempt proof/form lifecycle — O30/O31

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

[Final consolidation](final-build-consolidation-2026-10-22.md)-এর upload/mutation lifecycle investigation থেকে bounded follow-up: rider dashboard-এর `FailedAttemptForm`। Controlled component reuse ও deferred helper responses দিয়ে finding reproduced। Real wrong delivery/proof attachment বা production incident-এর দাবি নয়।

## O30 — Old form work could change a later open/assignment

Configuration read, photo upload এবং failed-attempt report-এর completion ownership check ছিল না। Cancel/reopen বা prop assignment change-এর পরে পুরোনো result:

- New form-এ old photo/error বসাত।
- Old settings response নতুন required-photo mode বদলাত।
- Old report success নতুন draft clear/close করে old `onRecorded` callback চালাত।
- Unmounted report-ও parent success callback চালাতে পারত।

**Fix:** Exported form assignment ID keyed inner component ব্যবহার করে; assignment বদলালে drafts/proof/flags অন্য task-এ reuse হয় না। Same assignment-এর প্রতিটি open/close generation pending view work invalidate করে। Unmount active owner invalidate করে। Config/upload/report completion শুধু current view generation-এ তার UI result লিখতে পারে।

**Scope caution:** Production task lists কত ক্ষেত্রে component remount করে সেটি আলাদা; controlled prop-reuse reproduction মানেই real navigation-এ incident হয়েছে নয়।

## O31 — Out-of-order photo selection could submit the older URL

একই form-এ photo A upload pending রেখে photo B select → B finishes → A finishes: old A URL B-কে replace করত। Old completion newer upload-এর busy flag-ও clear করত; latest upload চলার সময় submit সম্ভব হতে পারত।

**Fix:** Upload request ticket latest chosen file-এর UI result/lock owns করে। Old success/failure new photo/error/busy state replace করে না। Latest photo URL request payload-এ যায়। Existing upload failure/no-photo-reason flow preserved; old completed good proof handling policy rewrite হয়নি।

## Preserve report non-overlap: view lifetime is not request cancellation

Cancel only closes the form; it does **not** cancel an initiated report। Same still-mounted assignment component-এ pending report transport lock close/reopen-এর পরেও থাকে। Pending report থাকা অবস্থায় reopened form থেকে দ্বিতীয় report send হয় না। Only that transport's completion releases its lock; stale view completion still cannot clear drafts, show an old error or notify the parent।

এই separation গুরুত্বপূর্ণ: blindly resetting every busy flag on close would allow another write while the old report might still commit। Final tests explicitly reject that behavior। An early full-suite process was stopped to make this safety refinement; it is **not** counted as a completed verification। Fresh final suite run is recorded below।

**Not a global serialization/idempotency guarantee:** Different component mounts/tabs, reassignment/navigation back to an ID, server concurrency এবং requests already sent remain server/protocol concerns। Old upload/report work is not cancelled, retried or rolled back। A stale successful report may still have committed; suppressing its callback is not evidence of server failure। Task reconciliation still uses existing application polling/reads।

## Preserved behavior

- Same helpers, assignment ID, reason and proof/no-photo payloads।
- Required/optional/off photo modes and existing no-photo settings-read fallback unchanged। Server proof/assignment authorization remains authoritative।
- Same-assignment Cancel/reopen preserves already completed draft/photo, as before; pending late uploads are not silently attached to the new open。
- Current successful report resets/closes and calls `onRecorded` once; current refusal stays inline with draft retained।
- Unexpected helper rejection releases its own lock and gives safe fallback text; actual helpers already document nonthrowing results, so these tests are defensive helper-rejection coverage, not claims that ordinary network failures escape those helpers。

Application change only `src/components/rider/dashboard/failed-attempt-form.tsx`। No API route, signed media upload parameters, Cloudinary configuration, migration, permission/RLS, failed-attempt eligibility/counting, payment/fee rules or dependency manifest changes।

## Evidence / coverage

`src/components/rider/dashboard/__tests__/failed-proof-lifecycle.test.tsx`: **23 new permanent scenarios**:

- Old upload success/failure after close/reopen and assignment change。
- Latest upload retains busy ownership; out-of-order completions submit only newest URL。
- Old report success/failure after cancel/reopen or assignment change; post-unmount callback suppression。
- Older settings response versus new open/new assignment。
- Reset completed draft/proof on assignment change; preserve completed same-assignment draft/proof。
- A → B → A does not reactivate A's previous instance/callback。
- Pending report lock survives close/reopen with one send; old upload cannot release next open's upload lock。
- Safe unexpected upload/report rejection and explicit retry。

Initial RED: **14 FAIL**, all original 14 scenarios。 Expanded final focused run with existing dashboard parts: **2 files / 62 tests PASS**, 3.33 s。

Actual component rendered with mocked delivery-action helpers and synthetic File objects। No real image processing/upload, authenticated report write, physical device or delivery acceptance performed। Existing 39 dashboard-part tests preserved; one existing synchronous test now awaits its async config update with React `act`, without removing assertions。 New async fixtures also flush their updates; final focused run has no form-related act diagnostics。

## Verification

| Check | Result |
| --- | --- |
| Focused new + prior dashboard parts | **62/62 PASS**, 2 files |
| ESLint | PASS, final safety-refined source |
| TypeScript | PASS, final safety-refined source |
| Production build | PASS, final safety-refined source |
| Full Vitest suite | **588 files / 4,260 tests PASS**, fresh final run 589.25 s |
| Production dependency audit | **0 vulnerabilities**, final run |
| `git diff --check` | PASS |

Logs: `/home/user/failed-proof-{red,green}.log`, `/home/user/failed-proof-{lint,types,build,production-audit}-final.log`, `/home/user/failed-proof-full-suite-final.log`। `/home/user/failed-proof-full-suite.log` was the stopped pre-refinement run, not a passing-suite claim。

## Remaining limits

- Scope is this mounted assignment form/open lifetime; not silent rider identity replacement with the same assignment prop/component instance。
- Uploaded media may exist after form cancellation, even though its stale URL is not attached to the reopened/new assignment form। No destructive/orphan-media cleanup added。
- An initiated report may commit after Cancel/unmount; old result suppression does not undo it。 Check current task/history before manually recording another attempt; no automatic retry added。
- No bounded timeout/cancel policy for a never-settling transport; pending same-assignment report deliberately remains locked rather than starting a potentially duplicate write。
- No exhaustive upload/compression/mutation lifecycle audit across the application, real Cloudinary/staging account flow, GPS/push/native/device/WCAG acceptance or S01 dev dependency remediation claimed。
- Historical dirty work preserved; no push/deploy。
