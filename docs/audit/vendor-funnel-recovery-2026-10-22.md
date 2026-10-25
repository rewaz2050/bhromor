# Vendor funnel — scoped report ও truthful recovery

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

ব্যবহারকারীর পরবর্তী “Continue” নির্দেশে shared vendor-resource helper-এর বাইরে থাকা `useVendorFunnel` যাচাই করা হয়েছে। [আগের remediation report](remaining-recovery-2026-10-22.md)-এ পৃথক hooks blanket verified বলা হয়নি। এই follow-up-এ নিচের আচরণগুলো regression test দিয়ে নিশ্চিত করে fix করা হয়েছে।

## নিশ্চিত finding ও fix

### O13 — Funnel period/session cache আলাদা ছিল না

**Reproduction:** 7-day report loaded → 28-day select → pending read-এর সময় 7-day report ও `loading=false` returned হয়। একই hook disable করলে আগের shop report returned থাকত; re-enable-এর pending অবস্থায়ও cache পরিষ্কার হতো না। আগের period-এর 503/error নতুন period pending অবস্থায় থেকে যেত। Disabled hook-এর saved refresh callback loading true করতে পারত, অথচ read শুরু হতো না।

**Fix:** Funnel এখন `useScopedRead` দিয়ে enabled lifetime ও resource path (`days`) অনুসারে snapshot রাখে। Key/session boundary-তে data/status/error/missing reset হয়; old data mask হয় এবং নতুন read loading হয়। Late response/error ও disabled callbacks current state বদলাতে পারে না। Report এবং HTTP/error metadata একই scoped snapshot-এ থাকে। Explicit refresh-এর পুরোনো fire-and-forget callback contract রাখা হয়েছে।

### O14 — Generic 503 মানেই missing migration ধরে নেওয়া

**Reproduction:** `/api/vendor/funnel` HTTP 503 `{ error: "Temporarily unavailable" }` → hook `missing=true`; card migration চালাতে বলে, যদিও response-এ missing schema-এর evidence নেই।

**Fix:** `VendorApiError` এখন server-এর strict boolean `missing` metadata বহন করে। **শুধু HTTP 503 এবং `missing: true`** একসঙ্গে থাকলে funnel missing-migration state দেখায়। Generic 503, network failure, `missing: "true"`, বা 403 `missing:true`-এ সাধারণ error recovery দেখায়। Error message/status এবং vendor deny-reason handling বহাল। Backend route/payload/authorization বদলায়নি।

**Existing server contract checked:** `src/app/api/vendor/funnel/route.ts` missing report-এর জন্য `{error, missing:true}` এবং status 503 দেয়। Client নতুন status বা backend API contract invent করে না।

### Missing report recheck

Server-confirmed missing state-এও “Try again” যোগ হয়েছে, যাতে migration প্রয়োগের পরে report recheck করা যায়। Generic error ও missing-state retry controls-এর minimum height 44 px। Period controls loading অবস্থায় mounted থাকে। Revenue/order/session calculations, thin-base advice ও source-of-truth rules অপরিবর্তিত।

## Permanent regression tests

- `src/lib/__tests__/use-vendor-funnel-recovery.test.tsx`: **14 নতুন scenario** — range switch, disable/re-enable, pending old-session success/error, missing/error reset, status classification, retry, saved callback, latest refresh এবং hook+card rendered integration।
- `src/components/vendor/__tests__/funnel-card.test.tsx`: **1 নতুন scenario** — server-confirmed missing report-এর Retry callback। আগের 8 card tests রাখা হয়েছে।

মোট **15টি নতুন permanent regression test**। Fix-এর আগের প্রথম run: **7 fail / 14 pass**, 21 scenario (8 existing case-সহ)। Fix ও আরও 2 rendered integration scenario-এর পরে funnel + related resource/thread run: **4 files / 40 tests PASS**। Controlled fetch response ও delayed promises/React/jsdom ব্যবহৃত; real shop/session নয়।

## Verification

| Check | ফল |
| --- | --- |
| Focused funnel/resource/thread regression | **40/40 PASS**, 4 files |
| ESLint | PASS, no warnings |
| TypeScript | PASS |
| Production build | PASS |
| Production dependency audit | **0 vulnerabilities** |
| Full Vitest suite | **574 files / 3,932 tests PASS**, 592.41 s |
| `git diff --check` | PASS |

Logs: `/home/user/funnel-recovery-red.log`, `/home/user/funnel-recovery-green.log`, `/home/user/funnel-recovery-lint.log`, `/home/user/funnel-recovery-types-final.log`, `/home/user/funnel-recovery-build.log`, `/home/user/funnel-recovery-production-audit.log`, `/home/user/funnel-recovery-full-suite.log`।

প্রথম lint/typecheck foreground command timeout-এর পরে চলছিল; সেটি duplicate করে চালানো হয়নি। প্রথম lint warning callback dependency destructure দিয়ে ঠিক করা হয়েছে। পরে tracked static/build process এবং পৃথক final TypeScript process exit 0 দিয়েছে।

> **পরবর্তী follow-up:** admin analytics funnel-এর পৃথক lifetime/503 recovery-ও পরীক্ষা করে fix হয়েছে: [O15/O16 admin funnel recovery](admin-funnel-recovery-2026-10-22.md)। নিচের সীমা এই vendor batch-এর historical scope।

> **Payload follow-up:** পরবর্তী [O17/O18 validation batch](funnel-payload-recovery-2026-10-22.md)-এ vendor/admin report-এর shape ও selected-window validation যোগ হয়েছে। নিচের scope এই আগের batch-এর snapshot।

## Scope ও যা বাকি

- Application changes এই batch-এ vendor client error metadata/funnel hook এবং vendor funnel card-এ সীমাবদ্ধ। Shared scoped-read implementation, backend permissions, shop identity selection, ledger/pricing/order transitions বা dependency manifests পরিবর্তন হয়নি। আগের dirty work রাখা হয়েছে; push/deploy করা হয়নি।
- Session tests একই mounted hook-এর observed enabled/disabled transition ব্যবহার করে। Enabled true রেখেই account identity বদলালে সেটি শনাক্ত করার নতুন auth mechanism নয়। No demonstrated live privacy breach বা unauthorized API read claim।
- [আগের 19 browser contracts](browser-recovery-2026-10-22.md) ছিল orders/money/dashboard verification; সেগুলো vendor funnel-এর নতুন browser acceptance হিসেবে গণনা করা হয়নি। এই batch-এর rendered tests jsdom, physical browser/device নয়।
- Real vendor account, actual migration install/recheck, production Supabase এবং physical-device verification বাকি। সব analytics/admin hooks exhaustive verified—এমন দাবি নয়।
- আগের S01 development-dependency findings এখনো খোলা; production-only audit clean হওয়া সেগুলোর remediation নয়।

## Server availability follow-up

[O19/O20 server availability report](funnel-server-availability-2026-10-22.md)-এ server-এর operational failure আর valid-looking zero report হয় না; configuration/RPC errors-ও migration state থেকে আলাদা। এখানে “backend unchanged” ও original missing-report contract O13/O14 batch-এর historical scope; updated route null report ও explicit missing schema আলাদা করে। Successful malformed RPC normalization এখনো আলাদা limitation।
