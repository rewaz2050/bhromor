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

## ✅ B5 · “ভেরিফায়েড দোকান” ব্যাজ (NID + ট্রেড লাইসেন্স, অডিট সহ) — সম্পন্ন (কমিট `0a9b6fe`)

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

## B6 — ছুটির সময়সূচি: ১০–১২ অক্টোবর বন্ধ, ১৩ তারিখে **নিজেই** খুলে যাবে (সম্পন্ন, কমিট `2937593`)

**সমস্যা:** আগে একটাই সুইচ ছিল — “এখন বন্ধ”। তিন দিন ছুটি মানে তিন দিন মনে রাখা; ভুলে গেলে দোকান চুপচাপ অর্ডার হারায়। ছুটিই একমাত্র বন্ধ যা দোকান **আগেই পরিকল্পনা** করতে পারে — তাই এটাকে একটা সুইচ নয়, **দুই প্রান্তওয়ালা সময়সীমা** হিসেবে মডেল করা হলো। তাহলে খোলা আবার “মনে রাখার” ব্যাপার থাকে না — তারিখ থেকেই বেরিয়ে আসে।

**মাইগ্রেশন:** `supabase/migrations/202609280006_shop_vacation.sql`
- `shops`-এ `vacation_start date`, `vacation_end date`, `vacation_note text` (নোট ১৬০ অক্ষর)।
- `ps_vacation_max_days()` = **৪৫**; স্প্যানের ওপর CHECK কনস্ট্রেইন্ট — অসীম “ছুটি” আসলে স্থায়ী বন্ধ, সেটা ঢুকতে দেওয়া ঠিক নয়।
- `ps_shop_on_vacation(shop, at)` — শুরু ও শেষ **দুটো দিনই** অন্তর্ভুক্ত।
- **`orders`-এ BEFORE INSERT ট্রিগার** → `ps_guard_order_shop_open()`: ছুটির মধ্যে (“shop on holiday until 13 Oct”) আর সাধারণ বন্ধেও অর্ডার ফেরত দেয়। এটা `ps_place_order`-এর ~১২ কপির কোনোটাতে নয়, **টেবিলে** — তাই সব জেনারেশনে আর সরাসরি লেখাতেও ধরা পড়ে। তবে `is_return` সারি (আগেই হওয়া বিক্রির উল্টো পা — রিটার্ন পিকআপ) আর শপ-বিহীন সারি অক্ষত থাকে।
- **`shops`-এ BEFORE UPDATE ট্রিগার** → `ps_expire_shop_vacation()`: যে সময়সীমা শেষ হয়ে গেছে তা নিজেই মুছে যায় (মাইগ্রেশনের সময় একবারেও), ফলে কোনো স্ক্রিনে “গত মাসের ছুটি”-র ব্যাখ্যা দিতে হয় না।
- **PGlite-এ যাচাই:** সময়সীমার আগে অর্ডার চলে / চলাকালীন ফেরত / পার হয়ে যাওয়া সময়সীমা নিজে মুছে যাওয়ার পর আবার চলে; ৪৫ দিন গ্রাহ্য; end<start, অর্ধেক সময়সীমা ও ৪০০ দিন — সব প্রত্যাখ্যাত; আগের `is_open=false` বার্তা অপরিবর্তিত; বারবার চালালেও ফিউচার বুকিং টিকে।

**নিয়ম (ডিজাইনের মূল কথা):** ছুটি কখনো `is_open`-এ হাত দেয় না — ছুটির সময় দোকান বন্ধ, পরের দিন ঠিক যেমন ছিল তেমনই। বুকিং **শুধু মালিক** পারবে; স্টাফ লগিন ওপেন সুইচ ঘুরাতে পারে, কিন্তু দোকানের বিক্রি কয়েকদিন বন্ধ করার সিদ্ধান্ত তার নয়।

**কোড:** `src/lib/shop-vacation.ts` (পিউর, সময় আর্গুমেন্ট) — phase, কত দিন বাকি, রেঞ্জ (“10–12 Oct”) ও খোলার তারিখের বাক্য, আর `validateVacation`: দুটো তারিখই দিতে হবে নাহয় কোনোটাই নয়, end ≥ start, ≤ ৪৫ দিন, অতীতের ছুটি নয়; আর **ভুল মান** (যেমন `vacationStart: 123`) কোনোভাবেই বুকিং মুছে ফেলবে না — সেটা এরর। `isShopOrderable(shop, now)` এখন ছুটিও মানে; `mapShop()` দুটো তারিখ থাকলেই শুধু জানালা প্রকাশ করে (অর্ধেক সময়সীমা কাউকে বন্ধ করে না)।

