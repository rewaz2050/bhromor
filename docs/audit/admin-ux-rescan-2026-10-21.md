# অ্যাডমিন UI/UX পুনঃপরীক্ষা — ২১ অক্টোবর ২০২৬

## পরিধি ও সীমাবদ্ধতা

ব্যবহারকারীর রিপোর্ট: স্ক্রল করলে অ্যাডমিনের নোটিফিকেশন/হেডারের কাছে ভাঙা ম্যাপের ছবির মতো কিছু দেখা যায়। নির্দিষ্ট URL/স্ক্রিনশট এখনো পাওয়া যায়নি। তাই ব্যবহারকারীর দেখা ঘটনাটির সঠিক কারণ **নিশ্চিত করা হয়নি**।

এবার সোর্স পরীক্ষা করা হয়েছে: admin shell/navigation, notifications inbox, push setup, live dispatch map, shared data-error recovery এবং কয়েকটি media-preview rendering path। এটি প্রতিটি অ্যাডমিন স্ক্রিনের authenticated visual audit নয়। আগের storefront verification-কে সম্পূর্ণ admin QA হিসেবে ধরা হচ্ছে না।

বর্তমান কোডে `AdminLiveMap` ব্যবহার করে `/admin/deliveries`; `/admin/notifications` নিজে ম্যাপ রেন্ডার করে না। এটি রিপোর্ট বাতিল করার কারণ নয়—হেডারের notification icon-এর নিচে map overlap হতে পারে, অথবা অন্য কোনো ছবি/পেজ জড়িত থাকতে পারে। বাস্তব screenshot/URL প্রয়োজন।

## নিশ্চিত সমস্যা ও এই পাসে করা পরিবর্তন

| অগ্রাধিকার | প্রমাণ | পরিবর্তন / অবস্থা |
| --- | --- | --- |
| P1 | প্রথমবার map initialization-এর আগে marker effect চলে যায়; map ready হলেও effect আবার চলে না। নতুন unit test-এ আগের কোডে rider pin অনুপস্থিত, পরিবর্তনের পরে উপস্থিত। | Map ready হওয়ার পর initial pins আপডেট করা হয়; পুরোনো async update বাতিল হয়। **ঠিক করা হয়েছে।** |
| P1 | Map CSS `unpkg.com` থেকে runtime-এ লোড হয়; failure recovery নেই। | Installed Leaflet package-এর CSS সরাসরি bundle করা হয়েছে; অপ্রয়োজনীয় CDN default-icon configuration বাদ। **ঠিক করা হয়েছে।** |
| P1 | Leaflet panes/controls-এর বড় z-index-এর জন্য map card-এর নিজস্ব stacking boundary ছিল না; admin header `z-30`। | Local stacking isolation + clipping। 320px/1280px harness-এ ম্যাপ হেডারের নিচ দিয়ে স্ক্রল করিয়েও notification button clickable। **ঠিক করা হয়েছে।** বাস্তব authenticated shell-এ নির্দিষ্ট রিপোর্টটি এখনো মিলিয়ে দেখা বাকি। |
| P1 | Tile image failure-এর জন্য স্পষ্ট feedback/retry/fallback ছিল না; map initialization failure-এ loading শেষ নাও হতে পারে। | Broken-image glyph-এর বদলে neutral tile, street background না আসার সৎ বার্তা, explicit Retry map এবং initialization error recovery। **ঠিক করা হয়েছে।** |
| P2 | Container resize-এর পরে map size update ছিল একবারের raw timer; timer cleanup ছিল না। | ResizeObserver + initial animation frame, উভয়ের cleanup এবং unmount-এ map removal। **ঠিক করা হয়েছে।** |
| P2 | Leaflet-এর default zoom links প্রায় 30px desktop control। | এই map-এর zoom controls অন্তত 44×44px। **ঠিক করা হয়েছে।** |

কোনো dispatch eligibility, rider assignment, pricing, permissions বা authentication rule পরিবর্তন করা হয়নি। Map failure হলে আসল street detail দেখানো হয়েছে—এমন দাবি করা হয় না। OpenStreetMap tile server এখনো network-dependent; offline navigation যোগ করা হয়নি।

## পরবর্তী অগ্রাধিকার — পাওয়া গেছে, এই পাসে ঠিক করা হয়নি

