# Rider auth completion and final release handoff — O43

Date: 25 October 2026. Branch `arena/bcb37d54-bhromor`. No commit, push, merge or deployment.

## What is completed in this batch

The previously explicit **participating rider auth ordering** and **mounted session SDK-event synchronization** boundaries now have client implementations and permanent tests. This closes those bounded local implementation items; it does not certify every operational workflow or every SDK consumer in the application.

### Shared rider auth lane

`src/lib/rider-auth-lane.ts` is used by the actual rider login page, `useRiderSession.signIn` and `useRiderSession.signOut`.

- SDK mutations on the same browser client run in enqueue order, including operations initiated by different mounted rider components. The queue covers SDK work only, not follow-up API reads, avoiding a hung probe blocking remote logout.
- A running login settles before queued logout starts. A newer participating intent suppresses accepted publication from the older login; queued superseded/abandoned login is skipped before SDK dispatch.
- An explicit logout remains queued even when its originating view unmounts. No compensating logout is issued after arbitrary late login, which could destroy a newer intended session.
- SDK rejection does not poison the queue. Distinct SDK client objects remain independent. Existing current payload/error/eligibility policy is retained.
- Local owner locks still guard each view/helper's pending work and follow-up UI publication. This layer is scoped to participating rider calls, not a replacement for SDK/server authentication locks or a claim about previously deployed SDK internals.

### SDK auth events to mounted rider sessions

Each mounted rider session subscribes to the SDK and unsubscribes on cleanup.

- `SIGNED_OUT` invalidates reads, clears rider/email/error/denyReason and presents guest without an extra probe.
- `SIGNED_IN` and `USER_UPDATED` discard old identity and schedule an API eligibility recheck; they do not grant rider permissions directly.
- `TOKEN_REFRESHED` preserves last-known identity while scheduling a recheck. `INITIAL_SESSION` does not duplicate the existing initial probe.
- Rechecks run on a deferred timer, never awaited inside the SDK auth callback. Newer events, manual reads and cleanup suppress obsolete timers/read publication.
- Auth-event reset has its own event generation: a same-batch manual refresh cannot cancel the identity clear and accidentally retain the old rider while checking.
- A pending own sign-in is guarded by the shared lane rather than being invalidated by its own SDK sign-in event. While own logout is pending, older non-logout SDK events do not replace its view or prevent local settlement.

SDK-delivered events can reconcile separate mounts and events originating from another tab. This is not independently verified cross-tab event delivery or a cross-tab mutation mutex.

## Tests and observed verification

**18 new tests**:

- `src/lib/__tests__/rider-auth-lane.test.ts`: six queue policy tests — running login then logout; abandoned queued login; supersession/newest login; logout surviving unmount; rejection recovery; separate clients.
- `src/lib/__tests__/use-rider-auth-sync.test.tsx`: 12 actual-session-hook tests — multiple mounts; deferred SDK-event probe; initial event; superseded timer; late read; unsubscribe/saved callback; token refresh; eligibility denial; own login event; two-mount real lane integration; same-batch auth reset; logout with older sign-in event.

The same-batch reset fixture first produced **1 FAIL / 11 PASS** before the event-generation fix. New queue/event contracts are deliberately added behavior; they are not all claimed as reproduced production defects. Existing O41/O42 fixtures were adjusted only to flush asynchronous queue dispatch where they intend to test an already-started SDK operation. The initial focused run exposed those fixture timing assumptions; the corrected final suite passes.

| Check | Result |
| --- | --- |
| Focused queue/events/session/shift/sign-in/actual login | **7 files / 95 tests PASS, 6.93 s** |
| Targeted ESLint | PASS |
| Full application suite | **600 files / 4,485 tests PASS, 613.85 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production dependency audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |
| Preview 3100 | Running; `/rider/login` **HTTP 200** |

Controlled fixtures are not real SDK cookie revocation, cross-tab/browser, deployed API or physical-device acceptance. No warning-free full-suite claim.

