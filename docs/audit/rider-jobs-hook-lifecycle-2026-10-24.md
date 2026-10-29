# O37 — Raw rider jobs read/mutation/realtime ownership

২৪ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

O36-এর explicit remaining raw-hook boundary examined using actual `useRiderJobs` and actual `riderFetch`/error classification with mocked HTTP responses and realtime channels। Existing dirty work preserved; no commit/push/deploy। This is client context ownership, not a new server authorization or transaction protocol。

## Evidence before final implementation

Initial 28-scenario run: **18 FAIL / 10 PASS**. A success-matrix fixture was then made deterministic: wait for the new context’s automatic/explicit read to settle before installing a deliberate current-read error. Otherwise its precondition could accidentally deduplicate against the successful automatic read rather than produce the intended current error。

Final expanded/corrected **35-scenario** suite was rerun with only the jobs-hook section temporarily restored to its original checked-in implementation; the surrounding dirty session/stats work was preserved. Result: **23 FAIL / 12 PASS**. Guarded implementation restored immediately; all 35 passed. This corrected RED run is the primary reproduction count, not an assumption that every original failure was a clean precondition。

Confirmed controlled findings:

- Pending read from rider A reused a shared lock after identity change and could block B’s read. A completion could populate B’s data/loading or unlock a newer pending read; disabled state retained old view data。
- Mutation helpers captured callbacks by enabled status alone (or no context dependencies). Old success could clear a current error, start follow-up refresh, or report current success after identity replacement. Old refusal could publish into the new hook error state。
- Old captured methods could still dispatch after their owner changed/unmounted. Disabled online/location/settlement/assignment helpers lacked a uniform enabled-context dispatch boundary。
- Late old realtime callbacks could mark another channel live or trigger stale reads。

No real cross-account API read/write, financial incident or server authorization bypass is inferred from mocked responses. Existing current-operation behavior also passed baseline cases; not every hook path was declared broken。

## Implementation — `src/lib/use-rider.ts`

### Context-scoped view and read ownership

- Immutable token keyed by observed `enabled` + optional rider ID. Each committed effect lifetime owns its active flag and pending read promise; cleanup deactivates that owner. A → B → A and disable/re-enable create independent owners, not reactivated old requests。
- Jobs, settlements, pending/recent claims, claims-ready, loading, error and live state are held in one token-tagged snapshot. New/disabled contexts expose defaults rather than old owner data. Same-context partial failures retain last-good data as before。
- `refresh()` deduplicates only within its active owner. New context can read while old transport is unresolved. Only the captured current owner can publish fields/loading; old finally clears only its own read lock. Guard is checked again inside the queued state updater。
- Jobs/settlements still use `Promise.allSettled`: failed jobs can retain last-good jobs while successful side data updates; side-panel failure sets claims-ready false without blanking valid jobs/old side data。

### Mutation ownership

Accept, pickup, reject, deliver, online, location and settlement methods retain their public signatures and HTTP payloads, but callback dependencies now track the active context. Entry guard rejects stale captured/disabled/unmounted methods before dispatch. Completion guards suppress abandoned error clear/set and follow-up refresh.

**Stale result returns `false`**, including a successful endpoint response whose owner is no longer current. This means no accepted current-client result—not proof the server refused, cancelled or rolled back the request. Parent coordinators remain necessary for their own UI effects after separate awaits。

Current-path behavior preserved and tested:

- Assignment actions POST and refresh after acknowledged success; current 409 refreshes once before preserving conflict text; ordinary non-409 refusal does not refresh。
- Online/location PATCH payloads unchanged; neither adds a feed refresh. Current location failure remains silent and does not replace an existing error。
- Settlement POST method/reference unchanged; successful current claim clears error and awaits existing refresh. Settlement refusal keeps its own original error behavior; no new assignment-style 409 policy imposed。
- Existing current read deduplication remains. No new guarantee that an already-running same-context read necessarily represents post-mutation committed state; existing later reads/realtime/polling still reconcile server state。

### Realtime and polling

Same rider-filtered channel naming/configuration, channel removal, 15-second ordinary polling and 120-second live backup retained. Both channel-active and hook-owner guards suppress old callback publication/read triggers. New context starts its own initial refresh. Optional missing rider ID still prevents channel creation, not a new mandatory-ID/API authorization requirement。

