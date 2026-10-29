# দ্বিতীয় যাচাই — dependency security ও regression

> **পরবর্তী implementation update:** [Map/media, financial recovery ও real PostgreSQL verification](resilience-update-2026-10-21.md) — full unit suite 567 files / 3,846 passed; 53 + 5 browser checks; local real SQL workflow 10 PASS groups। এই নথির পুরোনো test counts historical।

তারিখ: ২১ অক্টোবর ২০২৬। Branch: `arena/bcb37d54-bhromor`। আগের uncommitted কাজ রাখা হয়েছে; কোনো deploy/push নয়। এটি [আগের repository scan](repository-scan-2026-10-21.md)-এর পরের যাচাই; নিচের audit ও full-suite সংখ্যা বর্তমান ফল।

## নিশ্চিত পরিবর্তন

- Development test runner **Vitest 3.2.7 → 4.1.12**। Vite **7.3.7** সরাসরি compatible range-এ রাখা হয়েছে; React plugin 4.7 অযথা Vite 8/plugin 6-এ নেওয়া হয়নি।
- Audit findings **11 → 8**; critical **2 → 0**, high **5**, moderate **3**। Production-only audit: **0**। এটি npm-এর reported dependency findings, সব ধরনের security issue নেই এমন নিশ্চয়তা নয়।
- Lockfile comparison-এ আগে থাকা **88 production package-এর location/version অপরিবর্তিত**; existing package version changes 13টি, সব dev-only। এই pass-এ application runtime, auth/permissions, pricing, order/payment/inventory rules বদলানো হয়নি।
- npm 10-এর upgrade resolver error-এর পরে isolated scratch directory-তে ephemeral npm 11 দিয়ে lock resolve করা হয়েছে; global npm upgrade করা হয়নি। এরপর repository-তে Node 22.22.3/npm 10.9.8 দিয়ে `npm ci --ignore-scripts` সফল হয়েছে। Installed dependency tree-তেও error নেই।

## Vitest 4 migration — ব্যর্থতা সংশোধন করে পুনরায় পরীক্ষা

প্রথম full run-এ 3,825 pass / 3 fail হয়েছিল; সেটিকে completion evidence বলা হয়নি। পরিবর্তনগুলো:

1. Analytics-এর `IntersectionObserver` mock-এ arrow-এর বদলে constructable function; আগের observation/assertions অক্ষুণ্ণ।
2. Rider adjustment ও admin settlement test-এর `beforeEach`-এ explicit block/void return। Mock function ফেরত গেলে Vitest 4 সেটিকে teardown হিসেবে চালাচ্ছিল। সংশ্লিষ্ট rejection ও API-call assertions বাদ দেওয়া হয়নি। অন্যান্য test lifecycle-এর expression bodies-ও খোঁজা হয়েছে।
3. Photo decode test আর jsdom-এর Image নিজে থেকে event পাঠাবে ধরে অপেক্ষা করে না। Constructable mock asynchronous `onerror` পাঠায়; test null result-এর পাশাপাশি object URL cleanup-ও যাচাই করে। Object-URL API অনুপস্থিতির জন্য আলাদা regression আছে। Application image code বা timeout বদলানো হয়নি।

চারটি migration-related file-এ **25 tests passed**। এরপর source স্থির রেখে সম্পূর্ণ suite পুনরায় চালানো হয়েছে; কোনো test skip, timeout বৃদ্ধি বা assertion বাদ দেওয়া হয়নি।

## এই pass-এর যাচাইকৃত ফল

| Check | ফল | Scope |
| --- | --- | --- |
| Full Vitest 4 suite | **563 files / 3,829 tests passed**, exit 0 | নতুন photo guard test-সহ পুরো discovered suite; 476.50 seconds |
| Dashboard browser suite | **5/5 passed** | Customer/rider/vendor/admin fixture contracts এবং fixture ছাড়া unauthenticated API denial |
| Selected component browser suite | **7/7 passed** | Inbox 320/390/1280px; real-Leaflet map 320/1280px; gallery keyboard/focus/zoom 320px English/Bengali |
| Embedded dispatch SQL | **15 PASS groups** | Disposable embedded PostgreSQL/PGlite |
| Embedded rider-money SQL | **35 PASS groups** | Migration/integration checks on test schema |
| Lint / typecheck / production build | **Passed** | Migration test edits-এর পরেও পুনরায় চালানো হয়েছে |
| Clean dependency install / dependency tree | **Passed** | `npm ci --ignore-scripts`; `npm ls --depth=0` |
| Whitespace | **Passed** | `git diff --check` |
| Production dependency audit | **0 findings** | `npm audit --omit=dev` |
| Full dependency audit | **8 findings** | 0 critical / 5 high / 3 moderate; সব dev-tooling chains |

এইবার browser checks **5 + 7**; আগের 49-check run-এর সঙ্গে যোগ করে নতুন combined run দাবি করা হচ্ছে না। Isolated test server-এ `verification.invalid` placeholders ছিল; real signed-in database writes/payments নয়। Browser checks শেষে test server বন্ধ করে সাধারণ preview ফিরিয়ে দেওয়া হয়েছে।

## যেগুলো এখনও সমাধান হয়নি

- **5 high findings:** `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`। Nested glob pattern stack-exhaustion advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm । এগুলো একই chain-এর affected package entries, পাঁচটি আলাদা confirmed production exploit নয়।
- **3 moderate findings:** `@capacitor/cli → xcode → uuid`। Buffer bounds advisory: https://github.com/advisories/GHSA-w5hq-g745-h8pq । Native CLI/Xcode workflow এই environment-এ acceptance-tested নয়।
- npm-এর suggested remediation Next ESLint **14.2.35** এবং Capacitor CLI **8.4.3**-এ downgrade করতে বলে। Current upstream metadata-তে newer Next ESLint/Capacitor-ও সংশ্লিষ্ট chains রাখছে। না যাচাই করে force-fix, arbitrary cross-major uuid override বা Next-16-mismatched ESLint downgrade করা হয়নি। Dev-only মানে harmless নয়; untrusted tooling inputs ও publicly exposed test/mocking services এড়িয়ে চলা উচিত।
- Live Supabase roles/RLS, real authenticated order/payment/GPS/notification flows, deployed concurrency, configured server-rendered catalog, physical device এবং পূর্ণ accessibility/performance acceptance এখনও প্রয়োজন। Original broken-map screenshot/URL-এর সঙ্গে incident reproduction-ও বাকি। Automated passing tests সব workflow সঠিক থাকার প্রমাণ নয়।

## Evidence / reproduce

```bash
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
npm run build
npm ls --depth=0
npm audit --omit=dev
npm audit
npm run test:dispatch
npm run test:money
npm run test:dashboards
npx playwright test e2e/{admin-inbox-recovery,admin-map-resilience,gallery-accessibility}.spec.ts
```

Browser commands-এর জন্য installed Chromium ও isolated test-server configuration প্রয়োজন; dashboard config ও existing browser-QA setup অনুসরণ করুন। Full audit বর্তমান findings-এর কারণে nonzero exit দেয়।

Workspace logs (Git artifacts নয়): `/home/user/recheck-v4-final-tests.log`, `recheck-v4-migration-tests.log`, `recheck-dashboard-browser.log`, `recheck-components-browser.log`, `recheck-final-{lint,types,build}.log`, `recheck-{dispatch,money}.log`, `recheck-audit-{before,after}.json`।