**কপি — কারণ “বন্ধ” আর “ছুটিতে — ১৩ অক্টোবর খুলবে” এক খবর নয়:**
- দোকানের তালিকার কার্ড, দোকানের পেজের হেডার (সেখানে দোকানের নিজের নোটও — “Closed for Eid”), পণ্যের পেজে “Add to bag”-এর পাশের পিল, ব্যাগের হেডার, আর চেকআউটের বাধা — সব জায়গায় **কবে আবার অর্ডার নেবে** সেই তারিখ।
- যে দোকান নিজেই দিনের জন্য বন্ধ করেছে, সে সাধারণ “বন্ধ”-ই — ছুটির ভাষা নয়।
- ভেন্ডর ড্যাশবোর্ডের “Shop sign” টাইল ছুটির সময় “Open” মিথ্যা না বলে **“On holiday”** দেখায়।
- ভাষা: `shops.onHoliday*`, `checkout.shopHolidayBag` — বাংলা ও ইংরেজি দুই জায়গাতেই।

**ভেন্ডরের স্ক্রিন:** `/vendor`-এ “Holiday dates” কার্ড (`src/components/vendor/vacation-card.tsx`) — প্রথম দিন/শেষ দিন/নোট, স্টেট পিল (No holiday / Booked / On holiday), আর সবচেয়ে জরুরি বাক্যটা: **“Orders open again on 13 Oct, on their own”** — অর্থাৎ কিছু টিপতে হবে না। “Cancel holiday”-এ দোকান সাথে সাথে অর্ডার নেওয়া শুরু করে। স্টাফ লগিনে কেবল দেখায়, বুকিং বাটন নেই।

**টেস্ট:** ৬টি নতুন ফাইলে **৬৭টি** — `src/lib/__tests__/shop-vacation.test.ts` ২২টি, `shop-utils-vacation.test.ts` ৯টি, `src/lib/db/__tests__/shop-vacation-mapping.test.ts` ৫টি, `vendor-vacation-patch.test.ts` ১৪টি, `src/components/vendor/__tests__/vacation-card.test.tsx` ১২টি, `src/components/shop/__tests__/shop-vacation-closed.test.tsx` ৫টি। `tsc --noEmit` ও `eslint --max-warnings=0` পরিষ্কার; EN/BN কী-প্যারিটি যাচাই করা; **পুরো স্যুট ৩৪১ ফাইল / ২১৭৬ টেস্ট EXIT=0** (কমিট `2937593`)।

---

## C1 — দোকানের মালিক নিজেই স্টাফ লগইন খুলতে পারবে (সম্পন্ন, কমিট `5ac9d35`)

**সমস্যা:** ব্যস্ত দোকানে একজনই থাকে না — বাজারে থাকা মালিকের বদলে কাউন্টারে কাউকে অর্ডার কনফার্ম করতে হয়। আগে শুধু PROSANTI স্টাফ ভেন্ডর লগইন তৈরি করতে পারত (Admin → Shops → Link vendor), তাই মালিকের হাত বাঁধা ছিল; সহজ পথ ছিল **নিজের পাসওয়ার্ড শেয়ার করা** — যা দোকানের প্রোফাইল, সাইন ও সেটিংসও খুলে দেয়। এখন মালিক নিজেই স্টাফ লগইন খুলতে পারে।

**মাইগ্রেশন:** `supabase/migrations/202609280007_vendor_staff.sql`
- `vendor_users`-এ `display_name`, `login_email`, `added_by` যোগ; আগের সারিগুলো `auth.users` থেকে backfill — ফলে রোস্টার ফাঁকা থাকে না।
- `ps_vendor_role()` (`ps_vendor_shop()`-এর মতো security definer) ও `ps_vendor_staff_max()` = **৫**।
- **পলিসি:** প্রত্যেকে নিজের সারি দেখে; **মালিক** দোকানের রোস্টার দেখেন এবং staff সারি যোগ/নাম বদল/মুছতে পারেন; একজন স্টাফ আরেকজনের সারি দেখতেই পায় না।
- **ট্রিগার (`trg_vendor_users_guard`):** একটা সারির **মানুষ, দোকান ও role আজীবন একই থাকে**। এই এক নিয়মেই সব রকম escalation বন্ধ — কোনো স্ক্রিন, service-role লেখা বা ভুল করা অ্যাডমিন ফর্মও স্টাফকে মালিক বানাতে পারবে না। সাথে: দোকানের **শেষ মালিককে** কেউ মুছতে বা নামাতে পারবে না; স্টাফ সংখ্যা ক্যাপও ট্রিগারে আছে (প্রতিটি লগইন আসল একটি auth অ্যাকাউন্ট)।
- **PGlite-এ ২৪টি চেক:** মালিক শুধু নিজের দোকানে স্টাফ যোগ করতে পারে; দ্বিতীয় মালিক তৈরি করতে পারে না; পাঁচজনের পর বন্ধ; মালিক রোস্টার দেখেন, স্টাফ শুধু নিজের সারি; স্টাফ কাউকে যোগ/প্রমোট/সরাতে পারে না; service role দিয়েও **শেষ মালিক** মোছা যায় না; দুজন মালিক থাকলে PROSANTI একজন সরাতে পারে; বারবার চালালেও কিছু নষ্ট হয় না।