| অগ্রাধিকার | সোর্সে পাওয়া বিষয় | প্রস্তাবিত সমাধান ও যাচাই |
| --- | --- | --- |
| P1 | `admin-gate.tsx`-এর সবুজ `Live data` badge unconditional; shared probe fail/checking হলেও label একই। | Probe-এর checked/live/error অনুযায়ী Checking / Connected / Unavailable; offline/session-expired component ও browser tests। Connection state দিয়ে authorization পরিবর্তন নয়। |
| P1 | Notifications inbox-এ error strip-এর নিচেও শূন্য cached items হলে `Nothing here` / `All caught up` দেখা যেতে পারে। | Failed load এবং সত্যিকার empty inbox আলাদা করা; stale items থাকলে সেগুলো রেখে status দেওয়া। Error/empty/loading fixtures দিয়ে যাচাই। |
| P2 | Admin header menu/notification controls `h-10 w-10`; inbox filters, Mark read এবং shared retry controls-এ consistent minimum 44px নেই। | Shared touch-target baseline; 320/360/390px-এ overflow না বাড়িয়ে পরীক্ষা। |
| P2 | White text on `gold-500` notification badges (`#ab8748`) আনুমানিক 3.34:1; rider marker white-on-green (`#22c55e`) প্রায় 2.28:1, busy amber-এ প্রায় 2.15:1। | ছোট লেখা/marker initial-এর জন্য darker fill বা dark foreground; রং ছাড়াও label; rendered contrast ও status regression tests। এগুলো token-based contrast checks, পুরো পেজের WCAG certification নয়। |
| P2 | কিছু admin media preview সরাসরি `<img>` ব্যবহার করে; সবগুলোর explicit failure fallback নেই। | Blocked/expired image fixtures দিয়ে কোন preview সত্যিই ভাঙে তা আগে দেখুন, তারপর fallback/replace action যোগ করুন। বর্তমানে কোনো নির্দিষ্ট live media URL broken বলা হচ্ছে না। |

## অ্যাপের মতো সহজ অভিজ্ঞতা: বাস্তবসম্মত পরিকল্পনা

1. আগে reliability: map, connection state, error/empty distinction এবং save/retry feedback।
2. তারপর shared shell: consistent 44px controls, দৃশ্যমান focus, একরকম toolbar/spacing এবং mobile-width verification। Navigation/grouping ইতোমধ্যে আছে—অযথা পুনর্নির্মাণ নয়।
3. Inbox ও daily-task flow: filter state অক্ষুণ্ণ রাখা, readable counts, স্পষ্ট next action; push permission সমস্যায় actionable recovery। বিদ্যমান capability যাচাই করেই পরিবর্তন।
4. Forms/media/tables: long Bengali/English text, large counts, slow network, expired session, failed images ও narrow screens-এর fixtures দিয়ে page-by-page review।
5. বড় redesign, glow/gradient বা অতিরিক্ত animation নয়; প্রয়োজন হলে ছোট shared-component পরিবর্তন, প্রতিটির regression test।

## এই পাসের যাচাই

- Initial rider-pin regression: আগের implementation-এ test **failed**, পরিবর্তনের পরে **passed**।
- **৪১টি test file / ২৩৬টি unit/component test passed**: admin components/pages, existing tracker map এবং marker tests সহ। নতুন map-specific tests: **৫টি**। পুরো repository suite এই পাসে আবার চালানো হয়নি।
- **২/২ browser harness checks passed**, 320px এবং 1280px: real Leaflet, bundled CSS, simulated failed/successful tiles, first pins, explicit retry, কোনো broken tile image নয়, 44px zoom controls, horizontal overflow নয়, scroll-এর পরে sticky header hit-testing এবং notification button click।
- Browser harness আলাদা intercepted HTML document; production route বা auth bypass যোগ করা হয়নি। Map tiles, rider ও header synthetic; authenticated admin dashboard, real push delivery, real rider GPS বা OpenStreetMap connectivity যাচাইয়ের দাবি নয়।
- Lint, TypeScript এবং production build **passed**। Mobile harness screenshot দেখা হয়েছে।
- বাস্তব সমস্যার confirmation-এর জন্য ব্যবহারকারীর URL/স্ক্রিনশট, অনুমোদিত admin session এবং সম্ভব হলে একই ফোন/browser-এ পুনঃপরীক্ষা বাকি। কোনো deployment করা হয়নি।

