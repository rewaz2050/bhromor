# O38 — Rider availability and one-shot GPS ownership

Date: 24 October 2026. Follow-up to [O37 raw jobs lifecycle](rider-jobs-hook-lifecycle-2026-10-24.md). No commit, push or deployment.

## Scope and reproduced evidence

Bounded parent online/offline workflow: duplicate taps, provisional availability override, COD cash confirmation, session-refresh follow-up and its one-shot browser GPS callback. Existing delivery, assignment, settlement and raw jobs coordinators are preserved.

Eleven added actual-page tests against the original page produced **10 FAIL / 85 PASS, 4.25 s**, including **two unhandled rejection errors** from unexpected availability-write/session-refresh rejection. One new normal-path test and the original 84 page tests passed. This is intentionally failing reproduction evidence, not a clean passing run. Log: `/home/user/availability-red.log`.

## Implementation

- Added `src/lib/use-rider-availability.ts`, integrated into the actual rider page. Owner lifetime follows current live rider identity; disabling, replacement, unmount and A → B → A do not revive an old owner.
- An immediate ref lock prevents duplicate writes and remains held through the awaited session refresh. Pending button is visibly disabled, `aria-busy`, with `বদলাচ্ছে…`; fresh owners have independent locks and default confirmation/override views. No blanket cross-owner or cross-tab serialization.
- Current successful writes retain the provisional override while their refresh is pending; after settlement the observed session value wins. Old success/refusal/read completion cannot replace the new owner's local override, error or pending state, nor begin a stale follow-up refresh/GPS request.
- Existing cash threshold/helper and explicit “তবুও অফলাইন যাব” consent remain unchanged. Confirmation/dismissal are owner-scoped; choosing settlement does not itself force offline or claim cash reconciliation.
- Unexpected current write rejection releases the lock/override and shows `অনলাইন অবস্থা বদলানো যায়নি — আবার চেষ্টা করুন।`. A rejected refresh after acknowledged write instead says `অনলাইন অবস্থা যাচাই করা যায়নি — আবার চেষ্টা করুন।`: a failed verification is not proof the accepted server write was rolled back.
- One-shot GPS preserves `{ enableHighAccuracy: true, timeout: 8000 }` and latitude/longitude payload. Callback is single-use and requires the same active owner, latest availability request, unchanged GPS epoch and latest observed online truth. A new availability intent or observed online → offline transition permanently invalidates its old fix, even if online later returns. Old/unmounted callbacks and offline truth do not send location.
- Browser GPS errors, synchronous GPS/send throws and rejected location sends remain silent best-effort failures, not reasons to report an acknowledged availability write as failed.

No endpoint, server authorization, cash/financial/eligibility policy, dependency manifest or raw session hook changed in this batch. This is UI callback ownership, not transport cancellation or permission enforcement.

## Permanent tests

**21 added tests**: 11 actual-page tests in `src/app/rider/__tests__/rider-page.test.tsx` and 10 direct-hook tests in `src/lib/__tests__/use-rider-availability.test.tsx`.

Coverage: duplicate pending writes and visible busy state; old success/override/refusal isolation; cash confirmation scoping and explicit consent; unexpected write/read rejection recovery; GPS rider replacement/unmount/new offline intent; normal coordinates/options; independent new-owner lock during old refresh; disabled/stale handler dispatch; A → B → A; observed offline epoch; single-use fix and silent failed sends; server still offline after refresh.

Page tests exercise the actual page with controlled session/jobs dependencies. Hook tests exercise the coordinator directly. Neither substitutes for authenticated server/session integration or physical GPS acceptance.

## Verification

| Check | Result |
| --- | --- |
| Focused page/availability/jobs/task-actions/dashboard | **5 files / 187 tests PASS, 9.99 s** |
| Targeted ESLint | PASS |
| Full application suite | **593 files / 4,392 tests PASS, 541.96 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production dependency audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |

Existing page fixtures emit non-fatal React act warnings; no warning-free suite claim. Build/tests are local evidence, not staging/device certification.

## Remaining boundaries / release gates

1. **Raw `useRiderSession.refresh` still publishes rider/status internally without contextual ownership.** O38 prevents stale parent follow-up and post-await effects; it cannot undo an internal late session publication after a refresh legitimately started while its owner was current. Mocked page/session tests do not prove that boundary safe. This remains a separate hook-level review, not a closed whole-session lifecycle claim.
2. Started HTTP/GPS requests are not cancelled; server writes may commit after owner replacement/unmount. No rollback, global/cross-tab serialization or idempotency added. A never-settling write/refresh retains that owner's pending lock; while refresh is pending, its acknowledged provisional override can remain visible. No timeout policy added.
3. GPS uses observed client state, not an independent server eligibility certificate. An immediate fix before refreshed online truth is observed may be discarded; later state does not replay a consumed callback. Permission prompts/browser work may outlive the owner even though their completion is ignored.
4. Scope detects live/rider-ID transitions, not silent same-ID credential replacement. Existing page-global messages, other session helpers, continuous/native/background GPS and other operational flows are not blanket certified by this work.
5. Server availability/cash/capacity/RLS behavior, deployed network races, real authenticated session replacement, Android background behavior, physical GPS/permission recovery and cross-device acceptance still need configured staging/devices. SQL regression and DOM fixtures are not substitutes.
6. S01 development dependency findings remain open. No forced dependency overrides, commit, push or deployment.

## Evidence logs

Workspace-only: `/home/user/availability-{red,green,green-final,lint-focused,full-suite-final,lint-final,types-final,build-final,production-audit-final,money-final}.log`.

See [consolidation](final-build-consolidation-2026-10-22.md) for earlier completed batches and their historical evidence.

## Subsequent raw session-read follow-up

[O39 session read/sign-out publication ownership](rider-session-read-lifecycle-2026-10-24.md) addresses the bounded internal read race above: latest-started probe publication, mount ownership, sign-out read invalidation and pending sign-out probe suppression. **23 new tests; full 594 files / 4,415 PASS**, lint/types/build/diff PASS, production audit zero, money SQL 35 PASS groups. Sign-in/shift-save mutation follow-ups, silent credential replacement and cross-mount/tab synchronization remain separate; no whole-auth lifecycle certification.