## Final remaining-work ledger

| Area | Status / acceptance required |
| --- | --- |
| Rider availability, jobs, delivery/settlement/action UI, shift, login submit/helper ownership | Implemented in prior batches and this batch, with bounded automated coverage; historical reports retain exact limits |
| Participating rider auth SDK ordering across mounted components | Implemented here, same-client browser-realm queue |
| Mounted rider SDK auth-event synchronization | Implemented here; actual browser/cross-tab delivery needs acceptance |
| Cross-tab/global SDK mutation serialization | Not added: other tabs/clients and customer/vendor/staff/apply/recovery SDK consumers do not join this queue |
| Hung transport, already-started SDK effects, tab/browser crash and remote rollback | No cancellation/timeout/rollback certificate; queue/owner locks can remain held until settlement |
| Authentication/RLS/approval/account-switch and remote revocation | Server remains authoritative; configured authenticated staging/cookie/multi-tab tests required |
| Money/payment/financial concurrency and real dispatch/PIN/proof reconciliation | Local SQL/HTTP coverage exists; deployed acceptance with configured accounts/provider required |
| Android native/background location, camera, push and physical permissions | Device/staging acceptance required; not certified by local DOM/SDK fixtures |
| Development dependency findings S01 | Still open; no forced overrides or downgrades |
| Release/deployment | Not performed or authorized by this handoff |

**No additional unverified defect or new feature phase is being declared necessary by this ledger.** Locally testable selected rider-auth implementation work is handed off with evidence. Operational gates above are not marked complete merely because local tests pass.

## Important operational semantics

- A never-settling SDK task blocks later same-client queue entries; there is no forced overlap policy. Already-dispatched requests may commit after unmount or tab failure. Logout completion/local guest is not proof of remote credential revocation.
- Non-participating SDK calls can still race. No app-wide provider, Web Locks cross-tab protocol, custom auth broadcast or credential storage was added.
- `refresh(): Promise<void>` and `signIn(): Promise<string | null>` retain their existing receipt limitations. An SDK-accepted login may still be denied rider eligibility by the API. SDK auth events never bypass server checks.
- Password recovery/application auth event handling and already-visible global messages are not blanket certified. Same-ID credential changes without SDK-delivered events are not independently detected.
- Existing business rules, credentials normalization, endpoint bodies, server permissions, financial/shift rules and dependency versions remain unchanged.

## Evidence

Workspace logs: `/home/user/auth-finish-{initial,green,reset-red,new-tests,green-final,lint-focused,full-suite-final,lint-final,types-final,build-final,production-audit-final,money-final}.log`.

Earlier context: [O42](rider-signin-helper-lifecycle-2026-10-24.md), [O41](rider-login-submit-lifecycle-2026-10-24.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Subsequent S01 dependency closure — 25 October

[S01 tooling security closure](development-security-closure-2026-10-25.md) supersedes the open development-dependency row above for the current tree. Compatible zod update and explicitly scoped/tested xcode→uuid 11.1.1 override give **full and production audits zero**; full **601 files / 4,488 PASS**, lint/types/build, money SQL 35 PASS groups and clean-install/Capacitor parser+CLI checks pass. The override is an intentional transitive major exception with removal/compatibility policy, not a forced whole-toolchain downgrade. Auth implementation and staging/device gates remain distinct and unchanged.

## Subsequent browser SDK coordination completion — 25 October

[Browser auth coordination](browser-auth-coordination-2026-10-25.md) extends the lane to vendor/staff/self-service password mutations and adds origin-scoped Web Locks where supported. This supersedes the corresponding unimplemented browser-SDK/cross-tab-lock rows above for participating calls in supported browsers. Staff role probe and stale cleanup/publication guards are tested. **11 new tests; full 602 files / 4,499 PASS**, lint/types/build, full+production audits zero and money SQL 35 PASS groups. Browsers without Web Locks retain local queues; server apply/reset workflows and real two-tab/SDK/native/device acceptance are not blanket certified.
