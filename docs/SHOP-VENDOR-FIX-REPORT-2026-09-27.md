# রিপোর্ট — দোকান তৈরি · শপ ম্যানেজমেন্ট · ড্যাশবোর্ড · প্রোডাক্ট অ্যাড

**তারিখ:** ২৭ সেপ্টেম্বর ২০২৬
**প্ল্যান:** `docs/SHOP-VENDOR-FIX-PLAN-2026-09-27.md` (আপনার অনুমোদিত)
**শাখা:** `arena/01a0e3b1-bhromor`

**যাচাই:**
- `npx tsc --noEmit` → পরিষ্কার (কোনো এরর নেই)
- `npx vitest run` → **৩০১ ফাইল / ১৮৬৩ টেস্ট পাস, ০ ফেল** (আগের ব্যাসলাইন ২৯৫/১৮২৩; ফাইনাল এই রানে নতুন সব টেস্টসহ পুরো স্যুট একবারে সবুজ)
- `npx eslint` (না*ছোঁয়া* সব ফাইল: vendor/*, admin/shops|orders|products, quick-add, vendor-dashboard, product-editor) → **০ error, ০ warning**
- PGlite-এ আসল স্কিমা (bootstrap-fresh + ২০২৬-০৯-২৬/২৭-এর migration) চালিয়ে দুটো constraint প্রমাণ করা হয়েছে (নিচে ফেজ ১-এ)

---

## ফেজ ১ — জরুরি বাগ (B1–B6 + B7)

### B1 · ভেন্ডর এখন নিজে ছবি আপলোড করতে পারে ✅
- **নতুন রুট:** `src/app/api/vendor/media/sign/route.ts` — শুধু ভেন্ডর সেশন, ফোল্ডার কেবল `prosanti/products` + `prosanti/shops` (অন্য কিছু হলে ডিফল্ট), image/video দুটোই, Cloudinary সেট না থাকলে সৎভাবে `503 {code:"NOT_CONFIGURED"}`।
- `src/components/admin/media-uploader.tsx:33,44,74` — `signPath` prop (ডিফল্ট আগেরমতো `/api/media/sign`)।
- `src/components/admin/product-editor.tsx:833-834` — এডিটর এখন `mediaSignPath`/`mediaFolder` নেয়; ভেন্ডর পেজ দুটো (`/vendor/products/new`, `/vendor/products/[id]`) `/api/vendor/media/sign` পাঠায়।
- `src/app/vendor/settings/page.tsx:17,195,215` — লোগো ও কভার এখন **আপলোড** করা যায় (আগে URL-ই একমাত্র পথ ছিল), ফোল্ডার `prosanti/shops`।

### B2 · দ্বিতীয় দোকান একই নাম/SKU-তে আটকায় না ✅ (আপনার বেছে নেওয়া “অটো-ইউনিক”)
- `src/lib/db/admin.ts:1058` — `duplicateProductColumn()` 23505 বার্তা পড়ে বোঝে slug না SKU ধাক্কা খেয়েছে।
- `src/lib/db/admin.ts:1125` — createProduct এখন ≤৪০ বার চেষ্টা করে, `slugFor()`/`skuFor()` দিয়ে `-2`, `-3`… বসায়; যেটা সংঘর্ষ করেনি সেটা অপরিবর্তিত থাকে; শেষ পর্যন্ত না পারলে বাংলা 409 (“এই লিংক/SKU … আলাদা শব্দ দিন”)।
- `src/lib/db/admin.ts:1308` — update (এডিট) পথেও ফিল্ড-ভিত্তিক স্পষ্ট 409।
- **PGlite প্রমাণ:** Shop B-র একই slug → `duplicate key value violates unique constraint "products_slug_key"`; একই SKU → `"products_sku_key"`; সাফিক্স দেওয়া `panjabi-2` ঠিকঠাক insert হয়।

### B3 · সাইজ/কালার বদলালেও সেভ ব্যর্থ হয় না ✅
- `src/lib/db/admin.ts:893` — retire করা reserved রো-এর SKU ফাঁকা (`sku: null`) হয় → নম্বর রিসাইকেল করা যায়।
- `src/lib/db/admin.ts:908` — `nextVariantSku()` সবচেয়ে কম ফাঁকা `-V{n}` খুঁজে নেয় (৫০০ পর্যন্ত), insert-এ ৩ বার রিট্রাই (`:960`)।
- **PGlite প্রমাণ:** `reserved=2` রো SKU ধরে রাখলে নতুন সাইজ → `"product_variants_sku_key"`; রিলিজ করার পর একই SKU-তে নতুন সাইজ insert সফল।

### B4 · সেভ ব্যর্থ হলে আসল কারণ এখন স্ক্রিনে ✅ **(এবং এর সাথে আরেকটা লুকানো বাগ ধরা পড়েছে)**
- `src/lib/use-vendor.ts:343`, `src/lib/use-catalog.ts:104` — saveProduct আসল API বার্তা `throw` করে।
- `src/components/admin/product-editor.tsx:364` — এডিটর সেটাই দেখায়; `src/app/admin/inventory/page.tsx` — স্টক কমিটও একই বার্তা দেখায়।
- **নতুন ধরা পড়া বাগ (আপনার “Save চাপলে কিছুই হয় না”-র সরাসরি কারণ):** `src/components/admin/product-editor.tsx:158`-এর `set()` helper প্রতিবার `error: null` লিখত, আর `save()` ভ্যালিডেশন ব্যর্থতায় `set("error", …)` ডাকত → **মেসেজ নিজেই মুছে যেত, স্ক্রিনে কিছুই আসত না**। তিন জায়গা ঠিক করা হয়েছে (`:289`, media-add পথ দুটো), আর `set()` এখন `error` কী নিতে পারে না (`Exclude<keyof Draft, "error">`) যাতে ভবিষ্যতে ফের না হয়।

### B5 · ফোন নম্বর: `+880`/`88`/বাংলা ডিজিট সব চলে ✅
- সার্ভার: `src/lib/db/marketplace.ts:22,111,123`, `src/lib/db/riders.ts:38,174,189`, `src/lib/db/admin.ts:2500-2501` — `normalizeBdPhone(asciiDigits(...))` + `isPlausibleBdPhone`।
- ফর্ম: `src/app/(site)/shops/apply/page.tsx:18,66,73`, `src/app/rider/apply/page.tsx:18,65,72` — একই helper, তাই ক্লায়েন্ট-সার্ভার আর কখনো দ্বিমত করবে না।

### B6 · “Cancel” আর অ্যাডমিন প্যানেলে যায় না ✅
- `src/components/admin/product-editor.tsx:127,1046` — `cancelTo` prop; ভেন্ডর পেজ `/vendor/products` পাঠায়।

### B7 · দশম “একই নামের” দোকানও এখন আবেদন করতে পারে ✅
- `src/lib/db/marketplace.ts` — slug লুপ `-2 … -49`, তারপরও সংঘর্ষ হলে র‍্যান্ডম tail; সংঘর্ষে বাংলা 409 বার্তা।

---

## ফেজ ২ — ভেন্ডর ড্যাশবোর্ড + শপ ম্যানেজমেন্ট

### ড্যাশবোর্ড
- **কাজের ভাগ স্পষ্ট:** “To confirm” / “Being prepared” / “Ready for rider” আলাদা কার্ড + **১০ মিনিটের বেশি পড়ে থাকা অর্ডারে ⚠ late সতর্কতা** (`src/lib/vendor-dashboard.ts`, `src/app/vendor/page.tsx`)।
- **আজকের হিসাব:** অর্ডার সংখ্যা, অর্ডার-ভ্যালু औসত (AOV), বাতিল — `todayStats()`।
- **নতুন অর্ডারের ঘণ্টা:** ড্যাশবোর্ড খোলা থাকলে নতুন অর্ডারে beep + কম্পন + সার্ভিস-ওয়ার্কার নোটিফিকেশন, tap-এ permission (`src/lib/use-vendor-order-alert.ts`, `src/lib/panel-beep.ts`)। চাইলে টেস্ট/বন্ধ করা যায় — ড্যাশবোর্ডেই বাটন।
- **নিজের দোকান:** স্টোরফ্রন্ট লিংক + Share + ফ্রি-ডেলিভারি অফারের চিপ।
- **Restock soon** কার্ড: low/out প্রোডাক্টের লিস্ট, এক ট্যাপে এডিটরে।
- **অনবোর্ডিং চেকলিস্ট** আর ভুল “Open the shop” বাটন দেখায় না — pending/rejected দোকানে “Waiting on staff” (`src/lib/vendor-onboarding.ts`, `src/components/vendor/onboarding-checklist.tsx`)।

### শপ ম্যানেজমেন্ট (Admin → Shops)
- **সার্চ** (নাম/ফোন/ইমেইল/slug), **পেজিনেশন**, **bulk approve/suspend**, pending আবেদনে **“waiting N days”** ব্যাজ (২+ দিন হলে লাল)।
- **প্রতি-দোকানের গভীর লিংক:** “This shop's products →” (`/admin/products?shop=…`) ও “Orders →” (`/admin/orders?shop=…`)। অর্ডার ফিল্টার সার্ভার-সাইড (`src/app/api/admin/orders/route.ts`, `src/lib/use-orders.ts`) — পেজিনেশনে পুরোনো অর্ডারও বাদ পড়ে না।
- **zone ছাড়া active দোকানে সতর্কতা** + New shop ফর্মেই zone/commission/prep (`src/app/admin/shops/page.tsx`)।
- **B9 হালকা লিস্ট:** প্রতি দোকানের প্রোডাক্ট-সংখ্যা এখন `HEAD` count দিয়ে (আগে প্রতিটি প্রোডাক্ট রো নামাত) — `src/lib/db/admin.ts:1977+`।
- **B10 ফোন দিয়ে vendor/rider লিংক:** `src/app/api/admin/shops/[id]/link-vendor/route.ts`, `src/app/api/admin/riders/[id]/link-rider/route.ts` — ইমেইল বা মোবাইল দুটোই চলে (সিন্থেটিক ফোন-লগইন অ্যাকাউন্টও খুঁজে পায়)।

---

## ফেজ ৩ — দোকান তৈরির আপডেট + প্রোডাক্ট অ্যাড আপগ্রেড

- **⚡ Quick add (`/vendor/products/quick`):** ছবি + নাম + দাম + স্টক + (ঐচ্ছিক) সাইজ — এক পর্দায়। ক্যাটাগরি ডিফল্ট, slug/SKU অটো (**কখনো ক্ল্যাশ করবে না**), পাবলিশের আগেই “কমিশন কাটার পর আপনি পাবেন ≈ …” দেখায়। যুক্তি আলাদা মডিউলে (`src/lib/quick-add.ts`) তাই টেস্ট করা।
- **ছবি ছাড়া Draft সেভ (B8):** `src/components/admin/product-editor.tsx:248` — publish-এ ছবি বাধ্যতামূলকই আছে (shelf-এর `publishBlocker`), কিন্তু draft এখন ছবি ছাড়া সেভ হয়; পরে ছবি তুলে publish করা যায়।
- **আবেদন ফর্ম:**
  - **শর্তে সম্মতি চেকবক্স** (কমিশন ~১৫%, সেটেলমেন্ট, ডেলিভারি/রিটার্ন) — আগে কমিশনের কথা ফর্মে একবারও ছিল না; টেস্ট প্রমাণসহ (`shop-apply.test.tsx` → “সম্মতি না দিলে সাবমিটই হয় না”)।
  - **prep-time সীমা এক** (৫–২৪০, আগে ফর্মে ৪৫ ছিল)।
  - **সফলতার পর্দায় “এরপর কী হবে”** — অনুমোদন একই দিনে, খবর আপনার মোবাইলে ({নম্বর}), তারপর প্রোডাক্ট।

---

## টেস্ট (নতুন)
`src/app/api/__tests__/vendor-media-sign.test.ts` · `src/lib/db/__tests__/product-unique.test.ts` · `src/components/admin/__tests__/product-editor-save-errors.test.tsx` · `src/lib/__tests__/vendor-dashboard.test.ts` · `src/lib/__tests__/use-vendor-order-alert.test.tsx` · `src/lib/__tests__/quick-add.test.ts` · `src/lib/db/__tests__/apply-signup.test.ts` (+ফোন), `src/lib/__tests__/vendor-onboarding.test.ts` ও `src/components/vendor/__tests__/onboarding-checklist.test.tsx` (pending দোকান), `src/components/admin/__tests__/applicant-login-box.test.tsx` (ইমেইল বা মোবাইল)।

---

## যা এই রাউন্ডে করা হয়নি (আলাদা রাউন্ডের জন্য)

| # | কী | কেন এখন করা হয়নি |
|---|---|---|
| ১ | **প্রতি-দোকানের ডিটেইল পেজ** (প্রোফাইল+ক্যাটালগ+অর্ডার+লেজার+পেআউট+রিভিউ ট্রেইল এক স্ক্রিনে) | বড় কাজ; এখন দোকান-ভিত্তিক ফিল্টার করা লিংক দিয়ে একই তথ্যে পৌঁছানো যায় |
| ২ | **কমিশন বদলের অডিট** (কে/কখন/আগে কত %) | নতুন ছোট migration দরকার (`shop_commission_audit`) — এই রাউন্ডে migration-ফ্রি রাখতে চেয়েছি |
| ৩ | **B14 — ভেন্ডর নিজে staff অ্যাকাউন্ট খুলতে পারা** | auth অ্যাকাউন্ট তৈরি + owner-গেট; আলাদা রাউন্ডে টেস্টসহ |
| ৪ | **B15 — ভেন্ডরের নিজের category/sub-category** | টপ-লেভেল ক্যাটাগরি প্ল্যাটফর্মের মালিকানা; সাব-ক্যাটাগরি ইতিমধ্যে ফ্রি-টেক্সট |
| ৫ | **Bulk price/stock এডিট** | Quick add + per-size স্টক আগে; বাল্ক UI পরের ধাপ |
| ৬ | **আবেদনের সময়ে লোগো/ছবি আপলোড** | বেনামি ইউজারের জন্য Cloudinary sign রুট খুললে abuse-ঝুঁকি; নিরাপদ ডিজাইন আলাদা করে ভাবা দরকার |
| ৭ | **মালিকের নাম / দোকানের ধরন** | `shops`-এ নতুন কলাম = migration |
| ৮ | **শপ-ভিত্তিক slug (প্ল্যানের অপশন খ)** | আপনার সিদ্ধান্তে পিছিয়ে রাখা হয়েছে (PDP URL বদলাবে) |

---

## আপনার জন্য পরের ধাপ
1. **লাইভ ডেটাবেসে নতুন migration লাগবে না** — এই রাউন্ডের সব কিছু অ্যাপ-লেয়ারে; শুধু কোড deploy করলেই চালু।
2. ডিপ্লয়ের পর দুটো দোকান দিয়ে একই নামের প্রোডাক্ট অ্যাড করে দেখুন (B2), আর একটা **অর্ডার হওয়া** প্রোডাক্টের সাইজ বদলে সেভ করুন (B3)।
3. উপরের “যা করা হয়নি” তালিকা থেকে পরের রাউন্ডে কোনটা চান জানান।
