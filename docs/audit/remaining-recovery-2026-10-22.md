# Remaining audit remediation — O05–O12

২২ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`

ব্যবহারকারীর “Continue rest” নির্দেশে আগের [audit](open-problems-2026-10-21.md)-এর বাকি আটটি behavior finding-এর local remediation। O01–O04-এর আগের batch: [orders recovery](orders-recovery-2026-10-22.md)। এখানে implementation ও automated local evidence দেওয়া হয়েছে; production/device acceptance দাবি নয়।

## পরিবর্তন

| Finding | Local remediation |
| --- | --- |
| **O05** Vendor order ID mismatch | Resource path বদলালে আগের order/error mask ও reset হয়; নতুন read pending অবস্থায় loading দেখায়। Late previous-ID response/error নতুন detail বদলায় না। |
| **O06** Vendor resource session retention | Shared vendor resource helper এখন enable lifetime/path-scoped read cache ব্যবহার করে। Disable হলে data/error/loading পরিষ্কার; re-enable হলে fresh read। Old-session success/failure এবং saved callback disabled resource-এ data ফিরিয়ে দিতে পারে না। |
| **O07** Rider stats/rating retention | Stats ও rating একই scoped read mechanism ব্যবহার করে। Disable/re-enable-এ cache reset এবং pending responses invalidated হয়। Stats-এর latest refresh wins; malformed response-এ একই context-এর last-good stats রাখা এবং silent-error behavior অক্ষুণ্ণ। |
| **O08** Tracking identity/channel retention | Order ID, phone, token ও enabled lifetime বদলালে rider fix, timestamp clock, channel ও live indicator reset হয়। পুরোনো HTTP response এবং detached socket callbacks নতুন identity-তে commit করতে পারে না; previous subscription সরানো হয়। |
| **O09** Null-island validation | Tracking hook map-এর `asMapPoint` validity policy ব্যবহার করে। `(0,0)`, non-finite ও out-of-range pair reject; একটি coordinate শূন্য হলেই reject নয়। Invalid broadcast timestamp-ও নিরাপদে বাদ যায়। |
| **O10** Inner GPS fabricated boundary pin | Map-এর GPS control finite/local coordinates অপরিবর্তিত পাঠায়। Outside-area GPS boundary-তে clamp না করে bilingual warning দেখায়; pin/zone callback চালায় না। Invalid GPS-এ unavailable message। Manual pin/address input বহাল। |
| **O11** Money failure mistaken for missing backend | শুধু successful `ready:false` response missing-backend state নিশ্চিত করে। Network/unknown state-এ migration-কে দোষ না দিয়ে Retry/Dismiss দেখায়। Error dismiss করলে endless initial loading ফিরে আসে না। |
| **O12** Old-period P&L under new tab | P&L result fetched range দিয়ে keyed। Selected range-এর সঙ্গে না মিললে old totals দেখানো হয় না। Loading/failure/null আলাদা; period tabs mounted থাকে এবং Retry net result আছে। Server-এর null P&L-ও আর নিশ্চিত missing migration বলা হয় না। |

### Read cache contract

নতুন `src/lib/use-scoped-read.ts`-এ scoped lifecycle ও monotonic request ownership আছে। Vendor helper-এর initial/manual retry loading এবং quiet reload/poll আলাদা। Same-context refresh failure last-good data রাখে; নতুন key/lifetime পুরোনো data ধরে না। Request cleanup/unmount ও React root StrictMode regression অন্তর্ভুক্ত।

এটি **observed enabled/disabled boundary** অনুসরণ করে; authentication system-এ identity event যোগ করা হয়নি। কোনো session change যদি enabled flag না বদলায়, সেটি নিজে থেকে account-ID দিয়ে শনাক্ত করার নতুন ব্যবস্থা নয়। Vendor shared helper-এর বাইরের পৃথক hooks-কে blanket verified ঘোষণা করা হচ্ছে না।

> **আরও follow-up:** পৃথক vendor funnel hook-এর period/session cache ও generic-503 classification পরবর্তী batch-এ পরীক্ষা করে fix হয়েছে: [Vendor funnel recovery — O13/O14](vendor-funnel-recovery-2026-10-22.md)।

## Regression evidence

এই batch-এ **31টি নতুন permanent test**:

- `src/lib/__tests__/resource-session-recovery.test.tsx`: 14 — vendor detail/cache, earnings, rider stats/rating, disable/re-enable, stale response/error, saved callbacks, null ID, retry, root StrictMode।
- `src/lib/__tests__/tracking-scope-recovery.test.tsx`: 7 — order/phone/token switch, old HTTP/channel/socket rejection, disabled state, zero-pair ও timestamp validation।
- `src/components/checkout/__tests__/map-pin-picker.test.tsx`: 3 নতুন — outside/invalid GPS rejected এবং valid local GPS unchanged, map initialized অবস্থায়।
- `src/lib/__tests__/use-admin-money.test.tsx`: 4 নতুন — range failure/retry, initial error dismissal, confirmed missing state।
- `src/app/admin/__tests__/admin-money-page.test.tsx`: 3 নতুন — truthful failure/retry, unknown state, period loading/failure controls।

প্রথম red runs-এ সম্মিলিত **18 failures / 25 passes** (43 scenarios, কিছু existing test-সহ) পাওয়া যায়। Fix ও অতিরিক্ত regression শেষে focused run: **8 files / 74 tests PASS**। Red ফল health check নয়; সমস্যা পুনরুৎপাদনের evidence।

## Verification

| Check | ফল |
| --- | --- |
| Focused regression + related tests | **74/74 PASS**, 8 files |
| ESLint | PASS |
| TypeScript | PASS |
| Next production build | PASS |
| Production dependency audit | **0 vulnerabilities** |
| Full Vitest suite | **573 files / 3,917 tests PASS**, 450.61 s |
| `git diff --check` | PASS |

Logs: `/home/user/rest-resource-red.log`, `/home/user/rest-tracking-money-gps-red.log`, `/home/user/rest-recovery-focused.log`, `/home/user/rest-recovery-lint.log`, `/home/user/rest-recovery-types.log`, `/home/user/rest-recovery-build.log`, `/home/user/rest-recovery-full-suite.log`, `/home/user/rest-recovery-production-audit.log`।

## S01 — Development dependency findings এখনো খোলা

Fresh audit: **8 affected-package entries — 5 high / 3 moderate**, production-only audit clean। Package manifest/lockfile এই batch-এ বদলায়নি।

- Next ESLint chain: `fast-glob → micromatch → braces`। Registry-তে latest `braces` **3.0.3**, আর বর্তমান advisory সেটিকেও affected বলে (`<=3.0.3`, GHSA-vfj7-8cjw-p6xm)। Latest Next ESLint plugin **16.4.2**-এর dependency-ও `fast-glob: 3.3.1`; শুধু plugin patch upgrade এই finding সরানোর প্রমাণ নয়।
- Capacitor CLI **8.5.3** latest এবং `xcode: ^3.0.1` ব্যবহার করে; resolved xcode 3.0.1 → uuid 7.0.3 affected। xcode 4.0.0 প্রকাশিত হলেও তা CLI-এর declared major range-এর বাইরে।
- `npm audit`-এর suggested remedies Next ESLint **14.2.35** বা Capacitor CLI **8.4.3**-এ downgrade দেখায়। Framework/native-tool compatibility প্রমাণ ছাড়া সেগুলো বা cross-major overrides প্রয়োগ করা হয়নি।

Dependency evidence: `/home/user/rest-recovery-dependencies.json` এবং registry metadata query। S01 resolved বলা হচ্ছে না। নিরাপদ পথ হলো compatible upstream patch পর্যবেক্ষণ, অথবা আলাদা compatibility-validated tooling remediation।

> **পরবর্তী verification batch:** orders/money recovery-এর নতুন 12টি এবং existing dashboard-এর 7টি browser contract পাস করেছে। বিস্তারিত scope ও অবশিষ্ট real-device/account acceptance: [Browser recovery verification](browser-recovery-2026-10-22.md)। নিচের সীমাগুলো এই implementation batch-এর historical scope।

## Scope ও acceptance সীমা

- Backend routes, permissions/RLS, pricing, delivery bounds, zone calculation, order/payment transitions এবং ledger calculations বদলায়নি। GPS rejection আগে থেকেই থাকা delivery bounds অনুসরণ করে; service area পুনর্নির্ধারণ নয়।
- Existing dirty work রাখা হয়েছে; push/deploy করা হয়নি।
- React/jsdom, controlled fetch failures/delays, mocked sockets/Leaflet/geolocation ব্যবহৃত। Real vendor/rider accounts, physical Android GPS, live Supabase/Realtime, payment/push বা production browser flow এই batch-এ নতুন করে পরীক্ষা হয়নি।
- O01–O12-এর audited behavior scenarios এখন local remediation পেয়েছে। **সব application problem শেষ**, **live incident resolved**, বা **deployed cross-account breach fixed**—এমন দাবি নয়। Original map incident-এর exact URL/screenshot/real-device reproduction এখনো প্রয়োজন।
