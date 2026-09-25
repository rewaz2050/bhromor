# Dashboard ও workflow verification

**তারিখ:** ২৫ সেপ্টেম্বর ২০২৬  
**ফলাফল:** স্থানীয় verification পাস; production verification এখনো বাকি।

## পরীক্ষার ফলাফল

| পরীক্ষা | ফলাফল | কীভাবে পরীক্ষা হয়েছে |
|---|---|---|
| User dashboard | PASS | Chromium-এ profile নাম সেভ, dashboard-এ নতুন নাম, read-only login phone, mobile layout |
| Rider dashboard | PASS | Chromium-এ profile সেভ, request গ্রহণ, pickup button, গ্রহণের আগে customer call লুকানো |
| Shop dashboard | PASS | Chromium-এ profile সেভ, Confirm → Ready action, order queue |
| Admin dashboard | PASS | একই অর্ডারের ২টি request-কে ২টি order না দেখানো; requesting order ও invitation count পৃথক |
| API access gates | PASS | mock ছাড়া signed-out profile/shop/admin API requests 401 |
| Fresh database setup | PASS, after repair | প্রকৃত PostgreSQL 18.4-এ সম্পূর্ণ `bootstrap-fresh.sql` চালানো |
| Shop permission | PASS | অন্য account অর্ডার confirm করতে পারে না; Shop সরাসরি delivered করতে পারে না |
| Area broadcast | PASS | Shop Ready করলে এলাকার দুই eligible rider-এর invitation তৈরি |
| দুই Rider একসঙ্গে Accept | PASS | দুটি পৃথক PostgreSQL connection; common order lock ছেড়ে দুটিকে প্রতিযোগিতা করতে দেওয়া; একজন সফল, একজন প্রত্যাখ্যাত |
| Ownership consistency | PASS | অর্ডারের rider_id, accepted assignment ও history একই বিজয়ীকে নির্দেশ করে |
| Rider capacity race | PASS | একই Rider-এর দুই concurrent acceptance-এ ২টি active trip-এর সীমা অতিক্রম করে না |
| Pickup ও delivery code | PASS | অন্য Rider pickup করতে পারে না; pickup-এর আগে delivery ও ভুল code প্রত্যাখ্যাত |
| Delivery ও হিসাব | PASS | order delivered, rider cash +৳100, load মুক্ত, shop ledger-এ একবার entry; duplicate delivery-তে cash দ্বিগুণ হয় না |
| Admin cancellation guard | PASS | pending invitation withdraw করা যায়; accepted/picked-up trip এই action দিয়ে বাতিল করা যায় না |
| Withdraw বনাম decline | PASS (PGlite) | withdraw ৫ মিনিট cool-down-এর পর আবার offer পায়; decline কখনোই পায় না; manual request lapse হলে এলাকায় তৎক্ষণাৎ resume |
| Settle claim | PASS (PGlite + PG) | rider Settle-এ claim file হয়, cash অপরিবর্তিত; staff Approve-এ পুরো balance settle, Reject-এ balance থাকে |
| PIN lockout | PASS (PGlite + PG) | ৫টি ভুল code-এ ১৫ মিনিট lock; সঠিক code-এও lock খোলে না; মেয়াদ শেষে সঠিক code-এ delivery ও counter reset |
| Wallet gate | PASS (PGlite + PG) | unverified bKash/Nagad order-এ manual dispatch ০ ফেরায়; verify-first 422 |
| Sweep throttle + health probe | PASS (PGlite + PG) | পরপর দুটি unforced sweep-এ দ্বিতীয়টি no-op; probe `broadcast_resume_ok/settle_claims_ok/pin_lockout_ok` true দেখায় |
| Automated suite | PASS | ১৮৯টি test file, ১,২৫৮টি test |
| Build / TypeScript / lint | PASS | production build, typecheck ও ESLint |

### পরীক্ষার সীমা—গুরুত্বপূর্ণ

