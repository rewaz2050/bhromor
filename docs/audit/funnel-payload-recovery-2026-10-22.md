# Funnel API payload validation — O17/O18

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

[Admin funnel recovery](admin-funnel-recovery-2026-10-22.md) ও [vendor funnel recovery](vendor-funnel-recovery-2026-10-22.md)-এর পর successful HTTP response-এর body validation পরীক্ষা। Local controlled responses দিয়ে নিচের সমস্যা নিশ্চিত হয়েছে; production incident বা real analytics values corrupt হয়েছে—এমন দাবি নয়।

## Confirmed behavior

### O17 — Admin funnel invalid body-কে empty report বলে বা crash করে

HTTP 200-এ `null`, `{}` বা error-shaped object এলে আগের client fallback `EMPTY_FUNNEL` বানিয়ে “No sessions recorded” দেখাত। `{sessions:25}`-এর মতো partial body বা null nested arrays/rows এলে renderer-এর numeric/array methods ব্যর্থ হতে পারত। যেমন `pagesPerSession.toFixed()`-এ প্রয়োজনীয় value অনুপস্থিত।

**Fix:** Invalid successful response আর empty data হিসেবে গণনা করা হয় না। Error ও existing Retry দেখায়। সম্পূর্ণ valid zero-session report এখনও আগের empty-window message দেখায়।

### O18 — Vendor funnel unverified data/period analytics হিসেবে গ্রহণ করে

HTTP 200 body typed assertion দিয়েই গ্রহণ করা হতো। Missing metrics, string revenue, invalid nested product/source row এবং অন্য period-এর report-ও `funnel` হয়ে ফিরত। একইভাবে admin report-এর `days` selected window-এর সঙ্গে মিলিয়ে দেখা হতো না।

**Fix:** Admin ও vendor দুই funnel-এ required report shape, finite numeric fields, nested collection/row types এবং selected 7/28-day echo যাচাই হয়। Wrong-window body error হিসেবে ফেরে, নতুন period-এর report বলে নয়। Vendor invalid-body response-এ actual HTTP status 200 রাখা হয়, কিন্তু `funnel=null`, `missing=false` এবং validation error থাকে। এটি network/migration failure বলে invent করা হয় না।

## Implementation contract

নতুন `src/lib/funnel-report-validation.ts`-এ দুইটি pure type guard:

- `isFunnelReport(raw, days)`
- `isShopFunnel(raw, days)`

Guards data mutate, coerce, round, recalculate বা invalid metrics-কে zero করে না। Valid values/arrays অপরিবর্তিত থাকে। Vendor-এর nullable shop ID/AOV, optional product slug এবং genuine zero counts বৈধ। Missing required fields, non-finite numbers, wrong primitive types ও malformed rows reject হয়। Existing rates, money calculation, quiet-shop advice, server RPC parsers ও backend rules অপরিবর্তিত।

Admin card এবং vendor hook API reads এখন `unknown` নিয়ে guard-এর পরে typed data ব্যবহার করে। Invalid body-এ shared message: “The funnel response could not be validated. Try again.” Existing scoped lifecycle/latest-request guards ও Retry mechanism বহাল।

**Intentional compatibility change:** পুরোনো server/odd proxy যদি incomplete successful body দেয়, client এখন error/retry দেখায়; আগের fabricated zero-session fallback সরানো হয়েছে। Complete valid empty report-এর behavior বদলায়নি।

## Regression evidence

**32টি নতুন permanent scenario:**

- `src/components/admin/__tests__/funnel-payload-recovery.test.tsx`: 13 rendered cases — null/empty/error-shaped/partial body, wrong numbers/rows, wrong period, retry ও valid empty window। Error boundary দিয়ে pre-fix renderer failures ধরা হয়েছে; এগুলো post-fix expected behavior নয়।
- `src/lib/__tests__/vendor-funnel-payload-recovery.test.tsx`: 12 hook cases — malformed vendor metrics/rows, wrong period, safe error, retry এবং valid nullable empty report।
- `src/lib/__tests__/funnel-report-validation.test.ts`: 6 pure-guard scenarios, numeric-field mutation matrices ও nested-row/shape checks-সহ। Valid data অপরিবর্তিত থাকার assertions আছে।

