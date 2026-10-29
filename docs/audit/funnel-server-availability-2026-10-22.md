# Vendor funnel server availability — O19/O20

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

[Payload validation follow-up](funnel-payload-recovery-2026-10-22.md)-এর পরে server-side error handling পরীক্ষা। Findings controlled RPC/configuration fixtures দিয়ে নিশ্চিত; production analytics incident-এর দাবি নয়।

## O19 — Failed database read সফল zero-report হয়ে ফিরত

`shopFunnelFor()` generic RPC failure ধরার পরে `emptyShopFunnel(days)` ফেরাত। ফলে statement timeout বা rejected transport promise-এও API HTTP 200 এবং complete zero counts দিত। Client-এর shape validator এমন valid-looking fabricated report শনাক্ত করতে পারত না। পুরোনো DB test-ও timeout দিয়ে zero sessions আশা করত; সেটি genuine quiet-shop test ছিল না।

**Fix:** Operational failure-এ helper এখন `{report:null,missing:false}` ফেরায়। Route এটিকে HTTP 503 ও safe message **“The funnel report is temporarily unavailable. Try again.”** হিসেবে প্রকাশ করে। Internal RPC/connection diagnostic response-এ যায় না। Existing client/card generic-error Retry ব্যবহার করে। Genuine successful zero-count report HTTP 200-ই থাকে; নতুন dedicated success test আছে।

## O20 — Operational/configuration error-কে missing migration বলা হতো

- Migration-detection regex-এ শুধু `ps_shop_funnel_report` নাম থাকলেই missing ধরে নেওয়া হতো; permission denied বা timeout diagnostic-এ নামটি থাকলেও তাই ঘটত।
- Service client না থাকা/initialization exception এবং empty shop ID-ও `missing:true` হতো।
- Route `missing || !report` একসঙ্গে migration error-এ পাঠাত; report না পাওয়া মানেই migration অনুপস্থিত নয়।

**Fix:** Existing missing-schema codes `PGRST202`, `42883`, `42P01` বজায় আছে। Code অনুপস্থিত/empty হলেই শুধু target function-এর explicit not-found/does-not-exist অথবা `storefront_events` relation absence message fallback হিসেবে গ্রহণ হয়। Explicit non-missing code text matching দিয়ে override হয় না। Unrelated function absence বা নামমাত্র RPC mention migration proof নয়।

Service/configuration failure ও empty verified-shop identity generic unavailable হয়। Empty shop identity-তে query হয় না; direct `shopFunnelReport()` call-ও schema-missing exception না দিয়ে missing verified shop error দেয়। Route এখন migration ও unavailable আলাদা করে; প্রকৃত schema-missing state-এর existing HTTP 503 `{error,missing:true}` contract ও Retry বহাল।

## Changed files ও preserved contracts

Application edits শুধু:

- `src/lib/db/vendor-funnel.ts`: failure result ও missing-schema classification।
- `src/app/api/vendor/funnel/route.ts`: unavailable ও missing response আলাদা করা।

`vendorRoute` wrapper, authentication implementation, RLS, SQL/migrations, funnel parser/calculations, order/payment/pricing/delivery rules, dependencies বা client UI এই batch-এ বদলায়নি। Verified `ctx.shopId` দিয়েই RPC; query-string shop ID উপেক্ষিত। Days 28 হলে 28, অন্য value-এ আগের মতো 7। API error response `Cache-Control: no-store` রাখে।

## Regression evidence

`src/app/api/__tests__/vendor-funnel-availability.test.tsx`-এ **25টি নতুন scenario**:

- Returned timeout/permission/connection error, uncoded diagnostic, unrelated function absence এবং contradictory explicit operational code → generic 503; fake report/migration নয়।
- Three supported schema codes ও three explicit uncoded target-schema absence messages → existing migration response।
- Null service ও thrown initialization; rejected transport promise; empty shop → unavailable, safe error/no unauthorized query।
- Genuine successful empty report → 200।
- Session-shop scoping, existing day parsing, 401/403 denial ও 429/Retry-After flow।
- Actual route → client hook → rendered card controlled integration: timeout-এ Retry, zero/migration copy নয়; Retry-তে successful empty report এলে quiet-shop copy।

এখানে DB helper, route, `vendorRoute`, hook ও card-এর actual implementations ব্যবহৃত; auth provider, rate-limit decision ও service client mocked। Existing `vendor-routes.test.ts` actual unauthenticated route coverage-সহ focused run-এ আছে। এটি real account/RLS/rate-limit-storage/network/browser acceptance নয়।

পুরোনো 9 DB tests রাখা হয়েছে; misleading timeout ও unconfigured-service expectations সংশোধন করা হয়েছে। Initial new-test red run: **8 fail / 10 pass**, 18 scenarios। Extra classification/initialization cases-সহ final new suite **25/25 PASS**। Previous DB/client recovery ও unauthenticated routes-সহ focused run **5 files / 63 tests PASS**, 6.11 s।

## Verification

| Check | ফল |
| --- | --- |
| Focused regression tests | **63/63 PASS**, 5 files |
| ESLint | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Full Vitest suite | **580 files / 4,016 tests PASS**, 556.16 s |
| Production dependency audit | **0 vulnerabilities** |
| `git diff --check` | PASS |

Logs: `/home/user/funnel-server-{red,green,lint,types,build,full-suite,production-audit}.log`। Initial red log covers the original 18 new scenarios; final focused log covers all 25 plus existing tests।

## Remaining limitations

- `parseShopFunnel()` successful malformed/null/partial RPC data normalize/coerce করতে পারে। এই batch raw successful RPC schema validate করে না; এ পথে valid-looking zero report-এর সম্ভাবনা এখনো আছে। O19 fix explicit read/configuration errors-এর জন্য, সব fabricated analytics possibility সমাধানের দাবি নয়।
- Known missing-schema codes আগের contract অনুযায়ী রাখা হয়েছে; actual production migration state independently inspect/apply করা হয়নি। No SQL/calculation changes or source-data accuracy certification।
- No new browser/device/real Supabase/production-account testing, push বা deploy। Historical dirty work অক্ষুণ্ণ।
- S01 development-dependency findings এখনো খোলা; clean production-only audit development debt মেটায় না।

## Successful RPC validation follow-up

[O21 vendor RPC validation](funnel-rpc-validation-2026-10-22.md)-এ production vendor read boundary-তে malformed successful payload parser-এর আগে reject করা হয়েছে; shop/window echo-ও যাচাই হয়। উপরের raw-normalization limitation O19/O20 batch-এর historical scope। Legacy pure parser নিজে এখনো forgiving, কিন্তু এই vendor RPC read path আর unvalidated payload-এ সেটি চালায় না।
