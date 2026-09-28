# রিপোর্ট — দোকান সার্ভিস উন্নয়ন (এক-এক করে) · ২৮ সেপ্টেম্বর ২০২৬

**প্ল্যান:** `docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md` (আপনার অনুমোদিত: “একটা একটা করে সব”)
**শাখা:** `arena/01a0e3b1-bhromor`
**মূল কমিট:** `b9ab758` — A1–A6 + B1 একসাথে, আর আগের ফিক্স-রাউন্ড কমিটের (`b81ad7c`) ঠিক উপরে বসানো (তাই `main`-এ মার্জ করা সহজ)। **পুরো স্যুট:** ৩১৬ ফাইল / ১৯৫৮ টেস্ট সবুজ, `tsc` ও `eslint --max-warnings=0` পরিষ্কার।
**নিয়ম:** প্রতি আইটেম = কোড + টেস্ট + এই রিপোর্টে এন্ট্রি; সব শেষে একবার পুরো স্যুট।

প্রতিটি ধাপে যা যাচাই হয়: `npx tsc --noEmit` পরিষ্কার, `npx eslint <ফাইলগুলো>` ০ error/০ warning, সংশ্লিষ্ট `npx vitest run` সবুজ।

---

## ✅ A1 · দোকান খোঁজা ও সাজানো (`/shops`) — সম্পন্ন

- **নতুন pure মডিউল:** `src/lib/shop-directory.ts` — সার্চ (`shopMatchesQuery`), সাজানো (`sortShops`), কোন দোকানে কী ক্যাটাগরি আছে (`shopStockedCategories`), চিপ-তালিকা (`directoryCategories`), আর এক কলে পুরো উত্তর (`filterShopsForDirectory` → `{ shops, hiddenByZone }`)।
- **UI:** `src/components/shop/shops-directory.tsx` — সার্চ বক্স, ৪টি সাজানোর বোতাম (`recommended` / `top rated` / `biggest shelf` / `A–Z`), শুধু-থাকা-ক্যাটাগরির চিপ, “{zone}-এ ডেলিভারি দেয়” টগল (এলাকা না বাছলে নিষ্ক্রিয়), ফলাফল গণনা (`shops-count`) এবং খালি অবস্থায় এক ট্যাপে ফিল্টার মুছার বোতাম (`shops-empty`)।
- **ডেটা:** `src/app/(site)/shops/page.tsx` এখন `categories` ও পুরো ক্যাটালগ (`catalog`) পাঠায়; ক্যাটাগরি লেবেল ভেন্ডর-সাইড `categoryLabel` দিয়ে ভাষা-অনুযায়ী।
- **টেক্সট:** `src/lib/translations.ts`-এ `shops.*` ১১টি নতুন কী (en + bn), এবং “সব পণ্য” চিপ আগের `shopBrowser.allProducts` পুনর্ব্যবহার করে।
- **সততা:** ০ রিভিউওয়ালা দোকান “Top rated”-এ সবার নিচে (০ রেটিং = ৫ নয়); “আমার এলাকায়” টগল কখনো চুপচাপ দোকান লুকায় না — কতটি লুকালো তা লেখা থাকে; ক্যাটাগরি নেই এমন দোকান ফিল্টারে হারায় না।
- **টেস্ট:** `src/lib/__tests__/shop-directory.test.ts` ৯টি + `src/components/shop/__tests__/shops-directory.test.tsx`-এ ৫টি নতুন A1 টেস্ট (মোট ফাইল দুটিতে ১৮টি সবুজ)।

## ✅ A2 · ভেন্ডর ড্যাশবোর্ডে “সার্ভিস স্কোর” কার্ড — সম্পন্ন

- **pure গণিত:** `src/lib/vendor-dashboard.ts` — `SERVICE_WINDOW_DAYS = 7`, `shopDispatchAt()` (টাইমলাইনের প্রথম পাঠানোর চিহ্ন), `serviceScore(orders, {now, windowMs, prepMinutes})` → `placed / cancelled / fulfilmentRate / dispatched / medianDispatchMinutes / onTimeRate / returns / refunded`। রিটার্ন-পিকআপ কখনো “বিক্রি” হিসেবে গোনা হয় না; অর্ডার না থাকলে ফলাফল `null` (ভুয়া ০% নয়)।
- **কার্ড:** `src/components/vendor/service-score-card.tsx` — তিনটি সংখ্যা (উত্তর দিয়ে রেখেছেন %, গড় কত মিনিটে পাঠিয়েছেন, নিজের প্রস্তুতির সময়ের ভেতরে %), আর রিটার্ন থাকলে সেই লাইন; প্রস্তুতির সময় সেট না থাকলে “Set a prep time” লিংক।
- **ড্যাশবোর্ড:** `src/app/vendor/page.tsx` — ইতিমধ্যে লোড হওয়া অর্ডার থেকেই স্কোর, `Restock soon` কার্ডের ঠিক উপরে বসানো।
- **টেস্ট:** `src/components/vendor/__tests__/service-score-card.test.tsx` ৪টি নতুন + `src/lib/__tests__/vendor-dashboard.test.ts`-এ ৫টি নতুন (একত্রে ৩ ফাইল / ১৮টি সবুজ)।

