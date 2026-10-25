# Rider/vendor push hook ownership — O26/O27

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

[Dispatch mutation follow-up](dispatch-mutation-recovery-2026-10-22.md)-এর পরে notification hook lifecycle-এর controlled regression। Real push delivery, production subscription ownership বা permission bypass-এর দাবি নয়।

## O26 — One-time boot retained a previous enabled lifetime

`useRiderPush()` ও `useVendorPush()` একবার `booted.current=true` করার পরে disable/re-enable-তে আর local/server status পড়ত না। Subscribed phase, permission, errors ও busy state enabled lifetime-এর সঙ্গে reset হতো না। Pending local read unmount/disable-এর পরেও server status fetch এবং silent repair শুরু করতে পারত।

**Fix:** Observed `enabled` lifetime-এর immutable identity এবং effect-owned invalidation। Disabled output masked/reset; পরের enabled lifetime fresh probe করে। প্রত্যেক awaited read-এর পরে ownership check; stale local/status result নতুন server fetch বা automatic repair শুরু করে না। Loaded phase/local state শুধু current result থেকে commit হয়।

## O27 — Stale actions/repair completion overwrote current UI

Enable/disable callback enabled gate মানত না; saved callback পরবর্তী enabled lifetime-এ কাজ শুরু করতে পারত। Older enable/disable/repair result current subscribed/error/busy state বদলাত। Unexpected `enable*Push()` rejection busy release না করে reject করত।

**Fix:** Separate action/read tickets এবং captured lifetime identity:

- Disabled বা previous-lifetime callback নতুন operation শুরু করে না।
- New action invalidates pending probe/repair completion; current action ছাড়া অন্য completion busy/error/subscription state লিখতে পারে না।
- Successful enable-এর follow-up probe-তেও ownership rechecked। Stale enable returns false, current failure preserves existing localized permission/setup messages।
- Unexpected helper rejection safely handled; only its current owner may publish generic error/release busy। Internal browser error message exposed নয়।
- Busy now covers the current enable action including its follow-up probe, then clears in owned `finally`; old completion cannot unlock a newer action। No arbitrary timeout added।

Application changes শুধু `src/lib/use-rider-push.ts` এবং `src/lib/use-vendor-push.ts`। Underlying push clients, permissions, subscription endpoints/payloads, service worker, notification dispatch/delivery rules, auth/RLS, dependency manifests এবং UI components unchanged।

## Important boundary: UI ownership, not cancellation

Already-started client operations **are not cancelled, serialized, undone or rolled back**। A repair or subscription operation already running may still affect the browser/server after a UI lifetime change or explicit disable। The late-repair regression proves **displayed phase stays off**, not that the underlying endpoint cannot be re-registered or receive a push। Device/server outcome acceptance and stronger transport/protocol coordination remain separate work।

Stale enable returning false means current UI did not accept its completion; it does not prove subscription registration failed। No automatic retry or destructive subscription cleanup added merely because a hook became disabled।

## Preserved behavior / compatibility

- Existing English vendor and Bengali rider permission-dismissed/unconfigured/failure messages preserved।
- Current successful enable refreshes status; current disable updates local display/count as before।
- Confirmed server-not-configured/table-not-ready still maps to `off-server`।
- Failed server status fetch retains the previous unknown-server fallback rather than inventing migration absence।
- Existing blocker/recovery-step functions and permission-denied phase untouched; disabled output no longer exposes prior blocker/steps/error।

## Regression evidence

`src/lib/__tests__/push-lifetime-recovery.test.tsx`: **42 new permanent tests**, identical lifecycle scenarios parameterized over rider and vendor hooks。

Covered:

- Initially disabled no probe/mutation; disabled state masking/reset; re-enable fresh read。
- Saved callbacks, pending local/server reads, old enable success/error, old disable success/error, unmount and later-lifetime isolation。
- Older action cannot clear newer busy/error state; late automatic repair cannot change displayed off state after disable。
- Unexpected enable rejection safely releases busy; current enable/disable/denied behavior。
- Server configuration/table absence, unknown-server fallback, safe current disable failure。
- Supersession during enable's post-registration refresh。

Initial RED: **28 FAIL / 2 PASS**, original 30 scenarios。 Final expanded focused run, including existing cards/client/blocker tests: **5 files / 61 tests PASS**, 7.09 s。 Actual hook implementations used; client/browser operations mocked। Existing card tests mock hook outputs; these tests are not real browser permission prompts, service-worker registration or delivery tests。

## Verification

| Check | Result |
| --- | --- |
| Focused new + related regressions | **61/61 PASS**, 5 files |
| ESLint | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Full Vitest suite | **586 files / 4,215 tests PASS**, 567.66 s |
| Production dependency audit | **0 vulnerabilities** |
| `git diff --check` | PASS |

Logs: `/home/user/push-lifetime-{red,green,lint,types,build,full-suite,production-audit}.log`। Historical dirty work preserved; branch unchanged; no push/deploy。

## Remaining limits

- Boundary tracks observed `enabled` transitions/unmount, not silent account identity replacement while enabled remains true。
- No cancellation/serialization of already-started subscription or repair work; no guarantee that displayed off alone proves endpoint removal or delivery cessation。
- Unexpected initial local probe failure is now consumed safely but can leave phase loading until a new enabled lifetime; this batch adds no new probe-error/retry UI। Existing card treatment of errors in on/loading states is not redesigned。
- Successful registration followed by a failed status probe is not a rollback of registration; stale-result suppression does not certify device/server state。
- Never-settling operation timeout policy, real permission/service-worker/push delivery, physical Android/iOS acceptance, upload lifecycle and other mutation callers remain separate investigations/acceptance。
- S01 development dependency findings and previously documented production/staging acceptance remain open। Production-only clean audit does not close development debt。

## Recovery UI follow-up

[O28/O29 push recovery UI](push-recovery-ui-2026-10-22.md)-এ initial local-probe rejection এখন explicit error/Retry এবং on-state turn-off error visible। উপরের no-probe-retry-UI/error-presentation limitation O26/O27 batch-এর historical scope। Subscription/repair cancellation ও real device/server outcome acceptance এখনো সমাধান হয়েছে বলে দাবি নয়।
