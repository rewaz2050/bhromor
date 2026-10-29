# Next update — map/media, financial recovery ও workflow verification

> **পরবর্তী continuation:** [Dispatch/roster recovery](dispatch-recovery-2026-10-21.md) — latest full suite 569 files / 3,861 passed; fresh dashboard browser suite 7/7। নিচের আগের results historical।

তারিখ: ২১ অক্টোবর ২০২৬। Branch: `arena/bcb37d54-bhromor`। আগের পরিবর্তন সংরক্ষিত; কোনো deploy/push করা হয়নি। Authentication/permissions, pricing, stock, order/payment/settlement business rules বা production dependencies বদলানো হয়নি।

## ছয়টি requested workstream-এর অবস্থা

| কাজ | বর্তমান অবস্থা |
| --- | --- |
| Dependency security | নতুন audit/registry metadata review সম্পন্ন; **8 dev findings এখনও unresolved**। Compatible upstream fix পাওয়া যায়নি; unsafe downgrade নয়। |
| Map/image resilience | Checkout/tracker-এর CDN stylesheet dependency সরানো, local pin, tile fallback/retry, checkout initialization failure recovery এবং admin product image preview retry সম্পন্ন। |
| Dashboard recovery | Admin money ও rider earnings-এ stale in-flight response/session-reset guards; admin initial-error loading recovery; regression tests সম্পন্ন। সব endpoint-এর exhaustive freshness audit দাবি নয়। |
| Catalog/checkout QA | Fixture-backed browser regression সম্পন্ন। Real server-rendered populated catalog/remote image optimizer-এর configured environment acceptance এখনও blocked। |
| Authenticated workflow | **Local real PostgreSQL 17.10-এ 10 PASS groups**, real concurrent sessions এবং own-shop RLS/grants পরীক্ষা সম্পন্ন। Deployed Supabase/auth-service/payment/GPS acceptance এখনও বাকি। |
| Final regression/release checklist | Lint/typecheck/build, browser ও SQL checks passed; **final whole-suite rerun passed: 567 files / 3,846 tests**। নিচের release checklist প্রযোজ্য। |

## নিশ্চিত সমস্যার প্রমাণ ও সমাধান

### Checkout map

নতুন প্রথম চারটি regression-ই আগে ব্যর্থ হয়েছে: CDN link injection, initialization failure-এ endless loading/unhandled rejection, blocked tile-এ কোনো status নেই, parent rerender-এর পরে stale callback।

- Leaflet CSS npm package থেকে bundle করা হয়; customer pin local `divIcon`, unpkg marker PNG নয়।
- Initialization failure-এ bilingual status/retry। Tile failure-এ neutral local SVG tile, truthful street-detail warning; manual pin selection চলতে থাকে।
- Map-এর panes isolated/contained। ResizeObserver/frame ও map/marker refs cleanup হয়; location permission denial-এ address না বদলে guidance দেখায়। Unmount-এর পরে geolocation callback address বদলায় না।
- Current callbacks refs দিয়ে map click/drag-এর zone/address handoff current parent-এ যায়। Zone calculation, delivery charge, clamping এবং no-auto-select behavior অপরিবর্তিত।

### Customer tracking map

- Leaflet CSS local bundle; pin CSS local style। Rejected import promise স্থায়ী cache নয়।
- Failed tiles-এ real received-position pins রেখে neutral tiles/status/retry; fake fresh location বা successful tile load দাবি নয়। Retry tile redraw করে, rider motion/follow rules অপরিবর্তিত।
- Async pin updates removed map-এ লেখা থেকে guarded; resize timeout/animation cleanup; map stacking isolated, recenter/retry targets 44px।

### Admin product media

`MediaPreviewImage` product-image, Drive thumbnail ও YouTube thumbnail-এ ব্যবহার হয়েছে। Broken preview-এ explicit retry; replacement source আলাদা state নেয়। Decorative video play overlay pointer-events-none হয়েছে, যাতে thumbnail retry intercept না করে। Saved URLs, media order, upload/signing route বা storage অপরিবর্তিত। এটি video playback-error recovery বা সব admin media surface-এর certification নয়।