## ✅ A3 · “একই রকম আরেকটা” (প্রোডাক্ট কপি) — সম্পন্ন

- **pure মডিউল:** `src/lib/product-clone.ts` — `copyName()`, `nextFreeSpelling()` (base → base-2 → base-3 …), `duplicateDraft(product, context, {id})`।
- **নিরাপত্তার নিয়ম:** কপিটা **draft** হয়ে জন্মায় (পুরোনো ছবি নিয়ে নিজে থেকে লাইভ হবে না); featured/isNew/unitsSold/rating কপিতে যায় না; slug `${slug}-copy`, SKU `${sku}-C` — দোকানে আগেই কপি থাকলে `-2`; মিডিয়া/সাইজ/ডিটেইল আলাদা করে কপি হয়, তাই কপি এডিট করলে আসলটা বদলায় না।
- **হুক:** `src/lib/use-vendor.ts` — নতুন `createProduct(product)` (POST করে সার্ভারের বানানো রো ফেরত দেয়, কারণ id সার্ভারই তৈরি করে)।
- **UI:** `src/components/vendor/duplicate-product-button.tsx` — প্রতি সারিতে “Duplicate”; এক ট্যাপে কপি সেভ হয়ে **সরাসরি কপির এডিটরে** নিয়ে যায়, ব্যর্থ হলে আসল কারণ স্ক্রিনে দেখায়; `/vendor/products` লিস্টে ক্লোন-কনটেক্সট (বর্তমান slug/SKU তালিকা) সহ বসানো।
- **টেস্ট:** `src/lib/__tests__/product-clone.test.ts` ৬টি + `src/components/vendor/__tests__/duplicate-product-button.test.tsx` ২টি (একত্রে ৮টি নতুন সবুজ)।

## ✅ A4 · Bulk দাম ও স্টক — সম্পন্ন

- **pure মডিউল:** `src/lib/bulk-edits.ts` — `planBulkEdit(products, {price, stock})` → `{changes, summary, skipped, unchanged}` + `summaryLines()`; দামের সীমা `MIN_PRICE_PAISA = ৳1`।
- **নিয়ম (টেস্টে পিন করা):** শতাংশ কাটলে দাম কখনো ৳১-এর নিচে যায় না; যে সারিতে কিছুই বদলাচ্ছে না সেটি “সেভ” হয় না (আলাদা করে গোনা হয়); per-size গ্রিড থাকা পণ্যে “total” দিলে সেটি বাদ পড়ে কারণ লেখা থাকে — বানানো কোনো ভাগ বসানো হয় না; “each size” সব সাইজ একই সংখ্যায় ভরে মোট ঠিক গুণফলে বসায়; “sold out” মোট + প্রতিটি সাইজ শূন্য করে (তাই চেকআউট সত্যিই বন্ধ হয়)।
- **UI:** `src/components/vendor/bulk-edit-bar.tsx` + `/vendor/products`-এ প্রতি সারিতে চেকবক্স, “Select all”, আর সিলেক্ট করলেই বার: দাম/স্টক দুই ধাপে — **আগে পরিবর্তনের লিস্ট (before → after), বাদ পড়া সারির কারণ, “already had this” গণনা; তারপর Apply**। আংশিক ব্যর্থতা সৎভাবে লেখা হয় (“Saved 4 · 1 failed — <কারণ>”)।
- **টেস্ট:** `src/lib/__tests__/bulk-edits.test.ts` ১০টি + `src/components/vendor/__tests__/bulk-edit-bar.test.tsx` ৪টি (মোট ১৪টি নতুন)।

## ✅ A5 · Payout statement (মাস-ভিত্তিক CSV) — সম্পন্ন

- **pure মডিউল:** `src/lib/vendor-statement.ts` — `monthKey()`, `statementMonths()` (নতুন আগে), `statementEntries(earnings, month)` (ওই মাসের অর্ডার + পেআউট), `statementTotals()` (orders/sales/commission/extras/payable/payouts/net), `monthLabel()`, `statementCsv()`, `statementFilename()`।
- **ফাইল:** `prosanti-statement-<YYYY-MM>-<YYYYMMDD>.csv` — BOM সহ (Excel-এ বাংলা নাম ঠিক আসে), নিচে সৎ Totals ব্লক; যে মাসে কিছু নেই সেটাও সত্যিকারের ফাইল হয় (ভুয়া সারি নয়)।
- **UI:** `src/components/vendor/statement-bar.tsx` + `/vendor/earnings`-এ বসানো — মাস বাছাই, তিনটি সংখ্যা (Delivered orders · Your share · Paid out) আর “Download CSV”; স্ক্রিন আর ফাইল **একই `statementTotals()`** থেকে আসে, তাই কখনো মিলবে না — এমন হয় না।
- **টেস্ট:** `src/lib/__tests__/vendor-statement.test.ts` ৮টি + `src/components/vendor/__tests__/statement-bar.test.tsx` ২টি (মোট ১০টি নতুন)।

## ✅ A6 · প্যাকিং স্লিপ (প্রিন্ট) — সম্পন্ন

