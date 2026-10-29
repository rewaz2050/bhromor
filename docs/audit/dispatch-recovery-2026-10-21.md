# Continued update — admin dispatch ও rider roster recovery

২১ অক্টোবর ২০২৬ · `arena/bcb37d54-bhromor`। আগের uncommitted কাজ রাখা হয়েছে। কোনো deploy/push নয়; backend auth/permissions, dispatch eligibility, order transitions বা settlement rules বদলানো হয়নি।

## এই pass-এর scope ও নিশ্চিত সমস্যা

`useRiders`, `useAdminDeliveries` এবং `/admin/deliveries`-এর read/session recovery পরীক্ষা করা হয়েছে। নতুন প্রথম 12টি test-এর মধ্যে **10টি আগে fail**, 2টি pass করেছিল।

- Initial API failure-এ null snapshot loading-এর শর্ত হিসেবেই থেকে যেত; error/recovery UI skeleton-এর আড়ালে আটকে থাকত।
- পুরোনো request success অথবা error নতুন সফল snapshot overwrite করতে পারত।
- Pending response sign-out-এর পরে data restore করতে পারত; saved refresh callback signed-out অবস্থায়ও API GET চালাত। Deliveries-এর prior-session lists reset হতো না।
- শুধু error-null দিয়ে loading হিসাব করলে Dismiss-এর পরে আবার indefinite skeleton আসত। আলাদা settled state দিয়ে request completion/error-message state পৃথক করা হয়েছে।

## সমাধান

1. দুটো hook-এ session/unmount generation এবং latest-request guard। Current session active না হলে read request নয়; obsolete success/error ignored। এটি network abort বা সব caller-এর global request deduplication নয়।
2. Sign-out-এ rider/settlement/dispatch-settings state এবং delivery/awaiting/failed/busy state reset। Failed refresh-এ last verified rows থাকে।
3. Latest read completion-এ settled flag; initial failure এবং error dismissal কোনোটিতেই loading আটকে থাকে না।
4. Dispatch error banner-এ 44px Retry action। Rider roster থেকে error এলে manual Retry সেই dependency-ও retry করে; এই wiring-এর regression আগে fail করেছে।
5. Board ও hook-এর দুই independent rider-roster instance বাদ দিয়ে একই hook-owned snapshot ব্যবহার করা হয়েছে। Roster polling **30 seconds**, delivery polling **15 seconds**—আগের visible-tab cadences বহাল; hidden-tab behavior অপরিবর্তিত। Coverage diagnosis, map এবং recovery একই roster/settings state দেখে।

Mutation requests/API role checks অপরিবর্তিত। এই change সব async mutation-completion race বা অন্য vendor/customer hooks-এর audit নয়।

## Verification

| Check | ফল |
| --- | --- |
| New hook regressions | **15/15 passed**: roster 7, deliveries 8 |
| Targeted hook + board contracts | **24/24 passed across 4 files**, existing reason-dialog/coverage assertions-সহ |
| Final full suite | **569 files / 3,861 tests passed**, exit 0, 488.31 seconds |
| Fresh dashboard browser suite | **7/7 passed** |
| Lint / typecheck / production build | **Passed**; no lint warnings |
| Production dependency audit | **0 vulnerabilities** |
| Whitespace | `git diff --check` passed |

Browser suite নতুন করে দুইটি real-page fixture case চালায়: initial `/api/admin/deliveries` 503 এবং initial `/api/admin/riders` 503। দুটোতেই error দৃশ্যমান, loading skeleton শেষ, explicit Retry successful response নেয় এবং board ব্যবহারযোগ্য থাকে। বাকি পাঁচটি customer/rider/vendor/admin contract ও fixture ছাড়া unauthenticated API denial। এগুলো real signed-in Supabase workflows নয়; isolated server-এ `verification.invalid` placeholders ছিল।

Board এখন hook থেকে roster/settings নেয় বলে দুইটি পুরোনো unit mock-এ একই fixture fields ওই hook contract-এ সরানো হয়েছে। Coverage/reason/dialog assertions বাদ দেওয়া হয়নি। নতুন browser selector Next-এর route-announcer alert-ও ধরছিল; display-error text দিয়ে scoped করা হয়েছে, recovery assertions অক্ষুণ্ণ। Source/test পরিবর্তনের মধ্যে চলা intermediate full runs final evidence হিসেবে ব্যবহার হয়নি; সংশোধিত অবস্থায় source স্থির রেখে পুরো suite পুনরায় চালিয়ে final pass পাওয়া গেছে।

## সীমা ও বাকি acceptance

- এইবার আগের 53-check combined storefront/map browser set বা PostgreSQL scripts পুনরায় চালানো হয়নি; তাদের আগের results [পূর্ববর্তী update](resilience-update-2026-10-21.md)-এ historical evidence। এই pass-এর fresh browser count শুধু **7**।
- Production dependencies/package versions বদলানো হয়নি। Existing dev-tooling audit findings এই pass-এ remediate করা হয়নি।
- Deployed roles/RLS, real login/payment/push/GPS, authorized populated SSR catalog, physical-device/slow-network acceptance এবং original map incident-এর screenshot/URL match এখনও প্রয়োজন।
- QA server বন্ধ করে সাধারণ preview ফিরিয়ে দেওয়া হয়েছে। কোনো deployment readiness certification নয়।

## Reproduce

```bash
npm ci --ignore-scripts
npm test -- src/lib/__tests__/use-riders.test.tsx src/lib/__tests__/use-admin-deliveries.test.tsx src/app/admin/__tests__/admin-deliveries-reason.test.tsx src/app/admin/__tests__/admin-deliveries-coverage.test.tsx
npm test
npm run lint
npm run typecheck
npm run build
npm run test:dashboards
npm audit --omit=dev
```

Browser run-এর জন্য Chromium ও isolated test-server config প্রয়োজন; `playwright.dashboards.config.ts` দেখুন। Workspace-only logs: `/home/user/dispatch-recovery-{red,green,targeted-final,final-suite,browser,lint,types,build,prod-audit}.log` এবং `/home/user/dispatch-roster-retry-red.log`। Generated browser artifacts ignored `.cache/`-এ; Git-এ নয়।