### Financial dashboard hooks

- **Admin money:** initial failure-এ settings null থাকায় loading আটকে যেত; overlapping fetch-এর পুরোনো response নতুন snapshot overwrite করত; sign-out-এর পরে pending response financial state restore করত। প্রথম run-এ 3 regression fail করেছে। Latest-request/context guards ও ready reset করা হয়েছে। New range-এর response-ও পুরোনো request থেকে সুরক্ষিত। Failed refresh-এ last verified snapshot এবং error থাকে।
- **Rider earnings:** disabled/new session-এ পুরোনো snapshot বা pending result ফিরত; 2 regression আগে fail করেছে। Disabled session clears state, request generations late response/error/finally আটকায়। Existing payout request semantics অপরিবর্তিত।

## Real PostgreSQL — নতুন যাচাই

আগে এই workflow script চালানো হয়নি। এবার repository-এর বাইরে isolated npm-installed PostgreSQL binary দিয়ে localhost-only disposable cluster চালিয়ে existing script পরীক্ষা করা হয়েছে। Production/Supabase connection ব্যবহার হয়নি।

প্রথম attempt-এ harness-এর plain PostgreSQL default privileges Supabase-এর মতো ছিল না: hardening PUBLIC EXECUTE revoke করার পরে guarded authenticated functions-ও harness-এ denied হচ্ছিল। **Production migration/grants loosen করা হয়নি।** Bootstrap-এর আগে fixture-তে Supabase-এর explicit default EXECUTE privileges বসানো হয়েছে; bootstrap hardening তারপর সেগুলো যথাযথ revoke করে। নতুন assertions anon write-RPC denial এবং authenticated service-only RPC denial-ও পরীক্ষা করে।

Final script **10 PASS groups**, exit 0:

1. Full bootstrap + hardened RPC grants।
2. Vendor permission gates, own-shop order RLS visibility, Confirm → Ready ও two invitations।
3. Two concurrent riders: one acceptance, one rejection, one owner/history entry।
4. Pickup, wrong-code rejection, delivery, COD balance, shop ledger ও duplicate delivery prevention।
5. Rider settlement claim এবং staff approval।
6. Unverified wallet payment-এ manual dispatch refusal।
7. Wrong PIN count, fifth-attempt lock, reset/success।
8. Migration health probe flags।
9. Concurrent capacity race: দুই active trip-এর limit অতিক্রম নয়।
10. Admin invitation withdrawal allowed; accepted/picked-up trip stranded নয়।

Auth UID service stubbed, SQL authenticated roles/RLS/functions বাস্তব। Publication metadata তৈরি হয়েছে; WAL logical replication/realtime subscription delivery পরীক্ষা হয়নি। Browser login/JWT issuance, actual wallet transfers, push ও physical GPS-এর বিকল্প নয়। Test database dropped এবং local database server বন্ধ হয়েছে।

## Verification results

| Check | এই pass-এর ফল |
| --- | --- |
| Full Vitest suite | **567 files / 3,846 tests passed**, exit 0, 436.33 seconds; first failed run completion evidence নয় |
| New/extended targeted regressions | **25 passed across 5 files** (checkout 6, tracking 9, media 2, admin money 5, rider money 3; separate targeted runs) |
| Browser combined run | **53/53 passed** — previous 49-check scope + 4 new real-Leaflet checkout/tracker checks, 320/1280px, English/Bengali |
| Dashboard browser run | **5/5 passed** — fixture contracts + non-intercepted unauthenticated API denials |
| Local real PostgreSQL workflow | **10 PASS groups**, exit 0 |
| Embedded SQL | Dispatch **15**, rider money **35 PASS groups**, exit 0 |
| Lint / typecheck / production build | **Passed**; final lint no warnings |
| Production dependency audit | **0 findings** |
| Full dependency audit | **8 dev-only entries: 5 high / 3 moderate / 0 critical** |

