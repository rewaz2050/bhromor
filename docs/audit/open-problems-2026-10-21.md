# নতুন read-only audit — খোলা সমস্যার তালিকা

২১ অক্টোবর ২০২৬ · branch `arena/bcb37d54-bhromor`। ব্যবহারকারীর নির্দেশ: আরও সমস্যা খুঁজে তালিকা দেওয়া, এখন fix নয়। **Application code/config/package manifest/lockfile বদলানো হয়নি।** আগের uncommitted কাজ অক্ষুণ্ণ। এই report-ই নতুন deliverable।

> **পরবর্তী আপডেট — ২২ অক্টোবর:** ব্যবহারকারীর অনুমোদনে O01–O04 এবং পরে O05–O12-এর local remediation হয়েছে। প্রমাণ ও acceptance সীমা: [Admin orders recovery](orders-recovery-2026-10-22.md) এবং [Remaining audit remediation](remaining-recovery-2026-10-22.md)। নিচের finding register মূল read-only audit-এর ঐতিহাসিক snapshot, বর্তমান open-status তালিকা নয়। **S01 development-dependency findings এখনো খোলা**; production/device acceptance-ও বাকি।

## সারসংক্ষেপ ও প্রমাণের অর্থ

- **12টি নতুন আচরণগত finding**, **15টি diagnostic scenario** দিয়ে বর্তমান code-এ পুনরুৎপাদন হয়েছে। একটি finding-এর একাধিক scenario আছে।
- 6টি scratch test file-এ probes চালানো হয়েছে। এগুলো ইচ্ছাকৃতভাবে **বর্তমান ভুল আচরণ assert করে**, তাই তাদের 15 pass মানে সমস্যা পুনরুৎপাদিত হয়েছে—application healthy বা fix সম্পন্ন নয়।
- Reproduction-এ controlled API responses, delayed promises, React hooks/jsdom এবং একটি rendered money page ব্যবহৃত। Live customer/staff credentials বা production writes ব্যবহার হয়নি।
- Context-switch findings একই mounted hook/component-এ session/query/order বদলানোর শর্তে প্রমাণিত। Real navigation যদি component remount করে, সেই নির্দিষ্ট path-এ সমস্যা নাও দেখা যেতে পারে। এগুলোকে observed live privacy breach, backend authorization bypass বা unauthorized database access বলা হচ্ছে না।
- Priority: **P1 = আগে ঠিক করা উচিত**, **P2 = পরের গুরুত্বপূর্ণ batch**। এগুলো product/engineering priority, npm/CVSS severity নয়।

## নিশ্চিত finding register

### O01 · P1 — Admin orders: initial failure-এ loading আটকে যায়

**Location:** `src/lib/use-orders.ts:86–96,117–121,163–169`; consumer `src/app/admin/orders/page.tsx:147`।

**Reproduce:** প্রথম orders GET reject → hook-এ `error = Offline`, কিন্তু `loading = true` থাকে। Page loading branch আগে return করে, তাই error/retry controls skeleton-এর আড়ালে পড়ে।

**কারণ:** Failure-এ `liveOrders` null থাকে; loading null snapshot দিয়েই নির্ধারিত।

**Fix direction:** Request-completion state আলাদা করা; failed first read ও retry/dismiss recovery regression।

### O02 · P1 — Admin orders: search/filter ও pagination-এর response মিশে যায়

**Location:** `src/lib/use-orders.ts:82–115`।

**দুইটি reproduction:**
1. পুরোনো search A pending → search B-এর response NEW দেখায় → পরে A resolves → NEW-এর জায়গায় OLD আসে।
2. A-তে Load older শুরু → query B loads → A-এর older page এসে B-এর list-এ append হয়: `[NEW-1, OLD-2]`।

**প্রভাব:** Selected search/shop filter এবং displayed order rows অসঙ্গত হতে পারে; operator ভুল row দেখে সিদ্ধান্ত নিতে পারেন। Backend filter/RLS bypass প্রমাণ নয়।

