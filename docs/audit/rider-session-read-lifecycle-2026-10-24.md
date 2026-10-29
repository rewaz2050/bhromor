# O39 — Rider session read and sign-out publication ownership

Date: 24 October 2026. Bounded follow-up to [O38 availability](rider-availability-lifecycle-2026-10-24.md). No commit, push or deployment.

## Reproduced problem and scope

O38 explicitly left `useRiderSession.refresh` internal publication unguarded. Older `/api/rider/me` success could replace a newer identity/denial; old failure could erase a newer authenticated session. A pending read could also restore identity after sign-out. Captured refresh/sign-out callbacks still dispatched after unmount.

Initial 17 direct-hook fixtures against the original session implementation: **9 FAIL / 8 PASS, 1.02 s**. Final expanded fixtures were run against a controlled replacement of **only the original session function** (not the already-dirty jobs/stats module): **13 FAIL / 10 PASS, 0.968 s**. Guarded source restored by shell exit trap. Evidence: `/home/user/session-read-{red,red-final}.log`.

The extra Strict Mode fixture initially used a nested wrapper, which did not replay root effects in this React version. It was corrected to Testing Library's root `reactStrictMode: true`; the test verifies two actual probes before asserting stale completion isolation. No claim based on a non-replaying wrapper.

## Implementation

Only `useRiderSession` changed in `src/lib/use-rider.ts`; existing jobs/stats and parent coordinators preserved.

- Effect-owned mount lifetime plus monotonic read revision. Every new current refresh supersedes publication from older reads, including late JSON parsing/error completion. HTTP requests are not cancelled or deduplicated.
- One coherent session snapshot contains rider/email/status/error/denyReason. Updates recheck owner and revision inside functional state publication, not just before enqueueing it.
- Current authed identity stays visible during a refresh. Non-authed refresh uses checking; current success authenticates; current failure clears identity. Current 403 keeps original message/reason (unknown/missing reason falls back to `none`); ordinary failures still become guest without a permission-denial message.
- Sign-out invalidates outstanding reads **before** awaiting the SDK. Reads during this owner's pending sign-out do not dispatch against credentials being removed. Duplicate sign-out calls in this owner await its shared pending operation.
- Sign-out still clears local identity after SDK settlement, including rejected SDK promises, and releases its lock. Local guest does **not** independently certify successful remote credential revocation. A never-settling SDK operation keeps this owner's sign-out lock and blocks its new probes; no timeout or forced-unlock policy added.
- Unmounted refresh/sign-out callbacks do not dispatch. Abandoned owners cannot publish after completion. Strict Mode replay has a separate effect owner.

Public hook fields/signatures, `/api/rider/me` GET/no-store behavior, login password/email processing, shift-save payload, denial mapping, routes, authorization and server business rules remain unchanged. No new auth subscription, global session provider or cross-mount synchronization.

## Permanent tests

`src/lib/__tests__/use-rider-session-lifecycle.test.tsx`: **23 new direct-hook tests** with actual `riderFetch` and controlled fetch/SDK responses.

Coverage: older success versus newer success/denial; older refusal versus newer authentication/checking; current last-known identity during refresh; old reads during/after sign-out; late denial after sign-out; suppression of probes during pending sign-out; pending sign-out deduplication; stale callbacks after unmount; independent remount; all four current denial reasons and unknown fallback; ordinary network failure; rejected sign-out then fresh probe with original GET options; late JSON parsing; retry clearing denial; actual root Strict Mode replay.

DOM/HTTP/SDK fixtures are not authenticated staging, real cookie revocation or multi-tab acceptance.

## Verification

| Check | Result |
| --- | --- |
| Focused session/availability/jobs/page | **4 files / 163 tests PASS, 8.87 s** |
| Targeted ESLint | PASS, no warnings |
| Full application suite | **594 files / 4,415 tests PASS, 591.81 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production dependency audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |

Existing rider-page fixtures emit non-fatal React act warnings. No warning-free full-suite or browser/device certification claim.

## Remaining boundaries / release gates

1. **Sign-in and shift-save mutation ownership remain separate.** Their existing SDK/PATCH dispatch, post-await refresh intent and caller feedback have not been comprehensively scoped here. In particular, concurrent sign-in versus sign-out and a late sign-in after unmount can still affect shared SDK credentials. A late successful mutation can initiate a new refresh while the hook remains mounted; this patch does not classify that as stale intent. Do not treat this as whole-auth/session lifecycle certification.
2. Guard scope is one hook mount and its read/sign-out revisions. Silent credential replacement, another tab/device, other independently mounted session hooks and SDK auth events are not observed by a new global epoch. Shell/page use separate hook instances; no application-wide sign-out lock or immediate session broadcast added. Server authorization stays authoritative.
3. Started reads/SDK operations may finish after unmount; no abort, rollback or global serialization. Latest-started probe wins even if older transport completes first. A never-settling latest read can leave checking/last-known identity while older completions are deliberately ignored. No timeout or response DTO validation added.
4. `refresh(): Promise<void>` remains compatible: an ignored or superseded completion is not a verified-current-session receipt for its caller. Parent workflow guards remain necessary; no guarantee every post-mutation probe observes committed server state.
5. Real authenticated account switching, cookie/SDK revocation failure, multi-tab login/logout, RLS/eligibility and staging/device operational flows still require configured acceptance. Native/background GPS, money/concurrency and production performance are not certified by these tests.
6. S01 development dependency findings remain open; no dependency overrides, commit, push or deployment.

## Evidence logs

Workspace-only `/home/user/session-read-{red,red-final,green,green-final,lint-focused,full-suite-final,lint-final,types-final,build-final,production-audit-final,money-final}.log`.

Historical evidence: [O38](rider-availability-lifecycle-2026-10-24.md), [O37](rider-jobs-hook-lifecycle-2026-10-24.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Subsequent shift-save follow-up

[O40 shift-save lifetime/recovery](rider-shift-save-lifecycle-2026-10-24.md) addresses the bounded shift-save mutation/refresh and actual card draft/completion boundary above. **22 new tests; full 596 files / 4,437 PASS**, lint/types/build/diff PASS, production audit zero, money SQL 35 PASS groups. Sign-in SDK concurrency, silent credential replacement and application-wide session synchronization remain separate; this is not whole-auth certification.
