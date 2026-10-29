# Admin analytics funnel — O15/O16 follow-up

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

ব্যবহারকারীর “Continue” নির্দেশে [vendor funnel follow-up](vendor-funnel-recovery-2026-10-22.md)-এর পর admin analytics card-এর session/availability handling পরীক্ষা করা হয়েছে। এটি আগের 12-finding audit-এর নতুন scoped follow-up; পুরো analytics system বা real production accounts-এর acceptance report নয়।

## O15 — নতুন enabled lifetime-এ পুরোনো admin report ফিরে আসে

**Confirmed reproduction:** `live=true` অবস্থায় 211 sessions-এর report load → `live=false` → আবার `live=true`, নতুন GET pending। Card পুরোনো 211 sessions আবার দেখায়; fresh loading state নয়। একইভাবে আগের missing-schema message-ও নতুন session-এর pending read-এ ফিরে আসে। Disabled render data লুকালেও backing snapshot lifetime অনুযায়ী reset হতো না।

**Fix:** `src/components/admin/funnel-card.tsx` এখন existing `useScopedRead` ব্যবহার করে। Report, error ও availability metadata enabled lifetime এবং selected 7/28-day key-এর snapshot-এ থাকে। Disabled/re-enabled state reset হয়; fresh read pending থাকলে পুরোনো totals/error/migration guidance দেখায় না। Late request এবং root StrictMode cleanup guard করা থাকে। Period controls mounted থাকে।

এটি observed `live:true → false → true` boundary-র fix। Enabled flag অপরিবর্তিত রেখে account identity পাল্টালে তা শনাক্ত করার নতুন auth mechanism নয়। Server authorization bypass বা deployed cross-account breach ঘটেছে—এমন দাবি নেই।

## O16 — Generic 503-কে missing migration বলে; error recovery control নেই

**Confirmed reproduction:** HTTP 503 `{error:"Analytics unavailable"}` পেলেই card “Not installed yet — run migration” দেখাত। `missing:false` বা `missing:"true"`-তেও একই ফল। Network error-এর message থাকলেও card-এ Retry ছিল না।

**Fix:**

- `AdminApiError` server-এর **strict boolean `missing`** metadata রাখে। Optional third constructor argument; existing two-argument calls কাজ করে।
- GET, send ও download error readers একই metadata, original status/message এবং non-JSON fallback বজায় রাখে। Network/401 sign-out logic, bearer headers, credentials, success-body behavior ও endpoint payload বদলায়নি।
- Card **শুধু `AdminApiError`, status 503 এবং `missing:true` একসঙ্গে** পেলে migration guidance দেখায়। Generic 503/network/403 সাধারণ error হিসেবে দেখায়।
- Error message `role="alert"` পায়। Error ও confirmed-missing—দুই branch-এ minimum-height 44 px “Try again” যোগ হয়েছে। Retry loading/success-এ পুরোনো error guidance সরায়।

**Backend contract checked:** `src/app/api/admin/reports/funnel/route.ts` শুধুমাত্র `FunnelReportMissingError`-এর জন্য HTTP 503 `{error,missing:true}` দেয়। অন্য errors route wrapper-এ যায়। Route/permissions/database logic বদলায়নি।

**Preserved:** Funnel rates, order/customer calculations, empty-report/old-server fallback এবং existing 7/28-day selection। Malformed-success payload validation-এর নতুন exhaustive audit করা হয়নি।

## Regression evidence

**27টি নতুন permanent scenario:**

- `src/components/admin/__tests__/funnel-recovery.test.tsx`: 12 rendered-card scenarios। Real `apiGet` এবং controlled fetch responses দিয়ে lifetime reset, old missing reset, generic 503 variants, forbidden response, retry, stale success/error, period controls ও root StrictMode পরীক্ষা।
- `src/lib/__tests__/admin-api-missing-metadata.test.ts`: 15 transport-metadata cases। GET/send/download-এর strict `true` বনাম false/string/absent এবং non-JSON 502 fallback। এগুলো API metadata contract tests; 15টি আলাদা production defect claim নয়।

Initial red run: **19 fail / 2 pass**, 21 scenarios (7 UI regressions এবং 12 new metadata-contract assertions failed)। অতিরিক্ত edge regressions শেষে related existing card/bearer tests-সহ: **4 files / 35 tests PASS**।

পুরোনো card test generic two-argument 503 exception-কে missing schema বলত; সেটি server-confirmed `new AdminApiError(message,503,true)` দিয়ে updated contract test হয়েছে। Empty-window ও analytics arithmetic assertions বাদ দেওয়া হয়নি।

## Verification

| Check | ফল |
| --- | --- |
| Focused rendered-card/API/bearer regression | **35/35 PASS**, 4 files |
| ESLint | PASS, no warnings |
| TypeScript | PASS |
| Next production build | PASS |
| Full Vitest suite | **576 files / 3,959 tests PASS**, 548.86 s |
| Production dependency audit | **0 vulnerabilities** |
| `git diff --check` | PASS |

Logs: `/home/user/admin-funnel-red.log`, `/home/user/admin-funnel-green.log`, `/home/user/admin-funnel-lint.log`, `/home/user/admin-funnel-types.log`, `/home/user/admin-funnel-build.log`, `/home/user/admin-funnel-full-suite.log`, `/home/user/admin-funnel-production-audit.log`।

> **পরবর্তী payload follow-up:** [O17/O18 boundary validation](funnel-payload-recovery-2026-10-22.md)-এ malformed successful response-এর fabricated empty fallback সরানো হয়েছে। Valid complete empty report ও calculations বহাল। উপরের “preserved old-server fallback” এই আগের batch-এর historical statement, বর্তমান behavior নয়।

## সীমা ও খোলা acceptance

- No backend permissions/RLS, order/payment/pricing rules বা dependency manifest changes। আগের dirty work রাখা হয়েছে; push/deploy করা হয়নি।
- Tests React/jsdom ও controlled responses ব্যবহার করে; real staff account/real analytics revenue/session counts নয়। এই batch-এ নতুন browser/device run করা হয়নি; আগের [19 browser contracts](browser-recovery-2026-10-22.md) admin funnel-এর acceptance হিসেবে গণনা করা হচ্ছে না।
- Real account-switch/navigation/remount behavior, production analytics/migration recovery, physical device/GPS এবং production performance/WCAG acceptance বাকি।
- S01 development-dependency findings এখনো খোলা; production-only clean audit দিয়ে সেগুলো resolved ঘোষণা করা হয়নি।

## Final server/poll follow-up

[Final consolidation — O22–O24](final-build-consolidation-2026-10-22.md)-এ admin raw successful RPC validation, missing-schema code precedence এবং polling lifetime recovery delivered। Earlier backend-unchanged statements describe the historical O15/O16 batch; current admin production read validates raw data before the forgiving parser।