## পরবর্তী পাস — session/inbox recovery ও shared controls

উপরের “পরবর্তী অগ্রাধিকার” তালিকার প্রথম দুইটি P1 এবং নির্দিষ্ট কয়েকটি P2 এই পাসে বাস্তবায়ন করা হয়েছে:

- **Header status:** unconditional “Live data” বাদ। Probe চললে “Checking session”, সফল হলে “Session verified”, না হলে “Session unavailable”। এটি session probe-এর ফল—সব endpoint সুস্থ বা ডেটা সর্বক্ষণ fresh, এমন নিশ্চয়তা নয়। Status ছোট title-এর নিচে থাকে, যাতে ফোনে বড় label হেডার ভেঙে না দেয়।
- **Inbox recovery:** initial session check, request failure, empty inbox এবং retained notices আলাদা। Initial fetch fail হলেও hook-এর loading flag true থাকতে পারে; UI এখন error-কে আগে দেখায়, তাই অনন্ত spinner নয়। ব্যর্থ update-এর পরে cached notices থাকলে warning সহ থাকে; শূন্য filtered rows থাকলে “All caught up” বলা হয় না। Retry-তে নির্বাচিত filter বজায় থাকে।
- **সঠিক retry:** notification hook কেবল নিজের probe metadata ও retry প্রকাশ করে। Session error হলে সেই owning probe retry হয়; inbox error হলে inbox reload। Auth/session rules বা API fetch/write logic বদলানো হয়নি।
- **Touch targets:** header menu/search/notification, inbox filters/Mark read/Mark all read এবং shared error Retry/Dismiss-এ minimum 44px target। সব admin control-এর exhaustive audit সম্পন্ন—এমন দাবি নয়।
- **Contrast:** header/inbox unread badge-এ darker gold; timestamp-এর অপ্রয়োজনীয় opacity বাদ। Bright green/amber rider pin-এ dark initial, stale white pin-এও dark initial; offline pin-এর white initial রাখা হয়েছে। Status fill colors, stale cutoff এবং dispatch behavior অপরিবর্তিত। Marker-এর প্রত্যেক non-text border/accessible name সমস্যা মিটেছে—এমন দাবি নয়।

### যাচাই

- **৪৩টি file / ২৪৮টি targeted test passed**: admin components/pages, session metadata ownership, inbox states/filter retention, header states, marker markup এবং existing tracker map সহ। আগের ২৩৬ সংখ্যাটি আগের পাসের ফল; নতুন ফল দিয়ে সেটিকে যোগ করা হয়নি। পুরো repository suite এই পাসে আবার চালানো হয়নি।
- **৫/৫ combined admin browser harness checks passed**: নতুন inbox/shell checks 320px, 390px ও 1280px; আগের map checks 320px ও 1280px। নতুন checks আসল AdminGate ও NotificationsPage render করে; শুধু test adapters দিয়ে auth, router, data ও image component সরবরাহ করে। কোনো production auth bypass/fixture route নেই।
- Browser-এ checking → session failure → session retry → inbox failure → filtered retry → notices → mark-all-read → failed update → retained notices পরীক্ষা করা হয়েছে। Header/main scoped Axe, control dimensions এবং document overflow checks পাস। এটি full-page WCAG certification নয়; sidebar/real push permission/real login এর অংশ নয়।
- 320px screenshot দেখে header, wrapped filters, retry banner ও retained notice পাঠযোগ্যতা পর্যালোচনা করা হয়েছে।
- Lint, TypeScript, production build এবং diff check পাস।

### এখনও বাকি

ব্যবহারকারীর নির্দিষ্ট broken-map screenshot/URL-এর সঙ্গে মিলিয়ে দেখা; authorised live admin session; real push/GPS/backend flow; অন্য media previews-এর failed-image fixtures; বাকি admin forms/tables, sidebar ও control sizes; physical Android/TalkBack QA। “Needs attention” summary-এর প্রত্যেক upstream endpoint-এর freshness এই inbox patch দিয়ে প্রমাণিত নয়। আগের development-tooling security findings-ও এই UI patch-এর কাজ নয়। কিছুই deploy করা হয়নি।