**দুটি সিদ্ধান্ত যা সরাসরি সততার প্রশ্ন:**
- **রিভোক মানে শুধু দোকানের দরজা বন্ধ** — ব্যক্তির অ্যাকাউন্ট মোছা হয় না। ওই লগইন কাস্টমার বা রাইডারেরও হতে পারে; মুছলে তাদের পার্সেল ও ইতিহাসও যাবে।
- **আগে থেকে থাকা লগইন “অ্যাডপ্ট” করা হয় না**। ওই নম্বর/ইমেইল কার তা প্রমাণের কোনো উপায় নেই (এখানে কোনো ইমেইল-OTP/SMS নেই), আর নিয়ে নিলে এক অচেনা মানুষের হাতে দোকানের চাবি চলে যেতে পারে। তাই 409 — সাথে কী করা যায় সেই কথা।

**কোড:** `src/lib/vendor-staff.ts` (পিউর) — নাম + লগইনের নিয়ম (**মোবাইল নম্বরই প্রধান লগইন**, কারণ অনেক সহকারীর ইমেইল নেই; সেটি আবেদন ফর্মের মতো সিনথেটিক অ্যাড্রেসে বদলায়), রোস্টারের কপি, আর ক্যাপ।

**API (owner-gated, POST-এর রেট-লিমিট সবচেয়ে কড়া — কারণ সেখানে অ্যাকাউন্ট তৈরি হয়):** `GET` / `POST /api/vendor/staff`, `DELETE /api/vendor/staff/[id]`, `POST /api/vendor/staff/[id]/password`। **ওয়ান-টাইম পাসওয়ার্ড একবারই** ফেরত যায় — ইমেইল নেই বলে ফেরত পাওয়ার উপায়ও নেই; ব্যক্তি নিজে সেটিংস থেকে পাসওয়ার্ড বদলে নেয়।

**স্ক্রিন:** `/vendor/settings`-এ **“Staff logins”** কার্ড (মালিকের জন্য) — রোস্টার, নতুন লগইন, **দুই ধাপে** রিভোক (“Yes, revoke / Keep”), নতুন পাসওয়ার্ড, আর ক্যাপ আগেই জানানো। পাসওয়ার্ড কার্ডটি এখন **স্টাফদেরও** দেখা যায় — যে লগইনটা অস্থায়ী পাসওয়ার্ড দিয়ে শুরু, তার বদলের পথ থাকা চাই।

**একটি পর্যবেক্ষণ (এখন বদলাইনি):** স্টাফ লগইন বর্তমানে **earnings/পেআউট দেখতে পারে** (এটা আগের আচরণ, C1 বদলায়নি)। চাইলে পরের কোনো রাউন্ডে “কে কী দেখতে পারবে” একটা permission ম্যাট্রিক্স বানানো যায় — আপনি বললে আমি আলাদা আইটেম হিসেবে নেব।

**টেস্ট:** ৪টি নতুন ফাইলে **৫৯টি** — `src/lib/__tests__/vendor-staff.test.ts` ১৪টি, `src/lib/db/__tests__/vendor-staff.test.ts` ২২টি, `src/components/vendor/__tests__/staff-card.test.tsx` ১১টি, `src/app/api/__tests__/vendor-staff-routes.test.ts` ১২টি; সাথে নতুন চারটি এন্ডপয়েন্ট “সেশন নেই → ৪০১” স্যুটে যোগ। `tsc --noEmit` ও `eslint --max-warnings=0` পরিষ্কার; **পুরো স্যুট ৩৪৫ ফাইল / ২২৩৫ টেস্ট EXIT=0** (কমিট `5ac9d35`)।

---

## C2 — এক চেকআউটে একাধিক দোকান: এক ট্যাপে দোকান-প্রতি আলাদা অর্ডার (কোড রেডি, কমিট `fa7ebc5`)

**সমস্যা:** আগে ব্যাগে একাধিক দোকানের পণ্য থাকলে চেকআউটই বন্ধ ছিল — “এক অর্ডার = এক দোকান”, মানে ক্রেতাকে আলাদা আলাদা করে অর্ডার করতে হতো।

**মূল সিদ্ধান্ত:** “এক অর্ডার = এক দোকান” নিয়ম আমরা **বদলাইনি** — দোকান নিজের পার্সেল প্যাক করে, লেজারে নিজের শেয়ার পায়, ড্যাশবোর্ডে নিজের অর্ডার দেখে। বদলেছে জায়গাটা: বিভাজন এখন সার্ভারে ও ডেটাবেসে — এক ট্যাপেই দোকান-প্রতি আলাদা অর্ডার তৈরি হয়।

**Atomicity — সবচেয়ে জরুরি অংশ:** `ps_place_multi_order(p_orders)` ফাংশনের ভেতরে লুপ চালিয়ে `ps_place_order` কল করে। Postgres-এ **ফাংশন = এক ট্রানজ্যাকশন**, তাই ব্যাচটা সব-অথবা-কিছুই: তৃতীয় দোকানে স্টক শেষ বা দোকান বন্ধ হলে প্রথম দুটো অর্ডারও রোলব্যাক হয়। ক্রেতা কখনো “অর্ধেক চেকআউট” হাতে পায় না, কখনো এমন পার্সেলের টাকা দেয় না যে আসছেই না। সব দাম/স্টক/কুপন/জোন-সংক্রান্ত গার্ড আগের `ps_place_order`-এরই — নতুন করে লেখা হয়নি, তাই ভিন্ন মত হয়ে যাবার ঝুঁকি নেই।
- **PGlite-এ ১৫টি চেক:** ২ দোকান → ২ অর্ডার (নিজের নিজের টাকা), বন্ধ দোকান/খারাপ পরিমাণ → **কিছুই লেখা হয়নি**, ৪র্থ দোকান বারণ, একই দোকান দুইবার বারণ, ফাঁকা ব্যাচ বারণ, এক এন্ট্রিতে মিশ্রিত দোকান বারণ, বারবার চালালেও অক্ষত।

