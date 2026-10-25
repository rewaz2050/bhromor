# O40 — Rider shift-save ownership and recovery

Date: 24 October 2026. Bounded follow-up to [O39 session reads](rider-session-read-lifecycle-2026-10-24.md). No commit, push or deployment.

## Scope and reproduction

The remaining shift-save boundary in `useRiderSession.setAvailability` and the real `RiderShiftCard`: duplicate PATCH, abandoned refresh/success/refusal, rider-scoped draft and UI completion, unexpected save rejection recovery. Sign-in SDK concurrency is explicitly not closed by this batch.

Evidence against the original behavior:

- First 12 hook fixtures: **10 FAIL / 2 PASS, 1.31 s**.
- Final 14 hook fixtures, controlled rollback of **only the old `setAvailability` method** while preserving surrounding dirty session/jobs/stats work: **12 FAIL / 2 PASS, 0.940 s**. Guarded source restored by exit trap.
- Original card against seven initial component fixtures: **6 FAIL / 1 PASS, 1.18 s**. Unexpected rejection fixture was added after recovery implementation; it is not counted as original-card RED evidence.

Logs: `/home/user/shift-{red,red-final}.log`, `/home/user/shift-card-red.log`.

## Changes

### Raw session shift helper

- Effect-owned shift lifetime follows authenticated status/rider ID. Captured helpers from disabled, replaced or unmounted owners cannot dispatch. A → B → A creates a new owner rather than reviving the abandoned one.
- Ref lock covers PATCH and its awaited session refresh. Duplicate same-owner saves return a non-success pending message without dispatching another PATCH. Old completion releases only its own lock, never B's.
- Successful current PATCH refreshes once as before. Abandoned completion neither starts that refresh nor returns `null` (the helper's success signal). Old refusal does not expose its server detail to another rider.
- Session owner records the latest accepted read identity before React publication, so a denial/replacement discovered by the save's own refresh cannot accidentally return success before the new render/effect runs.
- Sign-out increments a separate auth revision immediately. Pending saves are invalidated before the SDK settles, not just after guest UI commits. This does not add SDK cancellation or whole-auth mutation serialization.
- Current server refusal/error text, PATCH path/body and current retry behavior preserved. Stale/unavailable completion returns `শিফটের অবস্থা নিশ্চিত করা যায়নি — প্রোফাইল আবার খুলুন।`; this is not proof a dispatched server write was rolled back.

### Actual shift card

- Rider-keyed inner editor resets draft/error/busy ownership for a new identity. Pending same-editor save has a synchronous ref guard and active-owner completion check.
- Selects, weekday controls and reset are disabled during save; save remains disabled and section has `aria-busy`. Current submitted draft cannot silently change while its result is pending.
- Abandoned success/refusal/unmount cannot publish error, clear another editor's busy state or call the parent flash callback.
- Unexpected rejected/thrown `onSave` shows `শিফট সেভ নিশ্চিত করা যায়নি — আবার চেষ্টা করুন।`, releases controls and allows retry. Current ordinary refusal is an alert; current success keeps existing Bangla feedback.
- Existing hour/null conversion, sorted weekday payload, Any/reset behavior, server-backed on-shift clock badge and server scheduling policy retained. No new availability validation or business-rule changes.

## Tests

**22 new tests**: 14 direct session-hook tests in `src/lib/__tests__/use-rider-shift-lifecycle.test.tsx`; eight real-card tests in `src/components/rider/__tests__/rider-shift-card.test.tsx`.

Hook coverage: current payload/refresh; write and read locks; captured stale/guest/unmounted callbacks; replacement/ABA completion; sign-out while write pending; current refusal/retry; old private refusal; independent B lock; current follow-up denial and identity replacement.

Card coverage: new rider draft; old success/refusal/unmount suppression; controls pending/re-enabled; normal sorted payload/feedback; B pending after A settles; unexpected rejection and successful retry.

Real hook/fetch-wrapper and real card are exercised separately with controlled dependencies. Existing profile-page tests mock the child and session and remain regression coverage, not authenticated end-to-end proof.

## Verification

| Check | Result |
| --- | --- |
| Focused shift/card/session/availability/profile page | **5 files / 60 tests PASS, 4.39 s** |
| Targeted ESLint | PASS, no warnings |
| Full application suite | **596 files / 4,437 tests PASS, 583.75 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production dependency audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |
| Port 3100 preview | Existing server retained, homepage **HTTP 200** |

No warning-free application suite claim. Local component/SDK/SQL tests do not replace configured staging/device acceptance.

## Remaining boundaries

1. **Sign-in SDK mutation lifetime/concurrency remains separate**: late sign-in and competing sign-in/sign-out can affect shared credentials. No global auth epoch/subscription/provider, cross-mount/tab serialization or permission enforcement added. Silent same-ID credential replacement without an observed session transition is not newly detected.
2. Started PATCH/read/SDK requests are not cancelled or rolled back. Distinct owners/mounts/tabs can physically overlap. A never-settling current save/read retains its lock; no timeout or forced unlock policy. Non-null stale result is not a server commit certificate.
3. `refresh(): Promise<void>` still has no accepted-current-read receipt. A superseded read can resolve without current publication; no guarantee a probe observes post-commit state. The helper checks latest observed identity/lifetime, not an independently verified server transaction boundary.
4. Card scoping resets draft on rider identity, not every same-rider server metadata update. Already-visible profile-page global flash, broader profile form ownership and cross-device draft reconciliation are not blanket closed here.
5. Real authenticated shift/capacity/timezone enforcement, session switching, SDK/cookie revocation, RLS and operational concurrency require configured staging. Native/background GPS, money correctness in deployment and production performance are not certified by these fixtures.
6. S01 development dependency findings remain open. No dependency overrides, commit, push, merge or deploy.

## Logs

Workspace-only `/home/user/shift-{red,red-final,card-red,hook-green,green,green-final,lint-focused,full-suite-final,lint-final,types-final,build-final,production-audit-final,money-final}.log`.

Earlier evidence: [O39](rider-session-read-lifecycle-2026-10-24.md), [O38](rider-availability-lifecycle-2026-10-24.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Subsequent actual-login UI follow-up

[O41 rider login submit lifecycle](rider-login-submit-lifecycle-2026-10-24.md) covers the actual page's direct SDK submit, duplicate guard, unmount follow-up suppression and safe unexpected-error recovery. **14 new tests; full 597 files / 4,451 PASS**, lint/types/build/diff PASS, production audit zero, money SQL 35 PASS groups. This is not physical SDK cancellation or global sign-in/sign-out serialization; the separate raw sign-in helper and cross-tab credential effects remain explicit boundaries.
