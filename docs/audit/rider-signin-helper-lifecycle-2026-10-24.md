# O42 — Raw rider sign-in helper ownership

Date: 24 October 2026. Follow-up to [O41 actual login UI](rider-login-submit-lifecycle-2026-10-24.md). No commit, push or deployment.

## Scope and reproduced evidence

This batch covers the separate public `useRiderSession.signIn` method. The real login page still uses its own direct SDK path protected by O41; this is not a replacement for that page fix or global credential serialization.

Initial 12 actual-hook fixtures against original helper: **8 FAIL / 4 PASS, 0.941 s**. Expanded 16 fixtures with controlled rollback of **only the original sign-in method**, preserving surrounding dirty session/jobs/stats work: **11 FAIL / 5 PASS, 0.903 s**. Guarded source restored by exit trap.

Reproduced: duplicate SDK dispatch, lock not covering probe, captured/unmounted callback dispatch/follow-up, abandoned accepted result after sign-out, login dispatch during pending logout, unexpected rejection escaping, and login intent not isolating shift completion.

## Changes

Only the session portion of `src/lib/use-rider.ts` changed; jobs/stats and actual login page preserved.

- Per-effect session owner has a sign-in ref lock through SDK and awaited session probe. Same-owner duplicate login, or login during pending sign-out, returns a non-success busy message before dispatch.
- Captured login after unmount does not call the SDK. Unmounted/invalidated success neither probes nor returns the helper's current success signal. A new mount has its own lock; abandoned completion cannot release it.
- Login captures an incremented local auth revision. Existing sign-out advances that revision immediately, so an older login cannot refresh/return current success after sign-out, even when logout settles first or the login probe was already pending.
- Beginning a configured login invalidates earlier shift completion intent. Shift save cannot start while this helper is changing identity. This is conservative client completion ownership even if the login subsequently fails; it does not cancel an already-dispatched shift write.
- Unexpected SDK rejection returns `Sign-in could not be verified — please try again.` and releases the lock. Ordinary credential refusal retains `Email or password did not match.`; absent SDK retains the configuration guidance.
- Trimmed email/password payload, probe behavior and API-driven denial/eligibility decision preserved. **`null` retains its old meaning: SDK accepted and probe settled, not independent rider eligibility or remote-session verification.** A current pending-applicant probe may still yield guest/pending while `signIn` returns null.

Abandoned result: `Sign-in is no longer current — please try again.` Busy result: `A sign-in or sign-out is already in progress.` These are non-success client outcomes, not server rollback receipts.

No SDK configuration, credential policy, server route, permissions, approval or financial/scheduling rule changed.

## Permanent tests

`src/lib/__tests__/use-rider-signin-lifecycle.test.tsx`: **16 new direct-hook tests**, actual `riderFetch` with controlled fetch/SDK responses.

Coverage: current trimmed payload/probe; pending duplicate and probe lock; unmounted captured method/completion; pending/completed sign-out invalidation; login blocked during logout; rejected SDK safe copy/retry; current expected refusal and retry; missing SDK; pending rider eligibility; sign-out during probe; shift entry blocked during login; older shift intent invalidated; independent remount lock.

Actual page/session/shift regression fixtures remain separate. No authenticated credential/cookie, multi-tab or physical-device certification.

## Verification

| Check | Result |
| --- | --- |
| Focused sign-in/session/shift/actual login page | **5 files / 77 tests PASS, 4.26 s** |
| Targeted ESLint | PASS, no warnings |
| Full application suite | **598 files / 4,467 tests PASS, 546.24 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production dependency audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |
| Preview port 3100 | Running; `/rider/login` **HTTP 200** |

No warning-free full application-suite claim. Local tests/build are not operational acceptance.

## Remaining boundaries / release gates

1. **Physical SDK credential mutation is not cancelled or globally ordered.** If sign-out runs while an older login request is pending, that login may still change credentials after remote logout. Ignoring local completion does not undo it. No compensating logout is attempted, because that could destroy a newer legitimate session.
2. Locks/revisions belong to one session-hook effect owner. Other mounts/tabs, direct actual-page login, password recovery/apply, vendor/staff/customer SDK consumers and auth events do not share a new global mutex/provider. This is not whole-auth lifecycle certification or cross-tab synchronization.
3. A never-settling SDK/probe retains its login lock. While old SDK login is still pending, another login in that owner remains blocked even after a competing sign-out settles. No timeout, forced overlap or remote rollback policy added.
4. Refresh remains `Promise<void>` with no accepted-current-read receipt. A suppressed/failed probe is not independent eligibility verification. A read started before login may still publish while SDK login is pending; this batch does not add an SDK-event identity observer or claim it detects silent external/same-ID credential changes.
5. Beginning a login invalidates earlier shift intent whether login succeeds or fails. The earlier server write may still commit; stale return must not be read as refusal/rollback. Existing parent/UI ownership remains necessary.
6. Real authenticated account switching, SDK/cookie revocation failure, concurrent login/logout, cross-tab flows, approval/RLS and device acceptance require configured staging. No deployment money/concurrency, native GPS or production performance certification.
7. S01 development dependency findings remain open; no forced overrides, commit, push, merge or deployment.

## Evidence logs

Workspace-only `/home/user/signin-{red,red-final,green,green-final,lint-focused,full-suite-final,lint-final,types-final,build-final,production-audit-final,money-final}.log`.

Earlier reports: [O41](rider-login-submit-lifecycle-2026-10-24.md), [O40](rider-shift-save-lifecycle-2026-10-24.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Final participating rider-auth integration follow-up — 25 October

[O43 auth completion and release handoff](rider-auth-completion-2026-10-25.md) adds shared same-client SDK ordering to actual rider login, helper and logout, plus SDK-event synchronization for mounted rider sessions. **18 new tests; full 600 files / 4,485 PASS**, lint/types/build/diff PASS, production audit zero, money SQL 35 PASS groups. Earlier physical-race limit is narrowed for participating calls on the same browser client; other SDK consumers, cross-tab mutex, hung transport and real SDK/server/device acceptance are explicitly separated in the final ledger.
