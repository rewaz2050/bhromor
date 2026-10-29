# O41 — Actual rider login submit ownership and recovery

Date: 24 October 2026. Follow-up to [O40 shift-save](rider-shift-save-lifecycle-2026-10-24.md). No commit, push or deployment.

## Scope and reproduced evidence

Inspection confirms `/rider/login` calls `supabase.auth.signInWithPassword` directly; it does not use the separate `useRiderSession.signIn` helper. This batch therefore targets the actual page's submit lifecycle, not an unused-path-only fix or a claim of global auth serialization.

Original handler with first 12 new page fixtures: **4 FAIL / 8 PASS, 1.40 s**. Expanded 14 fixtures with controlled rollback of only the handler's new guards/error recovery: **5 FAIL / 9 PASS, 1.46 s**. Surrounding prior page changes preserved; guarded source restored by exit trap. Failures reproduced same-batch duplicate SDK dispatch, abandoned success triggering refresh, exposed unexpected SDK/probe exception detail and old success probing after remount.

Logs: `/home/user/login-{red,red-final}.log`.

## Implementation

`src/app/rider/login/page.tsx`:

- Effect-owned submit lifetime plus immediate ref lock. Same-batch/programmatic duplicate submits are blocked before another SDK call, not only after the busy render commits.
- Lock remains held through SDK login and the awaited session probe. Existing busy/disabled inputs and submit button stay in place.
- Unmount deactivates the submit owner. Late SDK success does not start a session probe; abandoned refusal/rejection/finally does not publish local error/busy state. A new mount owns its own lock.
- Current unexpected thrown/rejected SDK or probe error uses `লগইন যাচাই করা যায়নি — আবার চেষ্টা করুন।` instead of raw exception detail, then unlocks for retry. This reports verification uncertainty, not rollback of an already-accepted authentication.
- Expected SDK error responses retain existing confirmation/credential/rate-limit mapping. Identifier/email normalization, Bangla phone-to-synthetic-email conversion, password validation/focus, absent-service guidance, pending approval polling/status/KYC and the session-driven `/rider` redirect are preserved.

No session hook, SDK configuration, login credentials/payload, auth route, password policy, application approval or server permissions changed in this batch.

## Permanent tests

`src/app/rider/login/__tests__/rider-login-lifecycle.test.tsx`: **14 new actual-page tests**.

Coverage: same-batch duplicate submit; unmount before SDK success; safe unexpected SDK/probe rejection and retry; lock through probe; normal email credentials; Bangla phone normalization; three existing expected SDK refusals; invalid identifier/short password dispatch prevention; absent SDK; remount independence/old success; abandoned probe rejection not affecting new page.

Actual login component is rendered; SDK/session/router/poll and unrelated recovery/KYC panels are controlled fixtures. Existing ten login-page tests remain unchanged. This is not real credential/cookie or staging acceptance.

## Verification

| Check | Result |
| --- | --- |
| Focused actual login/session/shift hooks | **4 files / 61 tests PASS, 4.08 s** |
| Targeted ESLint | PASS, no warnings |
| Full application suite | **597 files / 4,451 tests PASS, 622.00 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production dependency audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |
| Preview port 3100 | Running; `/rider/login` **HTTP 200** |

No warning-free application-suite claim. Local fixtures do not certify deployed identity, cookie revocation or physical-device behavior.

## Remaining boundaries

1. **Already-started SDK authentication can change shared credentials after the page unmounts.** Ignoring its UI result is not abort, logout compensation or server rollback. Separate mounts/tabs/SDK callers can still overlap physically. A never-settling current SDK/probe retains its same-mount lock; no timeout/forced unlock.
2. **Global auth mutation ordering remains separate**: competing login/sign-out, SDK auth events, cross-tab synchronization, password reset/apply and other SDK consumers are not serialized by this page ref. The separate raw `useRiderSession.signIn` method is unchanged. No whole-auth lifecycle certificate.
3. Guard scope is the mounted page, not a new external identity/credential epoch. Already-visible form errors and same-mount external session transitions/recovery panels are not comprehensively reset or coordinated here. Existing session-read guards remain necessary.
4. An already-started session probe is not cancelled. `refresh(): Promise<void>` is not a verified-current-session receipt, and routing remains driven by observed session status, not the SDK promise alone. A probe failure after accepted SDK login does not prove authentication failed or rolled back.
5. Real account switching, SDK/cookie revocation failures, approval/RLS behavior, multi-tab login/logout, credential recovery and native/device acceptance require configured staging. No new production performance, money/concurrency or GPS certification.
6. S01 development dependency findings remain open. No dependency overrides, commit, push, merge or deployment.

## Evidence logs

Workspace-only `/home/user/login-{red,red-final,green-final,lint-focused,full-suite-final,lint-final,types-final,build-final,production-audit-final,money-final}.log`.

Historical evidence: [O40](rider-shift-save-lifecycle-2026-10-24.md), [O39](rider-session-read-lifecycle-2026-10-24.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Subsequent raw sign-in helper follow-up

[O42 raw sign-in helper ownership](rider-signin-helper-lifecycle-2026-10-24.md) scopes the separate helper's SDK/probe lock, unmount/sign-out completion and shift-intent isolation. **16 new tests; full 598 files / 4,467 PASS**, lint/types/build/diff PASS, production audit zero, money SQL 35 PASS groups. Actual page remains on its O41 direct SDK path. Neither batch globally orders physical credential mutations across callers/mounts/tabs or certifies remote logout.
