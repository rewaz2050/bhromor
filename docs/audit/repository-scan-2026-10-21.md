# পুরো রিপোজিটরির code/regression scan — ২১ অক্টোবর ২০২৬

> **পরবর্তী implementation update:** [Map/media, financial recovery ও real PostgreSQL verification](resilience-update-2026-10-21.md) — full unit suite 567 files / 3,846 passed; 53 + 5 browser checks; local real SQL workflow 10 PASS groups। এই নথির পুরোনো test counts historical।

Branch: `arena/bcb37d54-bhromor`। এটি বর্তমান checkout-এর automated scan ও ঝুঁকিভিত্তিক code review; প্রতিটি ফাইলের প্রতিটি লাইন manually যাচাই বা production certification নয়। আগের UI/admin পরিবর্তন রাখা হয়েছে; কোনো deploy/push করা হয়নি।

> **পরবর্তী security recheck:** Vitest 4 migration সম্পন্ন; এখন full suite **563 files / 3,829 passed**, audit **8 dev findings / 0 critical**, production audit **0**। নিচের 3,828/11 findings প্রথম pass-এর historical ফল। বিস্তারিত: [দ্বিতীয় যাচাই](security-recheck-2026-10-21.md)।

## কী পরীক্ষা করা হয়েছে

- সম্পূর্ণ Vitest suite: components, hooks, account/rider/vendor/admin, API routes, permissions/validation এবং database helper tests।
- পুরো repository lint, TypeScript, production build এবং dependency audit।
- Shared session/cache/retry, background polling ও rider scoreboard-এ targeted manual review ও red/green regression tests।
- Storefront, checkout, search, wishlist, sharing, gallery, support, account access এবং admin recovery-এর ১২টি browser spec।
- আলাদা dashboard contract suite: customer profile, rider profile/job acceptance, vendor settings/order transitions, admin invitation counts এবং fixture ছাড়া unauthenticated API denial।
- Embedded PostgreSQL/PGlite dispatch ও rider-money migration/integration scripts।
- API/admin guard references, HTML injection entry points, map loading এবং related async helpers-এর source spot-check। কোনো string-search result-কে একাই vulnerability বা authorization proof ধরা হয়নি।

## নিশ্চিত সমস্যা ও পরিবর্তন

| বিষয় | আগে কী হতো / প্রমাণ | সমাধান |
| --- | --- | --- |
| Shared staff retry | Header/inbox দুই hook mount করে একটির retry দিলে অন্যটি failed অবস্থায় থাকত। নতুন regression আগে fail করেছে। | Shared retry generation-এর subscription দিয়ে সব mounted consumer একই নতুন probe নেয়। একই probe cycle-এ duplicate request নয়। |
| Signed-out session cache | Sign-out → sign-in-এ আগের সফল cached probe পুনরায় ব্যবহার হতে পারত। নতুন regression আগে fail করেছে। | Signed-out state দেখলে cached probe বাদ। Backend role/auth checks অপরিবর্তিত। |
| Overlapping background polling | Pending promise-এর মধ্যে interval/focus/visibility একসঙ্গে আরও refresh চালাত। নতুন pending-request test আগে fail করেছে। | একই hook-এর poll pending থাকলে আরেকটি poll শুরু হয় না। সফল/ব্যর্থ completion-এ lock ছাড়া হয়; unexpected errors লগ হয় এবং ভবিষ্যৎ poll চলতে পারে। Caller-এর আলাদা manual/initial refresh বা realtime request-এর global deduplication দাবি করা হচ্ছে না। |
| Malformed rider stats crashes job board | Browser test-এ HTTP 200 কিন্তু `stats` অনুপস্থিত response-এ `RatingTile` undefined access করে পুরো rider board error boundary-তে চলে যায়। নতুন stats tests-এও missing/partial/string fields ও cached-value loss ধরা পড়ে। | চারটি required scoreboard field finite number কি না পরীক্ষা। Invalid response হলে শেষ verified stats থাকে, অথবা null থাকে; jobs/invitations নষ্ট হয় না। Optional fields এবং valid response-এর আচরণ অপরিবর্তিত। |
| Vite security patch | Audit-এ Vite 7.3.6-এর high-severity development-tooling finding ছিল। | Lockfile-এ শুধু Vite **7.3.6 → 7.3.7** patch update। Root manifest/production dependencies অপরিবর্তিত; কোনো force upgrade/downgrade নয়। |

## Test fixes — failures লুকানো হয়নি