**প্রতিটি পার্সেলের নিজস্ব হিসাব:** পণ্য/সাবটোটাল/ওজন → নিজের ডেলিভারি চার্জ, নিজের ফ্রি-ডেলিভারি থ্রেশহোল্ড (দোকানের নিজের অফারসহ), নিজের কুরিয়ার ন্যূনতম, আর নিজের বন্ধ/ছুটি যাচাই (B6)। যাচাইয়ের কাজটা সেই **আগের `validateOrderPayload`**-ই করে — এখন সেটা পার্সেল-প্রতি চলে।

**যা ব্যাগে একটাই, তা বড় পার্সেলে:** টিপ, গিফট র‍্যাপ ও রেফারেল ক্রেডিট — একবারই কাটা হবে, তাই সবচেয়ে বড় অর্ডারের সাথে যায়; স্ক্রিনে লেখা থাকে কোথায় গেল।

**কুপন — টাকা যেন দ্বিগুণ না হয়:** পার্সেন্ট ও ফ্রি-ডেলিভারি → প্রতিটি পার্সেলে নিজের অংশ (১০% প্রতিটিতে = ব্যাগের ১০%); **নির্দিষ্ট টাকা (যেমন ৳১০০ ছাড়) → একবারই, বড় পার্সেলে**; দোকানের নিজের কোড (B3) কেবল সেই দোকানের পার্সেলে। আগে থেকে থাকা লগইন “অ্যাডপ্ট” করা হয় না (কে মালিক তা প্রমাণ করা যায় না)। অটো-অফার (flash/bundle) এখন পার্সেল-প্রতি — দুই দোকানে ভাগ হয়ে থাকা “সেট” আর কোট করা হয় না, কোনো একক দোকান তা মানতে পারত না।

**স্ক্রিন:** রিভিউ ধাপে ও ডেস্কটপ রেলে **“২টি দোকান · ২টি অর্ডার”** কার্ড — দোকানের নাম, পণ্য, নিজের ডেলিভারি (ফ্রি হলে কে দিল), ছাড়, পার্সেল-টোটাল; “Ready in X min” এখন **সবচেয়ে ধীর** রান্নাঘরের সময়। রশিদে প্রতিটি অর্ডার নম্বর + দোকানের নাম ও “২টি ডেলিভারি আসবে”। ব্যাগের হেডারে আর “আলাদা করে চেকআউট করুন” নেই — “এক ট্যাপে ২টি অর্ডার হবে”।

**সীমা:** এক চেকআউটে সর্বোচ্চ **৩টি** দোকান (`ps_multi_order_max_shops()`), বেশি হলে আগেই স্পষ্ট বার্তা।

**একটা পর্যবেক্ষণ:** স্মার্ট কার্ডের নিয়ম “প্রতি অর্ডারে ১ স্ট্যাম্প” — তাই এক চেকআউটে ২ অর্ডার হলে ২ স্ট্যাম্প জমবে। চাইলে পরে “প্রতি চেকআউটে ১ স্ট্যাম্প” করা যায় (আলাদা আইটেম)।

**টেস্ট:** ৪টি নতুন ফাইলে **৩০টি** (`multi-shop.test.ts` ১৪, `orders-multi-shop.test.ts` ৮, `shop-split-card.test.tsx` ৬, `checkout-multi-shop.test.tsx` ২) + আগের orders-route টেস্টে এক্সটেনশন; `tsc` ও `eslint` পরিষ্কার; **পুরো স্যুট ৩৪৯ ফাইল / ২২৬৫ টেস্ট EXIT=0**।

---

## C3 — প্রতি-দোকানের অ্যাডমিন ডিটেইল পেজ (`/admin/shops/<id>`) (কমিট `0ac82f7`)

**সমস্যা:** “ওই দোকানটা কেমন করছে?” — এর উত্তর দিতে হতো চারটি ট্যাব: শপস কিউ (বিবরণ), প্রোডাক্ট লিস্ট (দোকান দিয়ে ফিল্টার), অর্ডার লিস্ট (দোকান দিয়ে ফিল্টার), আর পেআউট বোর্ড (কত টাকা পাওনা)। মাঝখানে মানুষের মাথায় হিসাব।

**যা বানালাম:** শপস কিউ-তে প্রতিটি দোকানের নিচে নতুন **“Open file →”** লিংক — এক পর্দায় পুরো ফাইল।