পুরো suite-এ দুই পুরোনো test assumption পাওয়া যায়: checkout pin-flow mock-এ real Leaflet-এর `.on()` event API ছিল না; account error focus assertion DOM alert আসার সঙ্গে সঙ্গেই চলত, focus effect শেষ হওয়ার জন্য অপেক্ষা করত না। Mock-কে faithful করা এবং একই focus assertion `waitFor`-এ নেওয়া হয়েছে; **6/6 affected tests passed**। কোনো test skip, count assertion removal বা timeout বৃদ্ধি করা হয়নি। New browser harness-এর initial locator implicit `<output>` status-ও ধরছিল; test-only selected-pin readout আলাদা করা হয়েছে, status/retry assertions অক্ষুণ্ণ। Intermediate failed runs completion evidence নয়।

শেষ full/browser runs-এর পরে কেবল decorative video-overlay-তে `pointer-events-none` CSS class যোগ হয়েছে। তার পরে **9/9 product-editor/media tests** এবং production build আবার passed; ওই CSS-only পরিবর্তনের পরে পুরো suite/browser set পুনরায় চালানো হয়নি।

## Remaining security work

`braces` registry latest এখনও **3.0.3**; Next ESLint latest **16.4.2**-ও `fast-glob: 3.3.1` নেয়। Capacitor CLI latest **8.5.3**। আগের [security recheck](security-recheck-2026-10-21.md)-এর glob এবং xcode/uuid chains বহাল। npm suggested Next ESLint 14.2.35 / Capacitor CLI 8.4.3 downgrade বা unvalidated uuid override প্রয়োগ হয়নি। এগুলো harmless বলা হচ্ছে না। Untrusted tooling input ও publicly exposed test/mocking services এড়িয়ে চলুন; upstream remediation monitor করতে হবে।

## Release checklist — completed local checks বনাম blocked acceptance

- [x] Scoped runtime fixes + red/green regression evidence।
- [x] Browser catalog/checkout/recovery controls এবং bilingual map checks।
- [x] Lint, typecheck, production build, SQL regression, audit review।
- [x] Local real two-session PostgreSQL workflow, selected RLS/grant gates।
- [x] Full-suite rerun confirmation: 567 files / 3,846 passed।
- [ ] Eight dev-tooling findings remediated/explicitly risk-accepted by maintainer।
- [ ] Authorized configured catalog/PDP, real remote media/image optimizer।
- [ ] Deployed Supabase roles/RLS + real customer/rider/vendor/admin sessions।
- [ ] End-to-end order/payment callbacks/notifications/GPS in approved test environment।
- [ ] Physical mobile/accessibility/slow-network acceptance ও original map incident-এর screenshot/URL match।
- [ ] Explicit deployment approval।

বর্তমান checkout-এ configured auth/catalog environment ছিল না; এই blocked checks সব সম্পন্ন বলে চিহ্নিত করা হয়নি। Automated tests passing মানে সব possible bug নেই বা production-ready certification নয়। QA server বন্ধ করে normal preview ফিরিয়ে দেওয়া হয়েছে।

### Reproduce / evidence

Existing `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:dispatch`, `npm run test:money` এবং browser configs ব্যবহার করুন। Local workflow-এর জন্য `PG_VERIFY_URL`-এ **শুধু disposable localhost PostgreSQL admin URL** দিয়ে `npm run test:workflow:postgres`; script remote host অগ্রাহ্য করে, temporary database তৈরি/drop করে। Supabase default function privileges fixture এখন script-এর অংশ। PostgreSQL binary/helper repository dependency হিসেবে যোগ হয়নি।

Workspace logs (Git নয়): `/home/user/all-update-{red,rider-red,targeted-final,geo-tests,compat-tests}.log`; `/home/user/all-update-verified-tests.log`; `/home/user/all-update-{browser,dashboard-browser,postgres,dispatch,money,final-lint,final-types,build,production-audit}.log`; `/home/user/all-update-audit-before.json`। Browser reports/traces `.cache/`-এ ignored।