- **pure মডিউল:** `src/lib/packing-slip.ts` — `slipLines()`, `collectOnDelivery()` (COD ছাড়া/বাতিলে ০), `packingSlip()`, `slipPieceCount()`, `slipPackList()`। দাম অর্ডারের স্ন্যাপশট থেকে, ক্যাটালগ থেকে নয়।
- **স্ক্রিন:** `src/components/vendor/packing-slip-view.tsx` + রুট `src/app/vendor/orders/[id]/slip/page.tsx` (রুট শুধু params খোলে, তাই স্লিপ নিজে টেস্টযোগ্য কম্পোনেন্ট) — অর্ডার নম্বর, সময়, ক্রেতার নাম/ফোন/ঠিকানা, পণ্য+সাইজ+SKU, সাবটোটাল/ছাড়/ডেলিভারি/মোট, আর **“Collect: ৳…”** লাইন; রিটার্ন পিকআপ হলে “RETURN PICKUP — do not pack”।
- **প্রিন্ট:** `Print slip` বোতাম + `print:hidden` (বোতাম/ব্যাক-লিংক) ও `print:` স্টাইল, এবং পুরো vendor শেলের হেডার/নেভ `print:hidden` — কাগজে শুধু স্লিপটাই আসে। অর্ডার ডিটেইল পেজের হেডারে “Packing slip” লিংক যোগ করা।
- **টেস্ট:** `src/lib/__tests__/packing-slip.test.ts` ৭টি + `src/components/vendor/__tests__/packing-slip-view.test.tsx` ১টি (COD, ঠিকানা fallback, ছাড়, রিটার্ন সব কভার)।

## ✅ B1 · দোকান ফলো → নতুন পণ্যের খবর — সম্পন্ন

**migration:** `supabase/migrations/202609280001_shop_follows.sql` — `shop_follows(id, shop_id, phone, marketing_ok, last_notified_at, created_at)`, `unique(shop_id, phone)`, ফোন ফরম্যাট চেক, RLS: দোকান নিজের তালিকা পড়বে (`ps_vendor_shop()`), admin সব, আর বাইরে থেকে সরাসরি লেখা বন্ধ (স্টোরফ্রন্ট `/api/shop-follow` দিয়ে service role-এ লেখে)। PGlite-এ যাচাই করা: ভুল ফোন **refused**, একই (দোকান, ফোন) দুইবার **refused**, আবার ফলো করলে আগের রো-ই রিফ্রেশ।

- **pure মডিউল:** `src/lib/shop-follow.ts` — `validateShopFollow()` (১১ ডিজিটে normalize; অচল নম্বর কখনো লেখা হয় না; `marketingOk` শুধু `true`-ই সম্মতি)।
- **ডেটা লেয়ার:** `src/lib/db/growth.ts` — `createShopFollow` / `deleteShopFollow` / `listShopFollows` (নিজের দোকান) / `flagNewProductForFollowers` / `announceNewProductToFollowers`।
- **সৎ নিয়ম (টেস্টে পিন করা):** শুধু যে ফলোয়ার “খবর চাই” টিক দিয়েছে (`marketing_ok`) তাকেই মেসেজ যায় — যে টিক দেয়নি সে শুধু দোকানের চোখের সামনে থাকা নম্বর, মেসেজের তালিকায় নয়। যাদের ফোনে নোটিফিকেশন বন্ধ, push তাদের নাগালে না পৌঁছালে তারা `/vendor` ড্যাশবোর্ডের **“Call these numbers”** তালিকায় ফোন নম্বর হিসেবে থাকে (`tel:` লিংক) — চুপচাপ হারায় না। ফাঁকি নেই, ভুয়া “পাঠিয়ে দিয়েছি” নেই।
- **পাবলিশের সাথে যুক্ত:** `src/lib/db/admin.ts`-এ `createProduct` (পাবলিশ অবস্থায় জন্মালে) আর `updateProduct`-এ **draft → published** রূপান্তরেই ফ্যান-আউট চলে; সাধারণ সেভে আবার খবর যায় না (নাগানো নয়)। push পড়ে customer_push_subscriptions — যেটি service-role only — তাই `announceNewProductToFollowers()` নিজেই service ক্লায়েন্ট খোলে; ব্যর্থ হলে পণ্য সেভ **থেমে যায় না**।
- **push কপি:** `notify-messages.ts`-এ নতুন `new-from-shop` ইভেন্ট (“নতুন পণ্য এলো 🧵” / “New in the shop 🧵”), দোকানের নামসহ (`<দোকান> · <পণ্য>`), লিংক `/product/<slug>`, প্রাইসসহ।
- **স্টোরফ্রন্ট UI:** `src/components/shop/follow-shop-card.tsx` → দোকানের পেজে (`/shops/[slug]`) hero-র নিচে: “নতুন পণ্যের খবর দিন” → নম্বর + “অফার/নতুন ডিজাইনের খবরও পাঠাতে পারবে” টিক → ফলো; ফলো শেষে একই বোতাম “Stop following” (ডেড-এন্ড নেই)।
- **ভেন্ডর UI:** `/api/vendor/followers` (নিজের RLS-এ পড়া) + `src/components/vendor/followers-card.tsx` → ড্যাশবোর্ডে ফলোয়ার সংখ্যা, “কোন নম্বরগুলো এখনো পৌঁছানো হয়নি” তালিকা, আর সাম্প্রতিক ফলোয়ারদের “told / not told yet” অবস্থা।
- **টেস্ট (৩২টি নতুন, সব সবুজ):** `src/lib/__tests__/shop-follow.test.ts` ৬টি + `src/lib/db/__tests__/growth-shop-follows.test.ts` ১২টি + `src/lib/db/__tests__/product-publish-followers.test.ts` ৪টি (পাবলিশ হলেই খবর, টাইপো ঠিক করতে গিয়ে আবার খবর নয়) + `src/components/shop/__tests__/follow-shop-card.test.tsx` ৫টি + `src/components/vendor/__tests__/followers-card.test.tsx` ৪টি + `notify-messages`-এ নতুন `new-from-shop` কপির ১টি।

