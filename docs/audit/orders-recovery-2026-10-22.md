# Admin orders recovery — O01–O04

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

আগের [problem audit](open-problems-2026-10-21.md)-এর পর ব্যবহারকারীর “Continue” নির্দেশে প্রথম remediation batch। এটি local implementation ও regression verification-এর report; production deployment বা real-account acceptance report নয়।

## কী ঠিক করা হয়েছে

| Finding | পরিবর্তন |
| --- | --- |
| O01 — প্রথম orders read ব্যর্থ হলে skeleton আটকে থাকা | Read completion আলাদা state দিয়ে track করা হয়েছে। প্রথম failure-এর পর loading শেষ হয়; error, Retry ও Dismiss দেখা যায়। Error dismiss করলেও skeleton ফিরে আসে না। |
| O02 — search/shop/pagination response মিশে যাওয়া | Query/shop/session এবং latest request-এর ownership যাচাই করে response commit হয়। পুরোনো query-এর rows নতুন query-তে দেখানো হয় না; পুরোনো pagination success/error নতুন list বদলায় না। |
| O03 — disabled session-এর cache আবার দেখা যাওয়া | Observed live/disabled transition-এ rows, cursor, pagination, completion/error state reset হয়; in-flight reads invalidated হয়। আগের session-এর mutation completion নতুন session-এর UI refresh/error বদলায় না। |
| O04 — অন্য order-এর late 404/success/error বর্তমান detail বদলে দেওয়া | Detail request ও cache বর্তমান order/session-এর scope-এ সীমাবদ্ধ। ID/session পরিবর্তনে cached detail/missing/error reset হয়। বর্তমান 404-এর পর explicit retry-ও recover করে। |

### Pagination ও search-এর অতিরিক্ত সুরক্ষা

- React state update-এর আগেই synchronous pagination lock duplicate “Load older” request আটকায়।
- Pagination চলাকালে background poll সেটি supersede করে না। Manual refresh পুরোনো read supersede করতে পারে; পুরোনো request-এর `finally` নতুন spinner বন্ধ করতে পারে না।
- সফলভাবে খোলা page count ধরে পরবর্তী refresh/poll সব খোলা page আবার পড়ে। Query/session বদলালে page one থেকে শুরু হয়।
- Refresh ব্যর্থ হলে একই context-এর last-good rows রাখা হয়।
- Orders page-এ loading indicator শুধু result area-তে রাখা হয়েছে, যাতে server-side search-এর সময় search input unmount বা focus হারায় না। Loading-কে “No orders found” বলা হয় না।

## সীমা ও অপরিবর্তিত নিয়ম

- Backend routes, authentication, authorization, order-state transitions, pricing, payment ও delivery rules পরিবর্তন হয়নি। Advance/cancel endpoint এবং payload অপরিবর্তিত।
- Session regression-গুলো একই mounted hook-এ observed `live: true → false → true` transition পরীক্ষা করে। `useStaffLive`-এ প্রকাশ না পাওয়া account-identity change detect করার নতুন ব্যবস্থা যোগ করা হয়নি।
- আগের uncommitted কাজ অক্ষুণ্ণ রাখা হয়েছে। Push/deploy করা হয়নি।

## Regression evidence

Permanent test files:

- `src/lib/__tests__/use-orders-recovery.test.tsx` — 23 correctness scenarios। প্রথম 19 scenario fix-এর আগে **17 fail / 2 pass**, fix-এর পরে pass; পরে আরও 4 recovery/session scenario যোগ করা হয়েছে।
- `src/app/admin/__tests__/orders-loading-recovery.test.tsx` — 2 rendered-page scenarios: search focus preservation এবং actionable error controls।
- বিদ্যমান `src/lib/__tests__/use-orders.test.tsx` — 7 pagination/detail tests অপরিবর্তিত।

Focused run: **3 files / 32 tests pass**। এই batch-এ 25টি নতুন permanent regression test যোগ হয়েছে। Controlled delayed API promises ও React/jsdom ব্যবহার করা হয়েছে; live Supabase নয়।

## যাচাই

| Check | ফল |
| --- | --- |
| Focused hook + page regression | 32/32 PASS |
| ESLint | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Next production build | PASS |
| Production dependency audit | 0 vulnerabilities |
| Full Vitest suite | **571 files / 3,886 tests PASS**, 439.38 s |
| `git diff --check` | PASS |

Sandbox evidence logs: `/home/user/orders-recovery-red.log`, `/home/user/orders-recovery-green.log`, `/home/user/orders-recovery-lint.log`, `/home/user/orders-recovery-types.log`, `/home/user/orders-recovery-build.log`, `/home/user/orders-recovery-production-audit.log`, `/home/user/orders-recovery-full-suite.log`।

## এখনো খোলা

> পরবর্তী “Continue rest” batch-এ O05–O12-ও local remediation পেয়েছে: [remaining remediation report](remaining-recovery-2026-10-22.md)। নিচের তালিকা এই প্রথম batch শেষ হওয়ার সময়কার snapshot। S01 ও production/device acceptance এখনো খোলা।

- **O05–O12**: vendor detail/earnings, rider stats/rating, tracking scope/zero-pair validation, checkout inner GPS handling এবং money error/period-state consistency। এই batch সেগুলো fix করেছে—এমন দাবি নয়।
- আগের audit-এর **8 development-dependency findings**-এর remediation এই batch-এর বাইরে। Production-only audit clean হওয়া development findings মিটে যাওয়ার প্রমাণ নয়।
- Real staff accounts, production Supabase, actual Android/GPS/payment/push এবং browser/device acceptance এই batch-এ পরীক্ষা করা হয়নি। কোনো deployed account-switch breach বা production incident resolved—এমন দাবি করা হচ্ছে না।