**পেজের গঠন — প্রথমে যা দরকার:**
1. **Needs attention (উপরে):** খারাপ থেকে কম খারাপ — আবেদন অপেক্ষমাণ, সাসপেন্ড (কারণসহ), **কোনো ডেলিভারি জোন নেই** (তাহলে অর্ডার পৌঁছায়ই না), কিছুই পাবলিশ নেই, **বুক করা ছুটি** (B6 — “১০–১২ Oct, দোকান নিজেই খুলবে”), ভেরিফাই নেই (B5), **কোনো owner লগইন নেই** (C1), টাকা ১৪ দিনের বেশি পড়ে আছে, মডারেশনের অপেক্ষায় থাকা রিভিউ।
2. **চারটি সংখ্যা:** অর্ডার (কতগুলো খোলা), ক্রেতার কাছ থেকে আদায় (বাতিল বাদ), দোকানকে দেওনা (আর্ন − পেইড), রেটিং।
3. **ছয়টি কার্ড:** Shop (প্রোফাইল), Who can sign in (C1 রোস্টার — owner আগে), Catalog (live/draft/hidden/no stock + সাম্প্রতিক), Orders (সাম্প্রতিক + গন্তব্য), Money (earned/paid/owed + সাম্প্রতিক পেআউট), Reviews (গড় + দোকানের রিপ্লাই)।

**দুটি জিনিস ইচ্ছে করেই আলাদা রাখা হয়েছে:** ক্রেতার কাছ থেকে **আদায়** (revenue, বাতিল বাদ) আর দোকানের **আয়** (ledger payable) — এগুলো এক নয়; পেজে দুটো আলাদা লেবেলে আছে, কেউ ভুল করবেন না।

**নিরাপত্তা ও সততা:** `GET /api/admin/shops/[id]` **শুধু admin/super_admin** (ফাইলে মালিকের লগিন ও লেজারের টাকা আছে; ম্যানেজারের স্ক্রিনে তা আসবে না)। দোকান না থাকলে **404** — “কখনো অর্ডার হয়নি” দেখতে যেন না মনে হয়। প্রতিটি তালিকা ক্যাপ করা (`orders` ৫০০, `products` ৫০০, লেজার ২০০০), আর ক্যাপ লাগলে পেজে লেখা থাকে “শেষ ৫০০টি” — পুরো ইতিহাস অর্ডার পেজে।

**টেস্ট:** ৪টি নতুন ফাইলে **৪৩টি** — `shop-dossier.test.ts` ১৯ (নিয়ম: হেলদি দোকানে কিছুই নয়; ছুটি = তারিখ, ত্রুটি নয়; বুক করা ছুটিও জানানো হয়; কখনো পেমেন্ট না হলে/১৫ দিন পড়ে থাকলে; সবচেয়ে খারাপটা প্রথমে), `db/__tests__/admin-shop.test.ts` ১১ (অন্য দোকানের টাকা/পণ্য/রিভিউ যেন না আসে; বাতিল অর্ডার revenue-এ নয়; owner আগে), `shop-detail-route.test.ts` ৪ (admin-only গেট, ৪০৪, ডেটাবেস পড়া ফেল করলে ৪০৪), `shop-detail-page.test.tsx` ৯ (সংখ্যা, লেবেল, ফ্ল্যাগের ক্রম, দোকান নেই বলা)। `tsc` ও `eslint` পরিষ্কার; **পুরো স্যুট ৩৫৩ ফাইল / ২৩০৮ টেস্ট EXIT=0**।

**পাশাপাশি দুটো টেস্ট সারানো হয়েছে (আগের ঋণ):**
- `use-notifications` টেস্ট তার নিজের প্রথম পোলের সাথে দৌড়াত — প্রতি তিন রানে একবার ফেল করত। এখন হুকের আউটপুট (`unread`) দেখে বেসলাইনের জন্য অপেক্ষা করে; ১০ রান একটানা সবুজ।
- `vendor-vacation-patch` টেস্টে “today” তারিখ হার্ডকোড ছিল (`2026-09-28`), তাই পরদিন সকালেই ফেল করা শুরু করল — “আজ শুরু হওয়া ছুটি” আর আজ ছিল না। এখন ঘড়ি থেকে নেওয়া (মডিউলের মতো UTC), অর্থাৎ টেস্টটা শেষ মেয়াদহীন।

---

## C4 — Commission পরিবর্তনের audit trail: “রেট কত” নয়, “রেটটা কে বদলালো” (কমিট `ed94b39`)

**সমস্যা:** দোকানের ফাইলে commission-এর ঘরে একটাই সংখ্যা থাকত — ধরা যাক ১২.৫%। কিন্তু প্রশ্নগুলোর উত্তর কোথাও ছিল না: কবে থেকে এই রেট? আগে কত ছিল? কে বদলেছে? মালিক ফোন করলে (“আমার রেট বাড়ানো হয়েছে!”) অ্যাডমিনের হাতে কোনো প্রমাণ ছিল না — না তারিখ, না নাম।

**মূল সিদ্ধান্ত (এটাই সবচেয়ে গুরুত্বপূর্ণ): ইতিহাস লেখে স্ক্রিন নয়, ডেটাবেস।** অর্থাৎ ভবিষ্যতে রেট যেভাবেই বদলুক — অ্যাডমিন প্যানেল থেকে, কোনো স্ক্রিপ্ট থেকে, সরাসরি SQL থেকে — লাইনটা পড়েই থাকবে। স্ক্রিন থেকে লিখলে একদিন একটা পথ এমনই বাদ পড়ে যেত।

