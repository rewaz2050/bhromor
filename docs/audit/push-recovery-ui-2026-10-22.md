# Push recovery UI — O28/O29

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

[O26/O27 push hook ownership](push-lifetime-recovery-2026-10-22.md)-এ documented initial-probe/error-presentation limitation-এর follow-up। Actual hooks ও cards, mocked client operations দিয়ে rendered regression; real permission prompts/notification delivery বা deployed incident-এর দাবি নয়।

## O28 — Initial local probe failure লুকিয়ে থাকত

Local helper reject করলে hook safe error রাখত, কিন্তু `loaded=false` থাকায় phase `loading` থাকত। দুই card-ই loading-এ null render করত। ফলে user error বা Retry কোনোটিই পেতেন না। এই reproduction controlled local-helper rejection; সাধারণ server-status/network failure সবসময় এই branch-এ যায়—এমন দাবি নয়। `currentSubscription()` নিজেই কিছু browser errors null হিসেবে সামলায়; ওই underlying policy বদলায়নি।

**Fix:** Rider/vendor hook-এ explicit local-probe error phase এবং scoped `retry()`। Card status-check failure-এ labelled section, `role=alert` ও 44px-minimum Retry control দেখায়:

- Rider: “নোটিফিকেশনের অবস্থা জানা যায়নি। আবার চেষ্টা করুন।” / “আবার চেষ্টা করুন”।
- Vendor: “Could not check notification status. Try again.” / “Try again”।

Retry পুরোনো error clear করে fresh local/server probe করে; pending probe-তে premature enable button দেখায় না। Failed retry-তেও error/Retry ফিরে আসে। No page reload or re-enable boundary required। Success-এর পরে normal off/on card ফেরে।

Retry explicit permission-request/enable বা disable flow ডাকে না। Permission আগে থেকেই granted থাকলে existing automatic repair policy অনুযায়ী registration repair চলতে পারে—এটি সব network effects থেকে মুক্ত pure read-এর দাবি নয়। Saved stale retry, late rejection ও disabled lifetime আগের ownership guards মানে।

## O29 — Turn-off failure on-state card-এ দেখা যেত না

Disable helper failure hook-এর safe error রাখত এবং subscribed display on থাকত, কিন্তু on-state JSX error render করত না। User turn-off ব্যর্থ হয়েছে বুঝতে পারতেন না।

**Fix:** On-state card এখন safe error alert দেখায় এবং existing turn-off control রাখে। User একই action আবার করতে পারেন; probe Retry-কে mutation retry বলে চালানো হয় না। Current successful disable স্বাভাবিক off display-তে যায়। Turn-off control minimum height 44px; wrapping/full-width error mobile layout-এ existing calm style ব্যবহার করে। No animation/gradient/decorative redesign।

## Scope / preserved behavior

Application edits:

- `src/lib/use-rider-push.ts`, `src/lib/use-vendor-push.ts`: probe-error classification, successful-read error reset, scoped probe retry।
- `src/components/rider/rider-push-card.tsx`, `src/components/vendor/vendor-push-card.tsx`: explicit probe recovery branch ও on-state error presentation।

Only production consumers of these hook phases are the two cards; both handle the new phase। Blocker/denied/unconfigured behavior, English/Bengali existing action messages, unknown-server fallback, action ownership এবং current clients/API payloads unchanged। Permissions, endpoints, subscription cleanup protocol, service worker, auth/RLS, dispatch/order/payment rules, dependency manifests untouched।

## Evidence / tests

`src/components/__tests__/push-recovery-ui.test.tsx`: **22 new permanent tests**, both roles parameterized। Actual hook+card combination exercised; no hook-output mock used in these new rendered cases। Existing prior card tests remain separately mocked component contracts।

Coverage:

- Initial safe error → probe Retry → normal off; no enable/permission helper call।
- Repeated failure remains retryable; pending retry clears stale alert without presenting an enable control early।
- Current disable failure is visible on-state; correct off action retries successfully without status re-probe replacing it。
- Disable hides stale error; old pending retry/new-lifetime rejection cannot overwrite current state。
- Initially disabled and saved previous-lifetime retry callbacks do not probe。
- Older retry rejection cannot replace newer retry success。
- Granted local subscription preserves existing silent repair without calling the permission-request enable helper。

Initial pre-fix rendered run: **10 FAIL**, 10 original scenarios。 Additional hook ownership/pending/repair scenarios brought permanent coverage to 22। Final focused run including previous push lifecycle/card tests: **4 files / 73 tests PASS**, 7.84 s。

## Verification

| Check | Result |
| --- | --- |
| Focused new + previous push coverage | **73/73 PASS**, 4 files |
| ESLint | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Full Vitest suite | **587 files / 4,237 tests PASS**, 615.29 s |
| Production dependency audit | **0 vulnerabilities** |
| `git diff --check` | PASS |

Logs: `/home/user/push-ui-{red,green,lint,types,build,full-suite,production-audit}.log`। No existing assertions removed; historical branch work preserved। No push/deploy。

## Limits

- New evidence is controlled React/jsdom, not a fresh browser/device permission, service-worker, notification delivery or native acceptance run। Real Android/iOS/TalkBack/VoiceOver and full responsive/WCAG acceptance not claimed by class names alone。
- Displayed phase and visible error are not proof of device/server subscription state। Already-started repair/registration/unsubscribe effects are not cancelled, serialized or rolled back; a local unsubscribe followed by failed server deletion may leave different local/server outcomes。 This batch changes presentation/re-probing, not that protocol。
- Initial probe Retry is scoped; never-settling requests still have no new timeout/abort policy。 Silent identity replacement while enabled stays true remains outside the lifetime API。
- Unknown-server fetch failure retains the existing fallback; this is not exhaustive error handling for all push failure stages or every platform-specific browser API。
- S01 development dependency findings, other mutation/upload investigations and production/staging/device acceptance remain open as documented in the consolidation report。