**Fix direction:** Query/shop/session generation guard; pagination commit-ও একই context-এ সীমাবদ্ধ।

### O03 · P1 — Admin orders: আগের session-এর orders ফিরে আসে

**Location:** `src/lib/use-orders.ts:117–121,163–169`।

**Reproduce:** A session-এর orders load → live false হলে returned array empty → live true, নতুন request pending → A-এর rows আবার দেখা যায় এবং loading false।

**কারণ:** Returned rows live দিয়ে mask করা হয়, কিন্তু backing snapshot/cursor/session state reset হয় না।

**Fix direction:** Session-scoped cache/reset এবং late-response invalidation। একই mounted hook-এ enable transition প্রমাণিত; deployed account-switch flow আলাদাভাবে verify করতে হবে।

### O04 · P1 — Admin order detail: পুরোনো 404 নতুন valid order লুকিয়ে দেয়

**Location:** `src/lib/use-orders.ts:187–224` (`useOrder` detail fallback)।

**Reproduce:** A detail request pending → B detail successfully loads → A-এর delayed 404 আসে → B-এর fetched snapshot clear হয়, returned order undefined, loading false।

**প্রভাব:** Valid current order unavailable/not-found হিসেবে দেখা যেতে পারে। `fetched.id === orderNo` guard success payload mismatch ঠেকালেও stale error mutation ঠেকায় না।

**Fix direction:** Detail request identity/session guard; missing/error state প্রতি order-এর সঙ্গে key করা।

### O05 · P1 — Vendor detail: ID বদলালেও পুরোনো order রেখে দেয়

**Location:** `src/lib/use-vendor.ts:192–215,286–312`; consumer `src/app/vendor/orders/[id]/page.tsx:85–100,140–156`।

**Reproduce:** ORDER-A loaded → একই hook-এ ID ORDER-B → B request pending → returned order এখনও A, loading false।

**প্রভাব:** Hook reuse হলে displayed order এবং current action endpoint-এর ID আলাদা হতে পারে: `advance` নতুন `orderNo` ধরে, UI পুরোনো `order` দেখায়। **কোনো ভুল production mutation করা হয়নি**; mutation mismatch live workflow-তে verify করা বাকি।

**Fix direction:** Resource path-keyed data; নতুন ID-তে old detail mask/reset এবং explicit loading।

### O06 · P1 — Vendor resources: disable/new-session-এ আগের earnings থেকে যায়

**Location:** `src/lib/use-vendor.ts:192–229,430–436`।

**Reproduce:** Earnings A loaded → enabled false → old earnings still returned → enabled true, new request pending → old earnings থাকে, loading false।

**কারণ:** Effect পুরোনো pending request cancel flag দিয়ে আটকায়, কিন্তু committed data/error/loading identity reset করে না। Shared helper orders/products/earnings-সহ একাধিক resource-এ ব্যবহৃত; **earnings case সরাসরি tested**, প্রতিটি caller আলাদা করে rendered QA হয়নি।

**Fix direction:** Enable/session/path boundary-তে resource state reset/key; পুরোনো data আর current-session data আলাদা করা।

### O07 · P1 — Rider stats/rating: previous-session data পরিষ্কার হয় না

**Location:** `src/lib/use-rider.ts:387–416`; `src/lib/use-rider-rating.ts:8–28`।

**তিনটি reproduction:**
- Stats loaded → disable/re-enable → আগের stats/earningsBalance থেকে যায়।
- Stats GET pending → disable → delayed response তারপরও stats commit করে।
- Rating summary loaded → disable → আগের summary returned হয়।

**প্রভাব:** একই mounted hook-এ অন্য rider/session-এর fresh data আসার আগে পুরোনো scoreboard/financial decoration থাকতে পারে। Actual unauthorized network read বা cross-account API access প্রমাণ নয়।

**Fix direction:** Session/identity reset, generation guard; disabled loading state-ও পরীক্ষা।

### O08 · P2 — Tracking: order বদলালে পুরোনো GPS/channel state বহাল