- Browser-এর positive dashboard tests-এ **API fixture responses** ব্যবহার হয়েছে। এগুলো UI interaction ও request contract পরীক্ষা করে; live database-এ profile সেভ হয়েছে—এমন প্রমাণ নয়।
- SQL workflow পরীক্ষায় **প্রকৃত PostgreSQL**, সম্পূর্ণ app schema এবং প্রকৃত workflow functions ব্যবহার হয়েছে। Supabase Auth-এর পরিবর্তে পরীক্ষার identity stub ব্যবহার করা হয়েছে। নতুন order row পরীক্ষার fixture হিসেবে insert হয়েছে—live checkout API/payment gateway দিয়ে নয়।
- এই workspace-এ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` এবং `DATABASE_URL` অনুপস্থিত। কোনো production data পরিবর্তন বা migration প্রয়োগ করা হয়নি।
- Live signup/login, production migration state, actual checkout-to-delivery, payment gateway, background push, external maps এবং deployment-এর browser cookies এখনো production-এ যাচাই হয়নি।

## যে সমস্যাগুলো পাওয়া ও ঠিক করা হয়েছে

### ১. Fresh setup-এ Confirm → Ready ব্যর্থ হচ্ছিল

`bootstrap-fresh.sql`-এ `202609170001_two_tap_order_flow.sql` ছিল না। Shop UI সরাসরি Ready পাঠালেও database `illegal transition confirmed -> ready-for-pickup` দিচ্ছিল।

**সংশোধন:** bootstrap-এ বাদ যাওয়া migration যুক্ত এবং paste-parts পুনরায় তৈরি। একই full-schema PostgreSQL test এরপর পাস করেছে।

### ২. Admin-এর Cancel delivery আটকে দিতে পারত

পুরোনো function accepted বা picked-up assignment-ও cancelled করত, কিন্তু order-এর assigned state/rider pointer পরিষ্কার করত না। এটি parcel ও হিসাবের অসামঞ্জস্য ঘটাতে পারত।

**সংশোধন:** `202609250002_dispatch_cancel_guard.sql` যোগ হয়েছে। Board-এর Cancel ও backend function এখন শুধু pending invitation withdraw করে। Accepted/picked-up trip পরিবর্তনের জন্য আলাদা controlled recovery flow প্রয়োজন—এই shortcut ব্যবহার করা যাবে না।

### ৩. Shop button-এর ভাষা পুরোনো ছিল

`Ready — call rider` পরিবর্তন করে `Ready — request riders` করা হয়েছে, যাতে auto-request থাকলেও দোকানকে ফোন করতে হবে—এমন ধারণা না হয়।

### ৪. P0 audit fix (একই দিনের follow-up)

E2E audit-এ পাওয়া সমস্যাগুলো ঠিক করা হয়েছে: (ক) manual request lapse হলে area broadcast আর resume হতো না — এখন তৎক্ষণাৎ resume হয়; withdraw ও decline আলাদা (`cancelled_by`); (খ) প্রতিটি rider poll-এ full-table sweep চলত — এখন 10s throttle + force flag; (গ) rider Settle tap-এ নিজেই cash zero করতে পারত — এখন staff-approved claim; (ঘ) delivery PIN-এ brute-force guard ছিল না — এখন 5 ভুল code-এ 15 মিনিট lock (দুই ধাপ: `ps_rider_deliver_check` তারপর `ps_rider_deliver`, কারণ RAISE হলে counter rollback হয়ে যেত); (ঙ) manual dispatch unverified wallet order পাঠাতে পারত — এখন refused। নতুন migration: `202609250003…006` (+ `diagnose.sql` row 37–37g, `/api/health` বাংলা nextSteps)।

## Live চালুর আগে

সুরক্ষিত deployment/environment settings-এ Supabase configuration যুক্ত করতে হবে; chat-এ secret পাঠানোর প্রয়োজন নেই। বিদ্যমান database-এর আগের migration-গুলো প্রয়োগ করা থাকলে নিচের ফাইলগুলো ক্রমমতো নিশ্চিত করুন:

1. `supabase/migrations/202609170001_two_tap_order_flow.sql` — আগে বাদ পড়ে থাকলে।
2. `supabase/migrations/202609250001_area_broadcast_dispatch.sql`
3. `supabase/migrations/202609250002_dispatch_cancel_guard.sql`
4. `supabase/migrations/202609250003_dispatch_withdraw_resume.sql`
5. `supabase/migrations/202609250004_settle_claims.sql`
6. `supabase/migrations/202609250005_delivery_pin_lockout.sql`
7. `supabase/migrations/202609250006_dispatch_health.sql`

বিদ্যমান database-এ পুরো bootstrap চালাবেন না। তারপর staging/test accounts দিয়ে actual Customer checkout → Shop Ready → দুই Rider Accept → বিজয়ীর delivery → চার dashboard-এর status/হিসাব মিলিয়ে দেখতে হবে।

## পুনরায় পরীক্ষার command

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:dispatch
npm run test:dashboards
PG_VERIFY_URL=postgres://<local-test-user>@localhost:<port>/postgres npm run test:workflow:postgres
```

- `test:dashboards` আলাদা fixture configuration ব্যবহার করে; Playwright Chromium install থাকা প্রয়োজন। `CHROMIUM_EXECUTABLE_PATH` দিয়ে existing compatible Chromium দেওয়া যায়। Test server শুরু করতে process tool/terminal ব্যবহার করুন।
- এই sandbox-এ CDN download blocked ছিল; npm-delivered Chromium ও তার bundled libraries দিয়ে browser tests চালানো হয়েছে।
- `test:workflow:postgres` শুধু localhost database গ্রহণ করে, একটি নতুন disposable database বানায় এবং শেষে সেটি মুছে ফেলে। Local PostgreSQL user-এর database create permission প্রয়োজন।
- Test database ও fixture preview বন্ধ করা হয়েছে। সাধারণ production-build preview আলাদা, live Supabase ছাড়া।