**মাইগ্রেশন `supabase/migrations/202609290001_commission_audit.sql`:**
- নতুন টেবিল `public.shop_commission_history` — `old_pct` (খালি থাকতে পারে), `new_pct`, `actor_id`, `actor_email`, `created_at`; `new_pct` যেন ০–৯০-এর মধ্যে থাকে, আর রেট সত্যিই না বদললে লাইন পড়বে না; `(shop_id, created_at desc)`-এ ইনডেক্স।
- ট্রিগার `ps_audit_shop_commission()` — `public.shops`-এ **INSERT** ও **commission_pct-এর UPDATE**-এ ঘটে। দোকান যে রেটে যোগ দিলো সেটা `old_pct` খালি রেখে এক লাইনে পড়ে (“Started at 15%”)। দোকানের **নাম বদলালে** বা একই রেট আবার সেভ করলে **কিছুই লেখা হয় না** — নাহলে ইতিহাস ফাঁকা লাইনে ভরে যেত।
- **কে বদলালো:** লেখাটা যে সেশন থেকে এসেছে, সেখান থেকেই (`auth.uid()` + `ps_actor_email()`)। **রিকোয়েস্ট-বডি থেকে কখনো নয়** — তাহলে যে বদলায় সে নিজের নাম লিখতে পারত। কোনো স্টাফ সেশন জোড়া না থাকলে লাইন **তবুও** লেখা হয়, শুধু actor খালি থাকে — কারণ “রেট বদলেছে, কেউ লগইন করা ছিল না” এই কথাটাই সত্যি, লুকানোর বিষয় নয়। claims-এর স্ট্রিং পড়া না গেলে (`''` বা আবর্জনা) যেন লেখাটাই বন্ধ না হয়ে যায় — তাই `ps_actor_email()` plpgsql-এর exception হ্যান্ডলারসহ লেখা।
- **Append-only (মোছা যাবে না):** RLS চালু, `select`/`insert` শুধু স্টাফদের (`ps_is_admin()`; ওই সারিতে সহকর্মীর ইমেইল আছে), **update/delete-এর কোনো পলিসিই নেই**, আর উপরে ট্রিগার `trg_commission_history_no_rewrite` — UPDATE সোজা নিষিদ্ধ; DELETE কেবল তখনই যখন দোকানটাই আর নেই (ক্যাসকেড), অর্থাৎ দোকান মুছলে ইতিহাসও যায়, কিন্তু ইতিহাস আলাদা করে মোছা যায় না।

**পড়ার দিক:**
- `src/lib/db/commission-audit.ts` — `listCommissionHistory`, পুরনো থেকে নতুন, ১০০ লাইন; **ইচ্ছে করেই কোনো writer ফাংশন নেই** — এই টেবিলে কেউ সরাসরি লিখবে না।
- `GET /api/admin/shops/[id]/commission` — শুধু admin/super_admin। **মাইগ্রেশন ইনস্টল না থাকলে ৪০৩ নয়, ৫০৩** — “রেট কখনো বদলায়নি” আর “ইতিহাসের ব্যবস্থা বন্ধ” যেন একরকম না দেখায়।
- `admin-shop.ts` এই পড়াটা ফাইলের ৭ম রিড হিসেবে যোগ করেছে, আর টেবিল না থাকলে `available: false` দেয় — বাকি পেজ ঠিকঠাক খুলবে, শুধু কার্ডে একটা সতর্ক বার্তা।
- `shop-dossier.ts`: `pctLabel` (১২.৫% — ভগ্নাংশ থাকলে তবেই দেখাবে), `commissionChangeLabel` (“Started at 15%” / “15% → 12.5%”), `commissionActorLabel` (ইমেইল / “a staff session (no e-mail on file)” / “nobody was signed in”), `commissionTrailSummary`, আর **দুটো নতুন ফ্ল্যাগ**: `commission-raised` (রেট **বাড়া**, ৩০ দিন দেখানো হয় — `COMMISSION_RAISE_WINDOW_DAYS`; বাড়া নিয়ে মালিকের প্রশ্ন আসে তাই) ও `commission-trail-missing` (ইতিহাসের টেবিল নেই)। **রেট কমলে কখনো ফ্ল্যাগ হয় না।**

**স্ক্রিন:** দোকানের ফাইলে Money-র পরে নতুন **“Commission”** কার্ড — উপরে বর্তমান রেট, “শুরু ১৫% থেকে · ২টি বদল” মতো সারাংশ, নিচে প্রতিটি বদল: `15% → 12.5%`, কে, কবে (পূর্ণ তারিখ)। **গোনা হয় “বদল” (line − 1)**, লাইন নয় — যোগ দেওয়াটা কোনো বদল নয়। ইতিহাস বন্ধ থাকলে “History is not switched on…” বার্তা।