**Location:** `src/lib/use-live-rider-position.ts:62–76,80–101,112–147`।

**Reproduce:** A-এর fix timestamp 12:00/channel A → একই mounted hook-এ order B, যার সর্বশেষ fix 11:59/channel B → B-এর fix timestamp guard-এ dropped; A-এর coordinate থাকে। Channel `prev ?? new` হওয়ায় শেষ subscription-ও A।

**প্রভাব:** Context reuse হলে current order-এর বদলে old received position/channel ধরে রাখতে পারে। Tracking endpoint permission breach বা original live map incident reproduce হয়েছে—এমন দাবি নয়।

**Fix direction:** order/phone/token identity-তে rider/channel/timestamp reset ও old HTTP/broadcast completion guard।

### O09 · P2 — Tracking validation `(0,0)` গ্রহণ করছে

**Location:** `src/lib/use-live-rider-position.ts:38–45`।

**Reproduce:** `asFix({lat:0,lng:0})` → `{lat:0,lng:0}`, যদিও function contract বলে null-island reject করবে। অন্য map helper `asMapPoint` সেটি reject করে—তাই সব map অবশ্যই Africa দেখাবে বলা হচ্ছে না; hook ও downstream UI-তে validation অসঙ্গতি নিশ্চিত।

**Fix direction:** Shared coordinate validity policy, `(0,0)` এবং freshness regression।

### O10 · P1 — Checkout map GPS বাইরের location-কে ভুয়া boundary pin বানায়

**Location:** `src/components/checkout/map-pin-picker.tsx:183–206`; বিপরীত সঠিক handling `src/components/checkout/checkout-view.tsx:1617–1642`।

**Reproduce:** Browser location `{lat:23.8,lng:90.4}` → map-এর “Use my location” → `onChange`-এ Sunamganj south/west boundary coordinates যায়, actual coordinates নয়; outside-area warning নেই।

**গুরুত্বপূর্ণ অসঙ্গতি:** Checkout-এর মূল GPS control স্পষ্টভাবে outside-area note দেখায় এবং clamp করে না; map-এর ভেতরের GPS control clamp করে।

**প্রভাব:** ব্যবহারকারী নিজের location বেছে নিয়েছেন মনে করলেও delivery pin/distance/zone inference অন্য জায়গার হতে পারে। Actual wrong delivery/order charge ঘটেছে—এমন live incident claim নয়।

**Fix direction:** একই outside-service-area handling; real location silently rewrite নয়। Service-area/pricing policy বদলানোর আগে existing rules অক্ষুণ্ণ রেখে UX behavior align করতে হবে।

### O11 · P2 — Money dashboard network failure-কে missing backend বলে

**Location:** `src/app/admin/money/page.tsx:206–225`।

**Rendered reproduction:** `live=true`, `loading=false`, first GET network error, ready false/summary null → page একইসঙ্গে `Network offline` এবং **“Rider money backend is not installed yet”** দেখায়। ওই branch-এ Retry button নেই।

**প্রভাব:** Migration installed কি না জানা ছাড়াই operator-কে SQL migration চালাতে বলা হয়; transient failure recovery দুর্বল।

**Fix direction:** Network/auth/initial unknown state বনাম server-confirmed missing schema আলাদা; explicit retry। এটি hook-এর loading fix-এর বাইরের page-level defect।

### O12 · P2 — Money period বদলে ব্যর্থ হলে পুরোনো period-এর totals নতুন tab-এ থাকে

**Location:** `src/lib/use-admin-money.ts:70–114`; `src/app/admin/money/page.tsx:254–276`।

**Reproduce:** 30-day P&L commission 3000 loaded → 7-day select → নতুন request fails → selected range `7d`, commission এখনও 3000, loading false, error “New range offline”।

**প্রভাব:** Last-good data রাখা নিজে ভুল নয়; কিন্তু data কোন period-এর সেটি key/label না করায় selected tab ও totals আলাদা হয়ে যায়। Error banner থাকলেও পুরোনো range-এর provenance দেখায় না। Calculation/backend ledger ভুল হয়েছে এমন দাবি নয়।