Session/stats hook implementations, routes, request formatting/error parser, server eligibility/PIN/proof/financial/RLS rules, dependency manifests and UI coordinator business behavior are untouched. Next remains **16.4.2**。

## Permanent tests

`src/lib/__tests__/use-rider-jobs-lifecycle.test.tsx`: **35 new tests**. Existing 4 realtime tests retained unchanged。

Coverage includes:

- Seven-method stale-success and current method/path/body/refresh matrices; six stale-refusal cases plus explicit silent location failure。
- Independent new-rider reads, old completion against B’s pending lock, disabled view/reset and disabled dispatch。
- Old channel events/status, captured methods after identity replacement/unmount, A → B → A mutation and disable/re-enable read ownership。
- Current 409 versus ordinary refusal; both partial-read failure directions; same-owner dedup/unlock/retry; identity change during a mutation’s follow-up read; stale 409 must not start recovery in B。

Actual hook/fetch-wrapper execution; network and realtime are controlled fixtures. No real authenticated staging account or physical network/device acceptance claimed。

## Verification

| Check | Result |
| --- | --- |
| Focused hook/realtime/task-actions/stats/page/profile | **6 files / 141 tests PASS, 10.09 s** |
| Targeted ESLint | PASS, no warnings |
| Full application suite | **592 files / 4,371 tests PASS, 623.16 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Production dependency audit | **0 vulnerabilities** |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |

Focused new lifecycle/realtime tests passed without `act(...)` warnings; existing rider-page fixtures still emit non-fatal act warnings. No warning-free full-suite or fresh browser/device certification claim。

## Remaining limits / release gates

1. Already-started requests may commit after context replacement/unmount. No abort, rollback, idempotency or global mutation serialization added. A stale `false` is not a server-commit outcome certificate。
2. Physical reads/mutations can overlap between old/new contexts or separate mounts/tabs/devices. Within one current owner, a never-settling read still holds its read lock; no timeout/forced overlap policy. Mutations are not newly serialized by this raw hook; existing UI coordinators retain their separate scoped locks。
3. Scope observes enabled status and rider ID, not silent credential replacement while those values stay the same. Server authorization remains authoritative; this is not permission enforcement by the ID argument。
4. This closes the tested raw-hook publication/refresh boundary left by O36, not every parent workflow. The page’s online-toggle/availability override and later GPS/session-refresh callbacks, already-visible flash/error reset, and other session helpers remain separate review/manual-acceptance boundaries. Prior UI coordinators remain preserved。
5. Response DTO validation, hung-transport timeout policy, remote proof-media cleanup and real realtime delivery are not added/certified here。
6. Valid/invalid customer PIN, rider/staff RLS, offer/capacity races, deployed financial/concurrency reconciliation, camera/native background/GPS and cross-device flows need configured staging/device acceptance. Component HTTP fixtures and isolated SQL regressions are not substitutes。
7. S01 development dependency findings remain open. No commit, push, merge or deploy。

## Evidence files

Workspace logs (not Git deliverables):

- `/home/user/jobs-hook-{red,red-final,green,green-final}.log`
- `/home/user/jobs-hook-lint-focused.log`
- `/home/user/jobs-hook-full-suite-final.log`
- `/home/user/jobs-hook-{lint,types,build,production-audit,money}-final.log`

Earlier work: [O36 parent action ownership](rider-task-actions-lifecycle-2026-10-23.md), [delivery-submit ownership](delivery-submit-lifecycle-2026-10-23.md), [consolidation](final-build-consolidation-2026-10-22.md)।

## Subsequent parent availability follow-up

[O38 availability and one-shot GPS ownership](rider-availability-lifecycle-2026-10-24.md) addresses the bounded parent online-toggle/override/cash-confirmation and one-shot callback boundary above. Full **593 files / 4,392 tests PASS** with 21 added tests, lint/types/build, production audit zero and money SQL 35 PASS groups. Raw session-refresh internal publication remains unscoped and explicitly separate; no whole-session, background-GPS or device certification is implied.