- `src/app/admin/reports/__tests__/page.test.tsx`: 1 নতুন full-page regression — best-sellers-shaped body-কে fabricated empty funnel না বলা।

Initial red run: **23 fail / 2 pass**, 25 scenarios। Fix, pure guards ও full-page coverage-এর পরে related previous recovery/card tests-সহ focused run: **7 files / 64 tests PASS**।

প্রথম full-suite run-এ 3,989 pass / 1 fail ছিল। Failed legacy Reports fixture funnel endpoint-এও `{bestSellers:[]}` দিত এবং fabricated empty analytics আশা করত। Valid-empty scenario-তে complete `EMPTY_FUNNEL` response দেওয়া হয়েছে; invalid body-র নতুন full-page assertion error আশা করে। এই test-only adjustment-এর পরে সম্পূর্ণ suite আবার চালানো হয়েছে; final ফল নিচে।

আগের admin period-switch fixtures-এর response `days` selected request অনুযায়ী মিলিয়ে দেওয়া হয়েছে; কিছু পুরোনো test 28-day request-এও 7-day payload mock করত। Dedicated wrong-period regression এখন নিশ্চিত করে সেটি accepted analytics নয়। Previous counter/rate assertions বাদ দেওয়া হয়নি।

## Verification

| Check | ফল |
| --- | --- |
| Focused payload + prior recovery tests | **64/64 PASS**, 7 files |
| ESLint | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Full Vitest suite | **579 files / 3,991 tests PASS**, final run 551.83 s |
| Production dependency audit | **0 vulnerabilities** |
| `git diff --check` | PASS |

Logs: `/home/user/funnel-payload-red.log`, `/home/user/funnel-payload-green.log`, `/home/user/funnel-payload-lint-final.log`, `/home/user/funnel-payload-types-final.log`, `/home/user/funnel-payload-build.log`, `/home/user/funnel-payload-full-suite.log` (initial), `/home/user/funnel-payload-full-suite-final.log` (final), `/home/user/funnel-payload-production-audit.log`।

## Scope ও limitations

- Application changes শুধু new boundary guards এবং admin/vendor funnel readers-এ। Backend routes, permissions/RLS, order/payment/delivery/pricing rules, server parsers/fallbacks বা dependency manifests বদলায়নি। আগের dirty work অক্ষুণ্ণ; no push/deploy।
- Shape-valid report মানেই তার underlying source data সঠিক—এমন প্রমাণ নয়। Server-side coercion/fallback যদি পূর্ণ valid-looking zero report তৈরি করে, client shape guard তা শনাক্ত করতে পারে না। ওই server-side behavior এই batch-এ পরিবর্তন হয়নি।
- Validation finite types ও selected window নিশ্চিত করে; counters-এর business semantics, signed values, ratios-এর mathematical plausibility বা every analytics API exhaustive validate করার দাবি নয়।
- React/jsdom/controlled responses ব্যবহৃত। নতুন browser/device বা real account/production analytics acceptance করা হয়নি; আগের browser test count এখানে নতুন evidence হিসেবে গণনা নয়।
- Real account/session/device/GPS acceptance, original map incident reproduction এবং S01 development-dependency findings এখনো খোলা। Production-only clean audit development debt মেটায় না।

## Server availability follow-up

পরবর্তী [O19/O20 server availability report](funnel-server-availability-2026-10-22.md)-এ explicit RPC/configuration errors-এর fabricated-zero fallback ও false missing-migration classification সরানো হয়েছে। উপরের server-unchanged কথাগুলো এই O17/O18 batch-এর historical scope। Successful malformed RPC payload normalization এখনো আলাদা limitation; client shape guards source-data accuracy প্রমাণ করে না।

## Vendor raw RPC validation follow-up

[O21 vendor RPC validation](funnel-rpc-validation-2026-10-22.md)-এ successful vendor JSONB body-ও parser-এর আগে validate হয়। Vendor production read path-এর malformed-source normalization limitation সেখানে addressed; pure legacy parser ও অন্যান্য analytics RPCs অপরিবর্তিত। Earlier scope/limitations এই O17/O18 batch-এর historical record।
