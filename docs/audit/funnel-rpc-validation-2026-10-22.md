# Vendor funnel RPC contract validation — O21

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

[O19/O20 server availability](funnel-server-availability-2026-10-22.md)-এর remaining vendor RPC normalization limitation-এর follow-up। Controlled successful RPC fixtures দিয়ে finding নিশ্চিত; deployed analytics corruption বা cross-shop data exposure-এর দাবি নয়।

## Confirmed problem

`shopFunnelReport()` successful RPC body সরাসরি forgiving `parseShopFunnel()`-এ পাঠাত। `null`, `{}` বা partial data থেকেও parser full-shaped zero metrics বানাত; malformed rows filter/coerce করত। ফলে existing browser shape guards source body-র invalidity শনাক্ত করতে পারত না। RPC response-এ wrong shop বা wrong period echo-ও server গ্রহণ করত। Actual SQL অন্য shop query করে—এমন evidence নেই; inconsistent mocked response দিয়ে boundary পরীক্ষা করা হয়েছে।

New DB regression-এর pre-fix result: **29 fail / 4 pass**, 33 tests। Genuine successful populated/empty compatibility tests আগেই pass করত; failure cases fabricated/coerced metrics অথবা unchecked echo গ্রহণ করছিল।

## Fix

নতুন pure `src/lib/shop-funnel-rpc-validation.ts` JSONB wire contract যাচাই করে। `src/lib/db/vendor-funnel.ts` parser চালানোর **আগে** guard ব্যবহার করে। Contract `supabase/migrations/202609280004_shop_funnel.sql`-এর `jsonb_build_object` output-এর সঙ্গে মিলিয়ে দেখা হয়েছে:

- Object body; required finite numeric snake_case metrics; requested 7/28-day echo। Numeric strings/booleans/missing metrics numbers হিসেবে বানানো হয় না।
- Verified requested shop-এর echo; absent/null/another-shop identity accepted report নয়।
- Explicit nullable finite AOV।
- Required source/product arrays; প্রতিটি row-এর identity/label ও numeric fields। Invalid row silently drop/coerce হয় না।
- SQL-এর nullable product slug accepted; existing optional/string/empty slug normalization ও extra-field compatibility বহাল।

Invalid body-তে direct reader generic validation error দেয়। Existing nonthrowing helper সেটিকে `{report:null,missing:false}` এবং O19/O20 route safe **HTTP 503** “The funnel report is temporarily unavailable. Try again.” করে। Schema-missing বলে invent হয় না, raw body/another-shop metrics response-এ যায় না। Existing hook/card Retry ব্যবহার করে; নতুন UI বা response field লাগে না।

Successful complete empty এবং populated reports আগের parser দিয়ে আগের মতো map হয়। Parser, money/rate calculations, SQL/migrations, authentication/authorization, RLS, order/payment/pricing/delivery rules ও dependencies অপরিবর্তিত। এই batch-এ vendor route বা UI implementation-ও বদলায়নি।

**Intentional compatibility change:** incomplete/odd legacy RPC output আর silently repair হয় না। Current migration-এর full JSONB contract না মিললে unavailable/Retry হয়। Numeric strings SQL JSONB numeric output-এর বিকল্প হিসেবে গ্রহণ করা হয় না। Shape validation data accuracy বা business-semantic validity-এর প্রমাণ নয়।

## Regression coverage

**42টি নতুন permanent scenario:**

- `src/lib/db/__tests__/shop-funnel-rpc-validation.test.ts`: **33 tests** — null/primitive/array/empty/partial/error-shaped body; nine required metrics-এর invalid-value matrices; AOV; days/shop echo; nested collections/rows; 7/28-day populated reports; genuine zero/null-AOV report; nullable/optional/string slug এবং extra fields। Every invalid case checks both direct rejection and nonthrowing unavailable result।
- `src/app/api/__tests__/vendor-funnel-availability.test.tsx`: **9 added tests** — eight malformed/mismatched successful RPC cases through actual helper/route/wrapper → generic 503, no migration/report; one route → actual hook → rendered card Retry recovery from malformed success to genuine quiet-shop data। File now has 34 tests; previous 25 availability tests preserved। Auth provider, rate-limit decision ও service client mocked; এটি production HTTP/account/DB acceptance নয়।

Old DB 28-day success fixture আগে `days:7` দিত; now successful fixture echoes 28। Previous API day-parsing test-ও requested window অনুযায়ী fixture ফেরায় এবং HTTP 200 assert করে। Dedicated wrong-window cases invalid echo reject করার coverage রাখে; অন্য counter/source assertions বাদ দেওয়া হয়নি।

## Verification

| Check | ফল |
| --- | --- |
| Initial new DB tests before fix | **29 FAIL / 4 PASS**, expected red |
| Focused DB/API/prior client recovery | **5 files / 102 tests PASS**, 6.06 s |
| ESLint | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Full Vitest suite | **581 files / 4,058 tests PASS**, 532.35 s |
| Production dependency audit | **0 vulnerabilities** |
| `git diff --check` | PASS |

Logs: `/home/user/funnel-rpc-{red,green,lint,types,build,full-suite,production-audit}.log`।

## Limitations ও scope

- Validation only vendor `ps_shop_funnel_report` production read boundary-তে। Legacy pure `parseShopFunnel()` remains forgiving for existing callers/tests; direct parser usage is not independently strict। Other analytics RPCs এই guard-এর আওতায় আনা হয়নি।
- Finite fields, row shape ও scope/window echo যাচাই হয়; source data correctness, counter relationships, safe-integer bounds, money correctness বা signed-value business semantics certify/recalculate করা হয়নি।
- Migration output source read হয়েছে; real production migration state, Supabase account/RLS behavior, actual analytics values বা browser/device flows নতুন করে পরীক্ষা করা হয়নি। Controlled React/jsdom integration is not deployed E2E evidence।
- Historical dirty work preserved; no push/deploy। S01 development-dependency debt এখনো খোলা; clean production audit তার remediation নয়।

## Admin counterpart / final consolidation

[O22–O24 final consolidation](final-build-consolidation-2026-10-22.md)-এ admin `ps_funnel_report` raw contract validation-ও যোগ হয়েছে। উপরের vendor-only scope এই O21 batch-এর historical scope; সব analytics RPC exhaustive validation-এর দাবি এখনো নয়।