**টেস্ট:** ৪টি ফাইলে **১৬টি নতুন** — `shop-dossier.test.ts` ৫ (বাড়া ফ্ল্যাগ হয়, কমা হয় না, ৬০ দিন পুরনো বাড়া আর দেখানো হয় না, ইতিহাস নেই বার্তা, লেবেল/সারাংশ), `db/__tests__/admin-shop.test.ts` ৫ (টেবিল না থাকলে পেজ ভাঙে না; ভিন্ন খাতা, ভিন্ন মান), `shop-commission-route.test.ts` ৪ (admin-only গেট, ফাঁকা id-তে ৪০০, মাইগ্রেশন নেই → ৫০৩), `shop-detail-page.test.tsx` ২ (কার্ডে লাইনগুলো, সতর্ক বার্তা) — মোট পেজ টেস্ট ১১। `tsc --noEmit` ও `eslint --max-warnings=0` পরিষ্কার; **পুরো স্যুট ৩৫৪ ফাইল / ২৩২৯ টেস্ট EXIT=0**।

---

## C5 — দোকান-স্কোপড পণ্য-স্লাগ: একই নাম, দুই দোকান, দুই ঠিকানা (কমিট `ff8faf1`)

**সমস্যা:** আগে `products.slug` পুরো প্ল্যাটফর্মে একটাই হতে হতো। “cotton-panjabi” এক দোকানে থাকলে অন্য দোকান একই নাম দিয়ে পণ্য তুলতে পারত না — এমনকি তার নিজের দোকানে ওই পণ্য কখনো ছিল না। ক্রেতার নাম না, ডেটাবেসের গ্লোবাল নিয়ম বাধা দিচ্ছিল।

**সিদ্ধান্ত:** পণ্যের ঠিকানা এখন দোকান + পণ্য মিলিয়ে — **`/shops/<shop-slug>/p/<product-slug>`**। যেমন একই `cotton-panjabi` এখন `/shops/first-shop/p/cotton-panjabi` ও `/shops/second-shop/p/cotton-panjabi` — দুইটাই সত্যিকারের আলাদা পৃষ্ঠা। SKU কিন্তু এখনো পুরো প্ল্যাটফর্মে আলাদা, কারণ গুদাম/রিপোর্টে সেটাই পণ্যের কোড।

**একটা ছোট মাইগ্রেশন (`supabase/migrations/202609290002_shop_scoped_slugs.sql`):**
- `products.slug`-এর গ্লোবাল unique constraint সরিয়ে `(shop_id, slug)` unique — একই দোকানে একই slug এখনো চলবে না; আলাদা দোকানে চলবে। `sku`-র গ্লোবাল unique-এ হাত দিইনি।
- Wishlist-এ আগে পণ্য চেনা হতো শুধু slug দিয়ে। একই নামে দুই দোকান হলে দুটো পণ্যের কোনটা সেভ করা — তা বোঝা যেত না। তাই `storefront_saved_items`-এ ছোট `product_id` FK যোগ, আগের সব saved row-তে তাদের আসল product id backfill, পুরনো `(customer_id, product_slug)` key-এর বদলে `(customer_id, product_id)` unique। ফলে একই নামের দুই দোকানের দুটো জিনিসই আলাদা করে সেভ করা যায়, পণ্য মুছলে saved row নিজে থেকেই যায়। **কোনো slug-alias/history table, duplicate product বা URL-র কপি জমাইনি** — ঠিকানায় দোকানটা থাকায় name-ই যথেষ্ট; অতিরিক্ত জিনিস স্টোর করতে হয়নি।

**পুরনো লিংক বাঁচানো (SEO ও শেয়ার):** ` /product/<slug> ` ঠিকানাটা সরাইনি — WhatsApp/Facebook-এর পুরনো শেয়ার, push notification, রিপোর্ট, QR code এখনো ওখানে আসতে পারে। slug যদি এক দোকানেই থাকে, Next.js permanent **308** redirect নতুন দোকান-স্কোপড ঠিকানায় পাঠায় (স্থায়ী স্থানান্তর; দুই কপি পেজ index নয়)। একই নাম একাধিক দোকানে থাকলে অনুমান করে ভুল পণ্য খোলার বদলে “কোন দোকান?” বেছে নেওয়ার ছোট পৃষ্ঠা। আর দোকানটি storefront-এ না থাকলেও পুরনো পণ্যের পৃষ্ঠা খোলা থাকে — ভাঙা লিংক নয়।

**যে জায়গাগুলো নতুন ঠিকানা পায়:** প্রোডাক্ট কার্ড/সার্চ, ব্যাগ ও কার্ট, wishlist/recently viewed, quick-add, লাইভ শো, bundle, রিভিউ/রিভিউ-আস্ক — দোকান জানা থাকলে সরাসরি নতুন লিংক। WhatsApp-এ নিজের দোকানের নামসহ নতুন ঠিকানা; Meta/Google ফিড, sitemap ও canonical/OG metadata-তেও নতুন ঠিকানা। যেসব push/report-এ দোকান থাকে না, তারা পুরনো কিন্তু কাজ-করা ঠিকানা ব্যবহার করে; সেটা সঠিক দোকানে redirect বা অস্পষ্ট হলে chooser দেখায়। পুরনো preview-তেও একই নামের দোকান থাকলে আর এলোমেলো একটি দোকানের ছবি/দাম দেখায় না।