- Poll overlap guard-এর পরে দুই পুরোনো fake-timer test একই synchronous call-এ একাধিক interval advance করছিল; ফলে promises-এর microtask শেষ হওয়ার সুযোগ ছিল না। এগুলো async timer advancement ব্যবহার করে। **আগের একই cadence/count assertions রাখা হয়েছে**; pending request deduplication আলাদা regression-এ যাচাই হয়েছে।
- Customer dashboard test-এর Bengali success phrase-এ পুরোনো Unicode spelling ছিল। Assertion বর্তমান UI-র exact success wording-এর সঙ্গে মিলেছে; profile identity update ও readonly login-phone assertions রাখা হয়েছে।
- Rider dashboard test এখন ইচ্ছাকৃতভাবে malformed optional stats response দেয়; তবুও profile save, shop call link, invitation acceptance ও pickup action render হতে হবে। Production fix ছাড়া এই flow error boundary-তে যেত।
- কাজ চলার সময় শুরু হওয়া/মধ্যবর্তী failed runs completion evidence হিসেবে ধরা হয়নি। সমস্ত runtime পরিবর্তন ও Vite patch-এর পরে source স্থির রেখে **সম্পূর্ণ suite আবার চালিয়ে** নিচের final result পাওয়া গেছে।

## চূড়ান্ত ফল

| Check | ফল | সীমা |
| --- | --- | --- |
| Entire Vitest suite | **563 files / 3,828 tests passed** | বর্তমান সব discovered unit/integration tests; test coverage মানেই সব possible bug নেই নয় |
| Combined storefront/admin browser set | **49/49 passed** | 42 storefront checks, 2 gallery harness checks, 2 map harness checks, 3 inbox/shell harness checks |
| Separate dashboard browser suite | **5/5 passed** | 4 data-flow tests API fixtures দিয়ে; শেষ test fixture ছাড়া unauthenticated API denial; real signed-in Supabase workflow নয় |
| Embedded dispatch SQL checks | **15 PASS groups**, exit 0 | Disposable in-memory database, deployed concurrency/RLS proof নয় |
| Embedded rider-money SQL checks | **35 PASS groups**, exit 0 | Real migration scripts on minimal test schema; live payment/settlement নয় |
| Lint / TypeScript / production build | **Passed** | Local build; production performance claim নয় |
| Patch whitespace | `git diff --check` passed | — |
| Production dependency audit | **0 vulnerabilities** | `npm audit --omit=dev` |
| Full dependency audit | **12 → 11 findings** | বাকি সব development-tooling chains: 4 moderate, 5 high, 2 critical |

Browser numbers আলাদা run-এর scope স্পষ্ট রেখে দেওয়া হয়েছে। Default legacy `storefront.spec.ts`-এর real server-readable catalog-dependent scenarios এই verified set-এর অংশ নয়; আগের নথিভুক্ত missing-catalog সীমা বহাল।

## এখনও গুরুত্বপূর্ণ বাকি কাজ

1. **Development-tooling security — বর্তমান অবস্থা:** পরের controlled Vitest 4 migration ও complete regression-এ critical findings সরেছে। এখন Next ESLint glob ও Capacitor uuid/xcode chains-এ **8 findings (5 high, 3 moderate)** বাকি; production audit 0। বিস্তারিত [দ্বিতীয় যাচাই](security-recheck-2026-10-21.md)-এ। Dev-only-কে harmless বলা হচ্ছে না; force downgrade বা unvalidated cross-major override করা হয়নি।
2. **Full real PostgreSQL workflow script:** `test:workflow:postgres` এখানে চালানো হয়নি; dedicated disposable local PostgreSQL service প্রয়োজন। Embedded tests real two-session locking/deployed Supabase policies-এর বিকল্প নয়।
3. **Configured-catalog/server-rendered pages:** populated shop/PDP, real media/image optimizer এবং legacy responsive scenarios authorized configured preview-তে চালাতে হবে। Browser fixtures server-side catalog পূরণ করে না।
4. **Authenticated production acceptance:** deployed roles/RLS, real staff/customer sessions, order lifecycle, payment callbacks, notifications ও rider GPS। Test server-এ public Supabase values ছিল `verification.invalid` test placeholders; fixtures real database writes/payments করেনি। শেষে QA server বন্ধ করে সাধারণ preview ফিরিয়ে দেওয়া হয়েছে।
5. **Remaining UI resilience candidates:** checkout/tracker map-এর external CSS dependency, অন্য admin media preview fallback, প্রতিটি summary endpoint-এর freshness এবং অবশিষ্ট forms/tables/controls আলাদা rendered QA চায়। Source-এ risk পাওয়া মানেই বর্তমানে live page broken, এমন ঘোষণা নয়।
6. **Physical device/accessibility/performance:** Android/iOS, TalkBack/VoiceOver, slow/unstable mobile network এবং measured production performance বাকি। Scoped Axe বা Chromium emulation পূর্ণ WCAG certification নয়।
7. ব্যবহারকারীর নির্দিষ্ট broken-map screenshot/URL-এর সঙ্গে original report এখনও মিলিয়ে দেখা বাকি।

## Reproduce

```bash
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
npm run test:dispatch
npm run test:money
```

Dashboard browser run-এর test server configuration: `playwright.dashboards.config.ts`। Existing server reuse করলে সেটি অবশ্যই একই isolated test environment-এ চালু থাকতে হবে। Browser reports/traces/screenshots `.cache/playwright-*`-এ ignored artifacts; raw command logs workspace-এ রাখা হয়েছে, Git-এ নয়।