**Fix direction:** P&L range-keyed result বা explicit stale/from-30d label; pending/failed range transition আলাদা।

## S01 · আগে থেকেই খোলা development dependency security findings

Fresh `npm audit --json`: **8 affected-package entries — 5 high, 3 moderate, 0 critical**। Fresh `npm audit --omit=dev`: **0 vulnerabilities**। এটি আগের known debt, নতুন 12 behavior findings-এর মধ্যে গণনা নয়।

- Next ESLint → fast-glob → micromatch → braces: 5 high entries।
- Capacitor CLI → xcode → uuid: 3 moderate entries।

আটটি entry মানে আটটি আলাদা confirmed exploit নয়। Dev-only-কে harmless বলা হচ্ছে না, আবার production application vulnerability হিসেবেও দেখানো হচ্ছে না। এই audit-এ dependency fix/downgrade করা হয়নি।

## যাচাই বাকি — এখনই confirmed bug বলা হচ্ছে না

1. Same-component session/order reuse-এর real navigation reproduction; কোন layouts/page remount করে এবং কোন consumer পুরোনো returned state লুকিয়ে রাখে, তা browser দিয়ে আলাদা যাচাই।
2. Request খুব দীর্ঘ সময় pending থাকলে `usePoll` latch এবং upload/compression busy-state recovery; bounded timeout/cancel policy audit বাকি। Pending deduplication থাকাই bug নয়।
3. Read guards-এর বাইরে in-flight mutation completion/new-session error/busy state lifecycle। Source patterns আছে, কিন্তু এই pass-এ নির্দিষ্ট production defect প্রমাণ করা হয়নি।
4. Deployed authenticated roles/RLS, wallet/payment callbacks, notification delivery, physical rider GPS, configured SSR catalog/media এবং device/network behavior। আগের local PostgreSQL/fixture evidence এর বিকল্প নয়।
5. Original scrolling/map/image incident-এর screenshot, exact URL, viewport ও state এখনও নেই; O08/O09/O10-কে সেই একই incident বলে চিহ্নিত করা হচ্ছে না।

## Audit scope, commands ও সংরক্ষণ

- Selected source review: admin orders/detail/money; vendor resource/detail/earnings; rider stats/rating; live tracking; checkout GPS/map; selected admin/vendor/rider API wrappers, settlement role gate ও server-side order validation entry point। **প্রতিটি line/API/workflow exhaustive audit নয়।** Selected authorization code দেখে নতুন permission-bypass finding ঘোষণা করা হয়নি।
- Existing 569-file/3,861-test pass আগের কাজের historical evidence; নতুন scenarios ওই suite-এ ছিল না। এই audit-এ নতুন full-suite completion দাবি নেই। একটি unfiltered run diagnostic scope-এর বাইরে চলায় বন্ধ করা হয়েছে; completion evidence নয়।
- Scratch diagnostics `.cache/problem-audit/`-এ ignored: application/test suite-এর স্থায়ী source পরিবর্তন নয়। Local rerun: `npx vitest run --config .cache/problem-audit/vitest.config.ts .cache/problem-audit`। Scratch cache future checkout-এ নাও থাকতে পারে; উপরের reproduction steps-ই durable specification।
- Focused log: `/home/user/problem-audit-focused.log`; audit JSON: `/home/user/problem-audit-dependencies.json`।
- Source পরিবর্তনের আগের/পরের Git status তালিকা একই ছিল; কেবল এই report নতুন যোগ হচ্ছে। No deploy/push, no live data writes, no fixes applied।

**প্রস্তাবিত remediation order:** O01–O04 admin order integrity/session → O05–O07 vendor/rider identity → O10 checkout GPS → O08/O09 tracking → O11/O12 money state/UX; S01-এর compatible upstream remediation আলাদাভাবে। প্রতিটি fix-এ এই নতুন scenario regression হিসেবে স্থায়ী suite-এ যোগ করতে হবে।