**টেস্ট:** নতুন **২৫টি** — `product-url.test.ts` ১০, `storefront-c5.test.ts` ৫, পুরনো লিংকের ৪ (unique→permanent redirect, একই slug→দোকান বাছাই, unknown→404, storefront-এর বাইরে থাকা দোকানেও পৃষ্ঠা), wishlist-এ ৪টি, একই দোকানে duplicate slug প্রত্যাখ্যান ১টি (অন্য দোকানের একই slug-এ রাখা পুরনো test নতুন নিয়মমতো বদলানো), ও feed canonical URL ১টি। PGlite-এ bootstrap + **৪৭টি migration** চালিয়ে ১২টি DB check: দুই দোকানে একই slug চলে; একই দোকানে চলে না; SKU একই হতে পারে না; পুরনো saved row backfill হয়; একই জিনিস দুবার saved হয় না; product delete হলে saved row সাফ। `tsc --noEmit`, `eslint --max-warnings=0`, `git diff --check` পরিষ্কার; production build EXIT=0; **পুরো স্যুট ৩৫৭ ফাইল / ২৩৫৪ টেস্ট EXIT=0**।

---

## C6 — ভেন্ডরের নিজের subcategory: platform-এর টপ-লেভেল রেখে দোকানের নিজস্ব নাম (কমিট `741d122`)

**সমস্যা:** পণ্যের টপ-লেভেল category (যেমন Men/Women) PROSANTI-র নিয়ন্ত্রণে — এটা ঠিকই আছে। কিন্তু দোকানের নিজের সাজানোর নাম (যেমন “Eid edit”, “Office wear”) ছিল শুধু ফর্মের free-text। অন্য পণ্যে আবার ব্যবহার করতে নাম মনে রেখে টাইপ করতে হতো; দোকানের নিজের কোনো সংরক্ষিত তালিকা ছিল না।

**যা বানালাম:**
- **Top-level category বদলায়নি।** নতুন `shop_product_categories` টেবিলে প্রতিটি দোকান একটি platform category-র নিচে নিজের subcategory নাম যোগ করে; পণ্য আগের মতোই `category_id` + `subcategory`-তেই সেভ হয়। কোনো existing product field, storefront catalog shape বা URL বদলায়নি।
- `GET /api/vendor/categories` এখন platform category-র সঙ্গে ওই দোকানের নিজের subcategory-ও ফেরত দেয়; `POST` নতুন subcategory যোগ করে। শুধু নিজের shop-এর verified vendor session (owner/staff) — RLS-ও নিজের shop-এ সীমা দেয়; top-level category active না হলে database ও API দুই দিকেই বারণ। একই category-তে একই নাম দ্বিতীয়বার যোগ করলে **409**।
- `/vendor/products`-এ **“Your shelves → Product subcategories”** কার্ড: platform category বেছে নতুন নাম যোগ, নিজের যোগ করা নামের তালিকা। Product add/edit ফর্মের subcategory autocomplete-এ ওই নামগুলো দেখা যায়; লেখাটি free-text-ই থাকে, তাই পুরনো পণ্য/অস্বাভাবিক নামও নষ্ট হয় না। Vendor editor-এ নিজের option যোগের পথ দেখানো হয়েছে।
- `supabase/migrations/202609290003_vendor_product_categories.sql`: FK ও cascade, (shop, parent category, lowercase name)-এ duplicate guard, vendor-only SELECT/INSERT RLS; আলাদা UPDATE/DELETE permission নেই — ভুল করে পণ্য ব্যবহার করছে এমন নাম মুছে ফেলার ঝুঁকি নেই।

**টেস্ট:** ২টি নতুন ফাইলে **৮টি** — `vendor-categories.test.ts` ৫ (platform category অক্ষত, shop-এর নিজস্ব তালিকা, trim/validate, disabled parent, duplicate), `category-manager-card.test.tsx` ৩ (যোগ, category-সহ তালিকা, duplicate error); vendor route-এর “সেশন নেই → ৪০১” গার্ডেও POST যোগ। PGlite-এ fresh bootstrap + **৪৮টি migration**: নিজের subcategory যোগ/পড়া, অন্য দোকানে লেখা আটকানো, পণ্য আগের `subcategory` text field-এই থাকে — **৩টি migration/RLS check**। `tsc --noEmit`, `eslint --max-warnings=0`, `git diff --check` পরিষ্কার; production build EXIT=0; **পুরো স্যুট ৩৫৯ ফাইল / ২৩৬২ টেস্ট EXIT=0**।

---

## পরের আইটেম
**ব্যাচ A শেষ** ✅ → **B1–B6 শেষ** ✅ → **C1 শেষ** ✅ (`5ac9d35`) → **C2 শেষ** ✅ (`fa7ebc5`) → **C3 শেষ** ✅ (`0ac82f7`) → **C4 শেষ** ✅ (`ed94b39`) → **C5 শেষ** ✅ (`ff8faf1`) → **C6 শেষ** ✅ (`741d122`) → ব্যাচ C-এর শেষ আইটেম **C7: Product CSV import/export**।
