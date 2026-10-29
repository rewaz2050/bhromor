# Browser verification — orders ও money recovery

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

[O01–O04 fixes](orders-recovery-2026-10-22.md) এবং [O05–O12 fixes](remaining-recovery-2026-10-22.md)-এর পর browser-level verification batch। **এই batch-এ application code বা business rules পরিবর্তন হয়নি**; permanent Playwright tests ও isolated config যোগ হয়েছে।

## Fresh results

| Check | ফল |
| --- | --- |
| নতুন browser regression | **12/12 PASS**, 18.6 s |
| Existing dashboard browser regression | **7/7 PASS**, 14.5 s |
| নতুন test/config-এর ESLint | PASS |
| Repository TypeScript check | PASS |
| `git diff --check` | PASS |

মোট **19টি browser test পাস**, দুটি পৃথক run-এ। আগের **573 files / 3,917 Vitest tests** ও production build-এর ফল আগের remediation batch-এর; এখানে fresh full-suite/build run দাবি করা হচ্ছে না।

## নতুন ১২টি browser contract

প্রতিটি flow **320, 390 ও 1280 px** viewport-এ Chromium দিয়ে চলে:

1. **Orders first read failure → Retry:** 503 response-এর পর endless skeleton নয়; error/Retry দৃশ্যমান। Retry success-এ actual rendered row দেখা যায় এবং alert সরে যায়।
2. **Pending search → newer search → late old response:** প্রথম query ইচ্ছাকৃত pending; input mounted/focused থাকে। দ্বিতীয় query-এর row আসে; পরে প্রথম query ফিরলেও নতুন row বদলায় না। Response ও browser paint-এর জন্য অপেক্ষা করা হয়, arbitrary sleep নয়।
3. **Money network failure → Retry:** Error-কে backend migration missing বলে না। Retry-এ P&L render হয় এবং error সরে যায়।
4. **30-day totals → failed 7-day read → retry:** নতুন period selected হলেও পুরোনো P&L totals দেখায় না; period tabs থাকে। Retry-এর পর current-range commission আসে এবং error সরে যায়।

প্রতিটি scenario-তে document-level horizontal overflow-ও পরীক্ষা করা হয়। Table-এর নিজস্ব horizontal scroll থাকা failure নয়। এটি সম্পূর্ণ visual/accessibility audit নয়।

## Existing সাতটি browser contract

আগের `e2e/dashboards.spec.ts` অপরিবর্তিত রেখে পুনরায় চালানো হয়েছে:

- Customer profile save/identity refresh।
- Rider profile save ও shared invitation acceptance।
- Vendor settings save এবং Confirm → Ready order queue।
- Admin requesting-order বনাম invitation count।
- Dispatch initial deliveries failure recovery।
- Dispatch initial riders failure recovery।
- Fixture interception ছাড়া নির্বাচিত unauthenticated API requests deny করা। এই test configuration-এ account/rider profile PATCH এবং vendor shop/admin deliveries GET প্রত্যেকটি 401 দিয়েছে; এটি full authorization/RLS audit নয়।

## নতুন files ও পুনরায় চালানো

- `e2e/admin-data-recovery.spec.ts`
- `playwright.recovery.config.ts`

স্বাভাবিক Playwright Chromium install থাকলে:

```sh
npx playwright test --config playwright.recovery.config.ts
```

Config server না থাকলে localhost:3101-এ isolated dev server চালায়, dummy public Supabase configuration ও empty service-role key দিয়ে। Real routes/components/hooks ব্যবহৃত; browser API responses intercepted। কোনো real staff credential দরকার নেই। পরিচিত verification server ব্যবহার করলে `E2E_BASE_URL` দিন। কোনো real deployment-এ না বুঝে fixture test চালাবেন না।

এই sandbox-এ browser binary registry.npmjs.org থেকে repository-এর বাইরে স্থাপন করা হয়েছে। Executed commands:

```sh
LD_LIBRARY_PATH=/tmp/al2023/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
E2E_BASE_URL=http://localhost:3101 \
npx playwright test --config playwright.recovery.config.ts

LD_LIBRARY_PATH=/tmp/al2023/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
E2E_BASE_URL=http://localhost:3101 \
npx playwright test --config playwright.dashboards.config.ts
```

Fresh logs: `/home/user/admin-browser-recovery.log`, `/home/user/admin-browser-existing-dashboards.log`, `/home/user/admin-browser-lint.log`, `/home/user/admin-browser-types.log`। Browser traces/report artifacts `.cache/`-এ ignored; verification server পরীক্ষা শেষে বন্ধ করা হয়েছে।

## Setup observations

- প্রথম smoke run-এ `127.0.0.1` base URL Next dev-origin allowlist-এর সঙ্গে মেলেনি। Config-এর `localhost` ব্যবহার করে পুনরায় run সফল হয়েছে; application security policy শিথিল করা হয়নি।
- Next-এর route announcer-ও `role=alert` দেয়। Test selector নির্দিষ্ট Money alert-এ scope করা হয়েছে; unrelated announcer বাদ দেওয়ার জন্য UI বদলানো হয়নি।
- Dev server/browser-এ React development `eval`/CSP diagnostic warning ছিল। Functional contracts পাস করেছে, কিন্তু console clean বা production CSP acceptance দাবি করা হচ্ছে না।

## যা এখনো বাস্তবে যাচাই প্রয়োজন

- **Real session lifecycle:** staging-এ staff/vendor/rider account A → logout → account B; throttled network-এ পুরোনো data বা action target যেন না দেখা যায়। Hook-level tests observed enabled/disabled transition যাচাই করে; প্রতিটি real navigation/remount path নয়।
- **Physical GPS/Realtime:** বাইরের location-এ warning এবং local location-এ unchanged pin; order/token বদলে correct rider channel। Real Android permissions ও delayed socket callbacks পরীক্ষা বাকি। Delivery/order submit না করেও location behavior দেখা যায়।
- **Real money data:** authorized staging account দিয়ে known 7-day/30-day ledger result মিলিয়ে দেখা; এই browser test-এর টাকার অঙ্ক fixtures, real revenue নয়।
- **S01 dependency debt:** আগের 8 development findings এখনো খোলা; এই verification batch dependency patch নয়।
- **Production:** deploy/push, real Supabase/payment/push বা full WCAG/performance acceptance করা হয়নি। Original live map incident-এর URL/screenshot/device reproduction এখনো প্রয়োজন।
