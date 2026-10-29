# O32 — Rider release-form lifetime recovery; S02 — Next.js security patch

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

Failed-proof handoff-এর পর bounded follow-up: rider-এর “কাজ ফেরত দিন” form-এর deferred result ownership পরীক্ষা। Production logic বদলানোর আগে actual component + controlled deferred helper দিয়ে evidence নেওয়া হয়েছে। Existing dirty work preserved; no commit/push/deploy।

## O32 — Confirmed form-lifetime defects

Pre-fix new test run: **13 scenarios: 10 FAIL / 3 PASS, plus 1 unhandled helper-rejection error**। `ReleaseJobForm` await-এর পরে indiscriminately busy/error/open/reason এবং parent callback update করত। Assignment ID change-ও local form state reset করত না।

Controlled fixtures reproduced:

- Pending release → Cancel বা toggle-close → reopen → old success নতুন draft বন্ধ/মুছে parent callback চালাত; old refusal নতুন view-তে error বসাত।
- Assignment replacement পুরোনো draft/error/open/pending state রেখে দিত; previous assignment-এর success নতুন context-এ parent callback চালাতে পারত। A → B → A old completion-ও একই unscoped component-এ প্রকাশ পেত।
- Pending successful completion after unmount parent callback চালাত।
- Unexpected helper rejection unhandled হতো এবং pending state release করত না। Normal helper already returns a safe result union; exception fixtureটি defensive boundary test, ordinary production helper failure always throws—এমন দাবি নয়।

### Implementation

`src/components/rider/dashboard/release-job-form.tsx`:

1. Public props/API unchanged; assignment-keyed private stateful form। Different ID নতুন closed, empty, non-busy state পায়; returning to A does not revive its unmounted instance।
2. Active-instance/open-generation guards result publication। Cancel/toggle-close invalidates the old view; assignment replacement/unmount deactivates its owner। Old completion cannot publish error/reset/close/`onReleased` into a newer lifetime।
3. **Transport lock remains independent of view lifetime.** Same still-mounted assignment-এর pending release lock Cancel/reopen জুড়ে বজায় থাকে। Only its owning request settles that lock; A completion cannot unlock B। Closing does not cancel the already-sent server mutation।
4. Unexpected helper rejection safely releases its own lock and, only in its current view, shows “ফেরত দেওয়া যায়নি — আবার চেষ্টা করুন।” Retry is explicit; no automatic resend।
5. Same-assignment unsubmitted draft survives close/reopen, as before। Current successful result retains reason payload, close/reset and callback; current refusal remains inline and retryable।

Endpoint/helper/auth/permission implementation, release/redispatch eligibility, minimum reason validation, maximum input length, order/assignment transitions and financial rules **unchanged**। UI styling and ordinary labels preserved। No server cancellation/idempotency protocol added।

### Permanent tests

`src/components/rider/dashboard/__tests__/release-form-lifecycle.test.tsx`: **13 new tests** covering close/reopen success/refusal + pending-lock retention; assignment replacement success/refusal; unmount success/refusal; toggle-close; draft/error reset between IDs; A → B → A; A completion vs pending B; defensive rejection/retry; same-assignment draft preservation; current success/payload/callback।

Focused component/dashboard/proof run before dependency patch: **3 files / 75 tests PASS, 3.96 s**。 Existing 39 dashboard assertions/tests and 23 proof-lifecycle tests retained। These are actual component tests with mocked delivery helper and controlled promises, not authenticated server/device workflows। Final patched-framework full regression recorded below。

## S02 — Newly reported production dependency advisories

First static run passed lint, typecheck and build, but `npm audit --omit=dev` then reported **1 critical package entry (`next@16.4.0`) containing two advisories**:

- [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) — critical, Image Optimization/SVG remote code execution advisory。
- [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) — high, App Router/Server Actions denial of service advisory。