## ✅ B2 · রিভিউয়ে দোকানের উত্তর + ছবিসহ রিভিউ — সম্পন্ন (কমিট `fed914f`)

**migration:** `supabase/migrations/202609280002_review_replies.sql` — `reviews.vendor_reply` + `vendor_reply_at` (ডেটাবেসই সময় বসায়) + `vendor_reply_by` (কোন অ্যাকাউন্ট লিখল)। PGlite-এ যাচাই করা: উত্তর লিখলে স্ট্যাম্প বসে, **অন্য কোনো কলাম বদলানোর চেষ্টা ট্রিগারেই আটকে যায়** (`status` বদলাতে গেলে refused), ১২০০ অক্ষরের বেশি হলে চেক কনস্টেইন্টই আটকায়, উত্তর খালি করলে লেখকের নামও মুছে যায়। RLS-এ নতুন পলিসি `reviews vendor reply own` — দোকান শুধু **নিজের শপের** রিভিউতে উত্তর লিখতে পারে।

- **pure মডিউল:** `src/lib/vendor-reply.ts` — `validateVendorReply()` (খালি/এক শব্দের উত্তর নয়, ১২০০ অক্ষরে কাটা), `hasReply`/`replyBody`/`replyStamp`, `replySummary()` (কতটি উত্তর দেওয়া, কতটি অপেক্ষায়, **অপেক্ষমাণগুলোর গড় রেটিং** — আরামদায়ক সামগ্রিক গড় নয়), `sortForReply()` (উত্তরহীন আগে, সবচেয়ে পুরোনো অভিযোগ সবার উপরে)।
- **ডেটা লেয়ার:** `src/lib/db/vendor-reviews.ts` — `listVendorReviews()` (নিজের শপের **approved** রিভিউ, পণ্যের নাম + ক্রেতার ছবি সহ; pending রিভিউ স্টাফের কাজ, দোকান দেখে না) আর `saveVendorReply()` (trim করা লেখা, লেখকের ইমেইল audit, খালি হলে 422, পরের শপের রিভিউ হলে 404 — চুপচাপ কিছু না হওয়া নয়)।
- **API:** `GET/PATCH /api/vendor/reviews` — দুটোই দোকানের নিজের RLS ক্লায়েন্টে, তাই নিয়ম বানায় ডেটাবেসের পলিসি, রুট নয়।
- **ছবিসহ রিভিউ (P1 #10):** কাস্টমার ছবির ব্যবস্থা আগেই ছিল (`review_photos`, Cloudinary বাসা) — এই ধাপে দোকানের কার্ডে **ছবিগুলোও দেখানো হচ্ছে**, কারণ “আসল ছবি” ছাড়া দোকান বুঝতেই পারত না অভিযোগটা কী নিয়ে।
- **ভেন্ডর UI:** `src/components/vendor/vendor-reviews-card.tsx` — ড্যাশবোর্ডে “Reviews on your products” কার্ড (শেষ ৩টি, সাথে “See all reviews”), আর পুরো তালিকা `/vendor/reviews` পেজে (নেভিগেশনেও যোগ করা)। ফিল্ডে লেখা থাকে, সেভ ব্যর্থ হলে **লেখা মুছে যায় না** — কারণসহ বলে, আবার চেষ্টা করা যায়। একবার লেখা উত্তর “Reword” দিয়ে বদলানো যায়, স্ট্যাম্প নড়ে যায়।
- **স্টোরফ্রন্টে (আসল উদ্দেশ্য):** পণ্যের পেজে (`reviews-section.tsx`) রিভিউয়ের নিচে “Response from the shop” ব্লক — অর্থাৎ দোকান সামনাসামনি জবাব দেয় সেখানেই, যেখানে সব ক্রেতা পড়ে।
- **টেস্ট:** `src/lib/__tests__/vendor-reply.test.ts` ৯টি + `src/lib/db/__tests__/vendor-reviews.test.ts` ৮টি + `src/components/vendor/__tests__/vendor-reviews-card.test.tsx` ৭টি + `src/components/reviews/__tests__/reviews-section-reply.test.tsx` ৩টি = **২৭টি নতুন, সব সবুজ** (স্যুট এখন ৩২০ ফাইল / ১৯৮৫ টেস্ট)।

## ✅ B3 · ভেন্ডরের নিজের প্রোমো কোড — সম্পন্ন (কমিট `8a9511d`)

**migration:** `supabase/migrations/202609280003_vendor_promos.sql`

- `coupons`-এ নতুন কলাম `shop_id` (কোথাও না থাকলে NULL = platform কুপন, আগের মতোই সব দোকানে চলে) + `created_by` (কোন অ্যাকাউন্ট বানাল) + ইনডেক্স `idx_coupons_shop`।
- নতুন টেবিল `vendor_promo_limits` (একটি `default` সারি) — প্ল্যাটফর্মের ছাদ: **সর্বোচ্চ ২৫%**, একটি কোডে সর্বোচ্চ **৳৫০০** ছাড়, **৩০ দিনের** বেশি নয়, **৩০০ redemption**, একসাথে **৩টি** চালু কোড।
- RLS: `coupons vendor read/insert/update own` (`ps_vendor_shop()` দিয়ে) — দোকান শুধু নিজের কোড দেখে/লিখতে পারে; ছাদের টেবিল সবার পড়া, admin-এর লেখা।
- ট্রিগার `ps_guard_vendor_promo`: ছাদ ছাড়িয়ে গেলে, `end date` না দিলে, সময়/ব্যবহার-সীমা ছাড়া কোড বানালে, `free_delivery` বানাতে চাইলে, অন্যের দোকানের নামে লিখলে, `used` কাউন্টার বা `shop_id` হাতড়ালে, ব্যবহৃত কোড পরে নাম বদলালে — **ডেটাবেসই আটকায়** (রুট বাইপাস করলেও নিয়ম টেকে)।
- `ps_guard_order_coupon_shop`: অর্ডারে কুপনের `shop_id` আর অর্ডারের `shop_id` মিলতে হবে — এক দোকানের কোড অন্য দোকানের অর্ডারে বসতেই পারে না।
- **টাকা কার থেকে যাচ্ছে — লেজারে লেখা হয়:** `ps_write_shop_ledger` এখন দোকানের **নিজের** প্রোমোর ছাড় নিজের payable থেকে কাটে (অর্থাৎ মালিক দোকানই ছাড়টা বহন করে), প্ল্যাটফর্মের কুপন হলে লাইনটা ছোঁয় না, রিটার্ন অর্ডারে ছাড় শূন্য। PGlite-এ হিসাব মিলিয়ে দেখা: ৳১০০০ অর্ডারে দোকানের কোড → commission ৳১৫০, payable ৳৭৫০, promo_discount ৳১০০; একই অর্ডারে platform কুপন → payable ৳৮৫০, promo_discount ৳০।
- PGlite-এ ১০টি ভুল চেষ্টা (ছাদের বাইরে %, ৩০ দিনের বেশি, end date ছাড়া, usage limit ছাড়া, free_delivery, অন্যের শপ, `used` এডিট, ব্যবহৃত কোড rename, ৪র্থ চালু কোড, cross-shop অর্ডার) — সব **refused**।

- **pure মডিউল:** `src/lib/vendor-promo.ts` — `DEFAULT_PROMO_LIMITS` (টেবিল না পড়লেও ছাদ থাকে), `promoLimitsFrom()`, কোড ফরম্যাট `^[A-Z0-9]{3,24}$`, `validateVendorPromo()` (ফর্মের টাকা → paisa; প্রতিটি ছাদ ভাঙলে **কোন ছাদ** সেটি নাম ধরে বলে), `promoCapsLines()` (স্ক্রিনে ছাপার জন্য), `promoShareMath()` / `promoShareSummary()` / `promoState()` / `promoRemaining()`।
- **টাকার হিসাব (B3-এর আসল অংশ):** কোড বানানোর **আগেই** স্ক্রিনে দেখা যায় — ১২০০ টাকার নমুনা অর্ডারে ক্রেতার সাশ্রয়, দোকানের পাওনা (কোড ছাড়া vs কোড সহ), প্ল্যাটফর্মের কমিশন (অপরিবর্তিত), আর **break-even** — “কত % বেশি অর্ডার পেলে ছাড়টা উঠে আসবে”। অর্থাৎ ছাড় মানে লুকানো লস নয়, চোখের সামনে হিসাব।
- **ডেটা লেয়ার:** `src/lib/db/vendor-promos.ts` — `readPromoLimits()` (পড়তে না পারলে ডিফল্টে পড়ে, কখনো ভাঙে না), `listVendorPromos()` (নিজের কোড, সর্বোচ্চ ১০০), `promoBoard()` (কোড + ছাদ + মোট ব্যবহার + **ledger থেকে আসল দেওয়া ছাড়**), `createVendorPromo()` (আগে বোধগম্য refusal, পরে ডেটাবেসের মেসেজ হুবহু দেখানো; একই কোড দুইবার → 409), `setVendorPromoActive()` (id **এবং** shop_id দুইটাই মিলিয়ে, নইলে 404 — অন্যের কোডে হাত নেই)।
- **API:** `src/app/api/vendor/promos/route.ts` — `GET` বোর্ড, `POST` (২০/মিনিট → 201), `PATCH` pause/resume (৪০/মিনিট); সব দোকানের নিজের RLS ক্লায়েন্টে, তাই কর্তৃত্ব ডেটাবেসের।
- **কুপন ইঞ্জিনে পাহারা:** `src/lib/coupons.ts`-এ `Coupon.shopId/shopName`, `couponAppliesToShops()`, `couponShopMismatchReason()` এবং `bestCoupon(..., shopIds)`; `/api/coupons/validate` আর `/api/coupons/best` এখন কার্টের দোকান মেলায় — দোকানের কোড থাকলে **“This code is only for <দোকানের নাম>'s products.”**। নিয়মটা কার্টের **প্রতিটি** লাইনে দোকানটির হওয়া লাগে (mixed cart-এ চলে না) — ঠিক যেমনটা `orders` টেবিলের ট্রিগারেও লেখা।
- **ভেন্ডর UI:** `src/components/vendor/promo-card.tsx` — মোট ব্যবহার, **“Discount given (your share)”** (ledger-এর টাকা), ছাদগুলো চিপ আকারে ছাপা, টাকার প্রিভিউ, তারপর ফর্ম (কোড/ধরন/৳|% / মিনিমাম অর্ডার/সর্বোচ্চ ছাড়/কত দিন/কতবার/নিজের নোট) এবং কোডের তালিকা — প্রতিটির অবস্থা **Live · Scheduled · Paused · Fully used · Ended** এবং “X used · Y left” সহ Pause/Resume বোতাম। সেভ ব্যর্থ হলে লেখা মুছে যায় না, কারণ উঠে আসে। ড্যাশবোর্ডে কার্ডটি, পুরো পেজ `/vendor/promo`, নেভিগেশনেও যোগ করা।
- **টেস্ট:** `src/lib/__tests__/vendor-promo.test.ts` ১১টি + `src/lib/db/__tests__/vendor-promos.test.ts` ১০টি + `src/components/vendor/__tests__/promo-card.test.tsx` ৭টি + `src/app/api/__tests__/coupons-shop-scope.test.ts` ৫টি = **৩৩টি নতুন**; সাথে `vendor-routes.test.ts`-এ নতুন দুটি রুটের ভেন্ডর-গেট। ফোকাসড রান ৭ ফাইল / ৪৮ টেস্ট **সব সবুজ**, `tsc` + `eslint --max-warnings=0` পরিষ্কার; পুরো স্যুট **৩২৪ ফাইল / ২০১৮ টেস্ট EXIT=0**।

---

## ✅ B4 · ভেন্ডর ফানেল রিপোর্ট (দোকানের নিজের attribution) — সম্পন্ন (কমিট `c335092`)

**migration:** `supabase/migrations/202609280004_shop_funnel.sql`

- **Backfill:** `storefront_events`-এ `shop_id` ফাঁকা থাকলে `product_id` থেকে `products.shop_id` বসানো হয় — যা প্রমাণ করা যায়, কেবল তাই; অনুমান করে কিছুই ভরা হয় না।
- **নতুন ইনডেক্স:** `storefront_events_shop_idx (shop_id, event, created_at desc) where shop_id is not null` — দোকান-ভিত্তিক পড়াই এখন সস্তা।
- **নতুন ফাংশন `ps_shop_funnel_report(p_shop_id, p_days)`** — সেশন, দোকানের পেজ ভিউ, পণ্য দেখা → ব্যাগে → চেকআউট → অর্ডার, **আসল অর্ডার/রাজস্ব/AOV/কত পিস** (`orders` থেকে; cancelled ও return অর্ডার বাদ), কোথা থেকে ব্যাগে ঢুকেছে, আর দোকানের নিজের **টপ ১০ পণ্য** (দেখা → ব্যাগে → আসল অর্ডার)।
- **কার্ট-লেভেল attribution:** `page_view`-এও এখন দোকানের আইডি যায় (ক্লায়েন্টে `ShopAttribute` + `src/lib/page-shop.ts`; রুট ট্র্যাকার সেটা স্ট্যাম্প করে), ফলে “**আমার দোকানের পেজ কতজন খুলল**” আসল সংখ্যা — আর আগের দোকানের পেজ ছাড়লে পরের page_view-এ আগের দোকান আটকে থাকে না।
- **নিরাপত্তা/গোপনীয়তা:** ফাংশনটি service-role only — `anon`/`authenticated`/`public`-এর জন্য `execute` **revoked** (PGlite-এ যাচাই: grant ০)। `storefront_events`-এর RLS অটুট (কোনো policy নেই), তাই ব্রাউজার থেকে কারো ক্লিক পড়া যায় না; রিপোর্ট আসে শুধু service ক্লায়েন্ট দিয়ে, আর `shop_id` আসে **ভেরিফাইড ভেন্ডর সেশন** থেকে (`ctx.shopId`) — query string থেকে কখনো নয়।
- **PGlite-এ ২১টি চেক সবুজ:** backfill-এর ফলে বাড়তি add-to-cart ধরা পড়া, অন্য দোকানের ট্রাফিক রিপোর্টে ঢোকেনি, ফাঁকা shop_id → সব শূন্য, cancelled অর্ডার রাজস্বে নেই, টপ-প্রোডাক্টের views/adds/orders, **idempotent re-run** (আবার চালালে সংখ্যা বাড়ে না), আর grant চেক।

- **pure মডিউল:** `src/lib/shop-funnel.ts` — `shopFunnelRates()` (view → add → checkout → order → session-to-order), `isThin()`/`SMALL_BASE = 20`, `funnelSteps()` (প্রতিটি ধাপের from/to), `funnelIsQuiet()`, `funnelAdvice()`, `parseShopFunnel()` (junk-এ ভাঙে না), `emptyShopFunnel()`।
- **সততা নীতি (টেস্টে পিন করা):** ২০টির কম সেশন থাকা ধাপে **রেট দেখানোই হয় না** — “Not enough data yet · 4 of 8” (২-এর ওপর ৫০% দেখিয়ে চালাকি নেই)। কোনো তথ্যই না থাকলে “No visitors recorded yet” (মনে হবে না দোকান খারাপ চলছে)। শেষ ধাপ গোনা হয় **আসল অর্ডার** — cancelled/return বাদ। AOV না থাকলে `—`, ৳০ নয়। পরামর্শ কেবল সেই ধাপের নাম বলে যার পেছনে **যথেষ্ট প্রমাণ** আছে।
- **ডেটা লেয়ার:** `src/lib/db/vendor-funnel.ts` — `shopFunnelReport()` (ভুল কোড/মেসেজে “migration নেই” চিনে নেয়, আসল ব্যর্থতা গেলায় না), `shopFunnelFor(shopId, days)` (কখনো throw করে না; `missing` মানে migration চালু হয়নি বা service role নেই — আর তা শূন্য দোকান হিসেবে দেখানো হয় না)।
- **API:** `GET /api/vendor/funnel?days=7|28` (ভেন্ডর গেট + rate limit) — না থাকলে 503 `{missing:true}`, থাকলে রিপোর্ট। হুক `useVendorFunnel()` স্ট্যাটাসও ধরে রাখে, যাতে 503-কে “ফাঁকা সপ্তাহ” না ভাবা হয়।
- **ভেন্ডর UI:** `src/components/vendor/funnel-card.tsx` — তিনটি সংখ্যা (Visited your shop · Orders · Revenue), চার ধাপের বার (প্রতিটিতে “X of Y · Z%” অথবা “Not enough data yet”), সৎ পরামর্শ, AOV/পিস/পেজ ভিউ, আর “Which products, and where the adds came from” চাপলে পণ্য-ভিত্তিক টেবিল (Seen · Added · Ordered) ও add-to-bag-এর উৎস। ড্যাশবোর্ডে কার্ড, পুরো পেজ `/vendor/funnel` (৭/২৮ দিন), নেভিগেশনেও যোগ করা।
- **টেস্ট:** `src/lib/__tests__/shop-funnel.test.ts` ১৩টি + `src/lib/__tests__/shop-attribution.test.ts` ৮টি + `src/lib/db/__tests__/shop-funnel.test.ts` ৯টি + `src/components/vendor/__tests__/funnel-card.test.tsx` ৮টি = **৩৮টি নতুন**, সাথে vendor গেট টেস্টে নতুন রুট। `tsc` + `eslint --max-warnings=0` পরিষ্কার; বিদ্যমান funnel/analytics টেস্ট (১৬টি) অক্ষত; **পুরো স্যুট ৩২৮ ফাইল / ২০৫৬ টেস্ট EXIT=0**।

---

## ✅ B5 · “ভেরিফায়েড দোকান” ব্যাজ (NID + ট্রেড লাইসেন্স, অডিট সহ) — সম্পন্ন

**migration:** `supabase/migrations/202609280005_shop_verification.sql`

- `shops`-এ নতুন কলাম: `nid_checked`, `trade_licence_checked` (দুটোই আলাদা — স্টাফ যা হাতে ধরে দেখেছে), `verified_at`, `verified_by`, `verified_by_email`, `verification_note` (স্টাফের ব্যক্তিগত নোট)।
- **ব্যাজ = প্রমাণের ফল, আলাদা কোনো “ভেরিফায়েড” সুইচ নয়:** ট্রিগার `ps_guard_shop_verification` — দুটো চেকই থাকলে `verified_at` বসে; যেকোনো একটি তুলে দিলেই **ব্যাজ, সময় ও অফিসার—তিনটিই মুছে যায়**। অর্থাৎ ব্যাজ কখনো তার পেছনের কাগজের চেয়ে বেশি বাঁচে না। স্টাফ সরাসরি SQL-এ `verified_at` বসাতে গেলেও কাগজ ছাড়া তা টেকে না (PGlite-এ যাচাই)।
- **দোকান নিজেকে ভেরিফাই করতে পারবে না:** ট্রিগারেই ভেন্ডর সেশনের (এমনকি সরাসরি anon key + নিজের JWT-এর) সব verification কলাম বদল **refused** — তবুও দোকানের নিজের প্রোফাইল এডিট (tagline ইত্যাদি) ঠিকঠাক চলে। নতুন শপ রো জন্মেই ভেরিফায়েড হতে পারে না; উপরে একটি check কনস্ট্রেইন্ট (`shops_no_self_verification`)। ফাকি দেওয়ার কোনো রাস্তা নেই।
- **অডিট যাতে টিকে:** নতুন টেবিল `shop_verification_events` — **append-only** (কোনো update/delete policy নেই + ট্রিগার `ps_guard_verification_append_only` সরাসরি “history cannot be rewritten” বলে ফেলে)। কে/কখন/কী লিখল — ব্যাজ তুলে নিয়ে আবার দিলেও ইতিহাস থাকে। টেবিলে `anon`/`authenticated`/`public`-এর কোনো grant নেই (PGlite-এ যাচাই: ০)।
- **PGlite-এ ১৮টি চেক সবুজ:** দুটো চেক → ব্যাজ, একটা তুললে ব্যাজ+অফিসার মুছে যাওয়া, কাগজ ছাড়া স্ট্যাম্প টেকা না, ভেন্ডরের হাত পা বাঁধা, অথচ প্রোফাইল এডিট চলা, ইতিহাসের ২ ঘটনা, রিরাইট/ডিলিট refused, **idempotent re-run** (আবার চালালে কিছুই বাড়ে না)।

- **pure মডিউল:** `src/lib/shop-verification.ts` — `isVerified()` (দুটো চেক **এবং** স্ট্যাম্প — পুরোনো তারিখ দিয়ে ব্যাজ চালানো যাবে না), `missingChecks()`, `verificationPromise()` (“ID and trade licence checked by PROSANTI” — অস্পষ্ট সবুজ টিক নয়), `verifiedOnLabel()`, `notCheckedLine()` (“Documents not checked by PROSANTI yet” — কাউকে সন্দেহজনক বলা হচ্ছে না, কারণ বেশিরভাগ অযাচাই দোকান কেবল **প্রক্রিয়াহীন**), `vendorVerificationLine()` (দোকান নিজে বুঝবে কী বাকি), `validateVerificationPatch()` (খালি জমা বন্ধ — চুপচাপ ব্যাজ মুছবে না), `actionFor()`/`auditLine()`/`parseVerificationEvent()`।
- **গোপনীয়তা (টেস্টে পিন করা):** `mapShop()` শুধু দুটো বুলিয়ান + তারিখ বহন করে; **নোট, অফিসারের আইডি/ইমেইল কোনোভাবেই Shop-এ আসে না** — তাই স্টোরফ্রন্ট বা ভেন্ডর payload-এ লিক হওয়ার সুযোগই নেই (`src/lib/db/__tests__/shop-verification-mapping.test.ts`)। অ্যাডমিন সাইড আলাদা রিড (`shopVerificationHistory`)।
- **অ্যাডমিন:** `/admin/shops`-এর Edit প্যানেলে “Verification” কার্ড — দুটো টিক (Owner’s National ID seen / Trade licence seen), ব্যক্তিগত নোট, Save; **সেভের আগেই** সতর্কতা — “Saving removes the badge from this shop’s storefront” বা “Saving puts the badge…”। নিচে “Who checked”: কে, কবে, আর সর্বশেষ ঘটনাগুলো (Verified / Badge removed / Note)। অফিসার আসে **ভেরিফায়েড স্টাফ সেশন** থেকে — রিকোয়েস্ট বডি থেকে কখনো নয় (টেস্টে attacker email পাঠিয়ে দেখানো)। API: `POST` / `GET /api/admin/shops/[id]/verification` — `admin`/`super_admin` ছাড়া ঢোকাই নেই।
- **স্টোরফ্রন্ট:** `src/components/shop/verified-badge.tsx` — কার্ডে (`shop-card`) ও দোকানের পেজের হেডারে (`shop-hero`, তারিখসহ) “Verified shop”; যাচাই হয়নি এমন দোকানে নিরপেক্ষ “Not checked yet” (লাল রঙে “unverified” নয়)। বাংলা/ইংরেজি দুই ভাষাতেই কী (`shops.verified`, `shops.notCheckedShort`…)।
- **ভেন্ডরের দিক:** `/vendor` ড্যাশবোর্ডে “Verified shop badge” কার্ড — ব্যাজ আছে কি না, কোন কাগজ বাকি, আর কী পাঠাতে হবে; স্টাফের নোট/নাম সেখানে কখনো দেখায় না (কার্ডে সেই প্রপই নেই)।
- **টেস্ট:** `src/lib/__tests__/shop-verification.test.ts` ১৫টি + `src/lib/db/__tests__/shop-verification.test.ts` ১২টি + `src/lib/db/__tests__/shop-verification-mapping.test.ts` ৪টি + `src/components/shop/__tests__/verified-badge.test.tsx` ৫টি + `src/components/admin/__tests__/shop-verification-card.test.tsx` ৮টি + `src/components/vendor/__tests__/verification-card.test.tsx` ৪টি + `src/app/api/__tests__/shop-verification-route.test.ts` ৫টি = **৫৩টি নতুন**। `tsc` + `eslint --max-warnings=0` পরিষ্কার; shop/vendor/admin-এর আগের ১০৩টি টেস্ট অক্ষত; **পুরো স্যুট ৩৩৫ ফাইল / ২১০৯ টেস্ট EXIT=0**।

---

## পরের আইটেম
**ব্যাচ A শেষ** ✅ → **B1 শেষ** ✅ → **B2 শেষ** ✅ → **B3 শেষ** ✅ → **B4 শেষ** ✅ → **B5ও শেষ** ✅ → এখন B6 (ছুটির সময়সূচি: তারিখ-রেঞ্জ দিলে ওই সময় চেকআউটে দোকান বন্ধ, পরে নিজেই খুলে যাবে)।
