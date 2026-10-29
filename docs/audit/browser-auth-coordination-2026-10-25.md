# Browser auth coordination — 25 October 2026

## Completed implementation

The previously rider-only SDK lane now has a generic `runBrowserAuthMutation` export (original export retained for compatibility). The actual rider login/helper/logout, vendor helper/login/logout, staff login/logout and self-service password change participate in this lane.

### Same-client and cross-tab ordering

- Existing same-client queue/supersession/rejection recovery retained.
- When `navigator.locks` exists, participating operations additionally acquire the origin-scoped exclusive Web Lock `bhromor:browser-auth`. Different participating tabs/SDK client objects therefore use a common browser lock instead of only independent JavaScript queues.
- Lock acquisition rejection propagates; there is no silent retry without a lock. Unsupported browsers explicitly retain the existing same-client/in-realm queue only. This is progressive enhancement, not a cross-tab guarantee on browsers lacking Web Locks.
- Running SDK work is not aborted; there is no timeout/force-steal policy. A never-settling locked operation blocks later participating operations until settlement or browser lock release. Web Locks are origin-scoped, not cross-device/global server locks. Supersession revisions remain local to a lane, not a universal timestamp for all tabs.

### Staff permissions and stale results

- Staff SDK login, getSession flush, API role probe and possible current refusal cleanup run as one lane operation. **Role verification is preserved; SDK acceptance never grants staff access by itself.** Credentials normalization, bearer token and current error mapping remain intact.
- A newer participating mutation invalidates the current operation's acceptance. A stale role refusal does not issue a compensating sign-out that would destroy a newer queued login.
- Staff sign-out advances an immediate local auth revision and includes pending staff login, not only already-authed state. An old login cannot publish the staff flag after sign-out.
- Staff refresh also checks this revision before probing/publication, so an old refresh cannot restore a flag after staff sign-out.
- Staff role probe is intentionally included in the lock: this protects the role decision/cleanup interval, at the cost of a slow/hung role probe also holding the auth lock. No hidden forced-overlap timeout was introduced.

### Vendor and password change

- Vendor helpers use the shared SDK lane, retain trimmed credentials, expected error copy, refresh and logout state behavior. This is SDK coordination, not a blanket new vendor read/UI-lifetime certificate.
- Self-service `updateUser({password})` joins the same lane, with an immediate duplicate guard, mounted-owner publication guard, safe unexpected rejection and pending-state release/retry. Existing validation, same-password refusal, payload and successful field clearing remain.
- Browser code inventory found no additional direct signInWithPassword/signOut/updateUser mutation sites outside these integrated paths. Server-side applicant creation/sign-in and HTTP recovery/apply workflows are not browser SDK calls and were not rewritten or wrapped in a browser mutex. No customer credential SDK mutation path was invented.

## Evidence

**11 added tests**:

- Ten `src/lib/__tests__/browser-auth-coordination.test.ts` cases: staff payload/token/role success, current role refusal cleanup, superseded refusal without destructive cleanup, pending login then logout, old refresh then logout, safe rejection/retry, Web Lock non-overlap across simulated clients, lock failure without unlocked dispatch, vendor sign-in and logout joining the shared client queue.
- One added self-service password rejection/retry case in the existing card tests.

Controlled replacement of **only the three original staff functions** (sign-in/sign-out/refresh), preserving surrounding work: **4 FAIL / 4 PASS, 0.952 s** against the initial eight coordination fixtures. Current-role success/refusal and Web Lock cases passed; stale cleanup/login/refresh and unexpected SDK rejection cases failed. Guarded source restored by exit trap. This does not claim a real cross-tab exploit was reproduced.

| Check | Result |
| --- | --- |
| Focused queue/staff/vendor/password/rider regressions | **7 files / 66 tests PASS, 15.80 s** |
| Targeted lint | PASS |
| Full application suite | **602 files / 4,499 tests PASS, 670.66 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Full dependency audit | **0 vulnerabilities** |
| Production audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |
| Preview 3100 | Running; `/rider/login` **HTTP 200** |

Initial TypeScript verification detected the installed DOM LockManager signature inferring a nested Promise. The lane now explicitly awaits/unwraps the lock result. The earlier in-progress full run was stopped, then full/static verification restarted on the final source; no incomplete run is claimed as passing.

## Release acceptance still required

This completes the selected browser SDK coordination implementation, not whole-application operational certification.

1. Web Lock tests exercise an adapter contract with a deterministic LockManager fixture; **real two-tab browser delivery/SDK cookies and Android WebView support need acceptance**. Unsupported browsers only have local queue behavior. Server API/RLS remains authoritative.
2. No mutation can be rolled back by ignoring a UI callback. Network ambiguity, browser/tab crash, shared-cookie changes from non-participating server workflows, account recovery/apply HTTP operations and cross-device actions are not solved by an origin lock.
3. Vendor/staff/session UI publication outside the tested guards, already-visible global messages and raw server workflow concurrency are not blanket certified. These are scope limits, not newly asserted confirmed defects.
4. Native build/device tests, background GPS/camera/push, real payment/RLS/approval/financial reconciliation still require configured staging/devices. No staging credentials were requested, fabricated or used.
5. S01 remains closed for the verified installed tree, subject to the documented scoped xcode→uuid exception/removal policy. No dependency updates in this batch.
6. No commit, push, merge or deployment.

## Logs

Workspace-only `/home/user/browser-auth-{initial,red,new-green,green-final,lint-focused,full-suite-final,lint-final,types-final,build-final,full-audit-final,production-audit-final,money-final}.log`.

Prior: [rider auth handoff](rider-auth-completion-2026-10-25.md), [S01 closure](development-security-closure-2026-10-25.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Subsequent native browser acceptance

[Real Chromium two-tab acceptance](browser-auth-native-lock-acceptance-2026-10-25.md) narrows the earlier unit-only LockManager limitation: five native-lock tests now execute actual lane source in separate browser tabs, including no-overlap, abandoned login, explicit logout, holder-tab close and rejection recovery. Final browser regression **16 PASS / 54.1 s**, local CI step **5 PASS / 3.2 s**, lint/types/diff PASS; fresh full audit zero. Native tests are wired to the existing CI browser job, but GitHub CI was not dispatched. Real SDK credentials/cookies and physical-device acceptance remain separate; no app runtime change or new full-unit-suite claim in that batch.