Registry audit and `gh api /advisories/...` metadata independently agreed: affected Next 16 range through **16.4.0**, first patched version **16.4.1**。 Selected available patch **16.4.2** retains Node `>=20.9.0` and compatible React peers。 `package.json` exact Next pin and lockfile updated using `npm install --save-exact next@16.4.2 --ignore-scripts`; four installed framework-related packages changed。 React/ReactDOM remain **19.2.8**。 No forced audit fix, major migration, tooling downgrade or new application runtime dependency。

This is package advisory remediation, not a demonstrated production exploit。 Existing configuration already sets `dangerouslyAllowSVG: false`; no exploit payload/production security probe was performed। Earlier reports’ zero-production-audit counts remain historical snapshots, not current claims about the old version。

Patched-framework production audit: **0 vulnerabilities**。 Full audit still reports **8 development package entries: 5 high / 3 moderate** in the existing Next ESLint/braces and Capacitor/xcode/uuid chains。 **S01 remains open**; the production patch does not close those tooling risks。

## Final verification

- Patched Next **16.4.2** lint, typecheck, production build, production audit and `git diff --check`: **PASS**。
- Full patched-framework regression: **589 files / 4,273 tests PASS, 585.47 s**, exit 0। Includes all 13 new release tests। Log contains non-fatal `act(...)` warnings in unrelated existing component tests; this is not a warning-free run claim।
- Fresh Chromium browser contracts on Next **16.4.2**: **24 PASS** — 17 admin read/inbox/map recovery scenarios (1.2 min) + 7 dashboard/API-denial scenarios (21.8 s)। Fixture-backed rendering/interaction checks, except the existing real unauthenticated API-denial requests; not real authenticated release/redispatch acceptance। Temporary test server stopped after verification।

The preliminary full suite on the old framework was deliberately stopped after the audit finding; it is **not** a completed passing run。

Browser harness notes: first attempt could not launch Chromium because sandbox NSS/NSPR libraries were absent; extracted matching libraries shipped by the temporary npm Chromium runtime outside the repository। A subsequent run against `127.0.0.1` was stopped after repeated hydration failures: Next dev logs explicitly rejected that HMR origin。 Using the repository's normal `localhost` test origin restored hydration, without weakening application headers, origin configuration or assertions。 Only the completed verified-origin runs count below。 No browser/runtime binary is added to Git。

## Remaining limits / release gates

- Cancel is **not** cancellation/rollback of `releaseAcceptedJob`。 Already-sent requests can commit; stale view suppression does not undo them。
- Lock ownership is per mounted assignment form, not global serialization across different mounts, tabs or devices。 New instance lifetime does not cancel the old instance’s physical request。
- Never-settling requests retain their lock; no timeout or forced overlap policy introduced。
- Suppressed stale success does not immediately call the old parent callback। Existing rider reads/realtime/poll reconciliation remains responsible for observing server state; no new automatic refresh mechanism or latency guarantee। Source polling remains 15 s ordinarily / 120 s realtime backup, not a demonstrated deployed timing SLA。
- Real rider release/redispatch, cross-account permissions/RLS, deployed concurrency, native devices and full financial operational acceptance still require configured staging accounts/services。 Browser fixtures, mock helper tests and a successful build do not certify them。
- S01 development dependency findings remain open। No commit, push, merge or deploy performed。

## Evidence files (workspace logs, not Git deliverables)

- `/home/user/release-form-red.log`, `/home/user/release-form-green.log`
- `/home/user/release-form-full-suite-final.log`
- `/home/user/release-form-{lint,types,build,production-audit}-final.log`
- `/home/user/release-next-{patch-metadata,advisory,dos-advisory}.json`, `/home/user/release-next-install.log`
- `/home/user/release-full-audit-final.json`
- `/home/user/release-browser-{recovery,dashboards}-verified.log`

Earlier batches remain documented in [consolidation](final-build-consolidation-2026-10-22.md) and [failed-proof follow-up](failed-proof-lifecycle-2026-10-22.md)।
