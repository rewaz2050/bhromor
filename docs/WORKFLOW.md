# ৪ রোলের ওয়ার্কফ্লো — কে কখন কী করবে

> **কেন এই ফাইল:** "admin, shop, rider, customer — কার্টাসোলে কাজটা হচ্ছে না, workflow
> ঠিক নাই" — এটা ঠিক করার আগে একটা **রেফারেন্স ম্যাপ** দরকার: কোন স্টেপে কোন রোল
> কোন বাটন চাপবে, তারপর কী হবে। এই ফাইলে দুইটা মডেল দেওয়া:
>
> - **মডেল A** — স্ট্যান্ডার্ড e-commerce / hyperlocal delivery workflow (যেভাবে
>   Daraz / Foodpanda / Pathao Food চলে)।
> - **মডেল B** — সহজ সিস্টেম (৩ স্টেপ, এক বোর্ড) — ছোট দোকান / ২–৩ জন রাইডারের
>   জন্য, যেখানে একজনই admin + shop সামলায়।
>
> দুইটাই **এই repo-তে যা আছে সেটার ওপর ভিত্তি করে লেখা** — প্রতিটা দাবির পাশে
> ফাইলের নাম আছে, যাচাই করা যায়।

---

## ০. প্রথমে: এই repo-তে এখন কী অবস্থা (যাচাই করা)

| চেক | ফলাফল | কীভাবে দেখলাম |
|---|---|---|
| Unit + component tests | **1210 tests pass, 183 files** | `npx vitest run` |
| Order state machine (pure logic) | **25 tests pass** | `npx vitest run src/lib/__tests__/orders.test.ts` |
| Role route tests (rider/vendor/staff/customer/orders) | **26 tests pass** | `npx vitest run src/app/api/__tests__/{rider,vendor,staff,customer,orders}-routes.test.ts` |
| Backend connected? | **না** — এই checkout-এ `.env.local` নেই, শুধু `.env.example` আছে | `ls -la .env*` → শুধু `.env.example` |

**এটা গুরুত্বপূর্ণ:** এই অ্যাপ **live-only** — demo mode নেই। Supabase key ছাড়া
`POST /api/orders` সরাসরি `503 "Online ordering is not set up yet."` দেয়
(`src/app/api/orders/route.ts:46`)। মানে key/migration না দিলে চারটা
রোলের কোনো কাজই চলবে না — এটাই "কিছুই মিলছে না" মনে হওয়ার প্রথম কারণ হতে পারে।
সব check এক জায়গায় দেখতে: `/api/health` (staff login বা `HEALTH_TOKEN` দিলে বিস্তারিত
+ `nextSteps` তালিকা আসে)।

---

## ১. মডেল A — স্ট্যান্ডার্ড e-commerce workflow

### ১.১ রোল অনুযায়ী স্ক্রিন

| রোল | লগইন | স্ক্রিন | কাজ |
|---|---|---|---|
| **Customer** | লাগে না (ফোন নম্বরই পরিচয়) / চাইলে `/account` | `/shop`, `/product/[slug]`, `/cart`, `/checkout`, `/track` | দেখা → কার্ট → অর্ডার → ট্র্যাক |
| **Shop (vendor)** | `/vendor/login` (Supabase auth) | `/vendor`, `/vendor/orders`, `/vendor/products`, `/vendor/earnings`, `/vendor/settings` | নিজের shop-এর product + অর্ডার সামলানো |
| **Rider** | `/rider/login` (৪-ডিজিট PIN) | `/rider` (একটাই স্ক্রিন) | Online toggle → offer accept → pickup → deliver |
| **Admin** | staff session | `/admin/orders`, `/admin/deliveries`, `/admin/products`, `/admin/riders`, `/admin/shops`, `/admin/payouts`, … | সবকিছু + dispatch board + settle |

### ১.২ হ্যাপি পাথ — ১১ স্টেপ

```
CUSTOMER                 SHOP / ADMIN              RIDER                CUSTOMER
────────                 ────────────              ─────                ────────
 1. product দেখে
    cart-এ নেয়
 2. checkout
    (নাম, ফোন, zone,
     COD/bKash/Nagad)
 3. অর্ডার নম্বর PS-xxxx
    + ৪-ডিজিট কোড পায় ──────────────────────────────────────────────► /track
                         4. pending → confirmed
                            ("Confirm order")
                         5. confirmed →
                            ready-for-pickup
                            ("Ready — call rider")
                                                     │
                         6. DB trigger অটো-offer ►  offer পায় (ডিফল্ট ৫ মিনিট)
                                                     7. Accept →
                                                        order = courier-assigned
                                                     8. Pickup →
                                                        order = out-for-delivery
                                                                                    9. "পার্সেল
                                                                                       রাস্তায়"
                                                                                       push
                                                     10. ৪-ডিজিট কোড
                                                         + ছবি → delivered
                                                                                    11. "delivered"
                                                                                        push
                         12. admin/rider settle (COD cash)
```

### ১.৩ স্টেপ-বাই-স্টেপ (কোন ফাইল কী করে)

**১–৩ · Customer order করে**
- `POST /api/orders` (`src/app/api/orders/route.ts`) — দাম/zone/coupon **server-side**
  আবার হিসাব হয়, client-এর total বিশ্বাস করা হয় না।
- DB-তে `ps_place_order` RPC চলে (`supabase/migrations/202609080003_place_order_rpc.sql`)।
- stock reserve হয়, `order_no` trigger দিয়ে বসে, `delivery_code` (৪-ডিজিট)
  auto-generate হয় (`ps_set_order_delivery_code`, `202609090007_rider_dispatch.sql:10`).
- শুরুতে status = `pending` (`src/lib/orders.ts` → `makePlacedOrder`)।
- COD হলে সাথে সাথেই flow এগোয়; **bKash/Nagad হলে `payment_status =
  'pending_verification'`** — shop verify না করা পর্যন্ত DB fulfilment আটকে রাখে
  (`ps_advance_order`-এ `'payment not verified'` raise, `202609170001:71`)।

**৪–৫ · Shop/Admin confirm করে**
- Admin: `POST /api/admin/orders/[id]/advance` → `advanceOrderAsStaff`
- Vendor: `POST /api/vendor/orders/[id]/advance` → `advanceVendorOrder`
- দুজনেই একই state machine চালায়। Vendor শুধু **নিজের shop-এর** order +
  শুধু `confirmed / preparing / ready-for-pickup / cancelled` চালাতে পারে
  (`ps_advance_order`, `202609170001:47–61`)।
- **Two-tap flow:** `confirmed → ready-for-pickup` সরাসরি allowed, মাঝের
  `preparing` ঐচ্ছিক (`202609170001_two_tap_order_flow.sql`)।

**৬ · Rider-কে offer যায় (অটো)**
- `orders`-এ `ready-for-pickup` বসার সাথে সাথে trigger `trg_orders_auto_dispatch`
  চলে → `ps_auto_dispatch_ready_order()` → একজন eligible rider-কে
  `delivery_assignments` row (`state='offered'`) তৈরি হয়
  (`202609090008_dispatch_auto.sql:45–70`)।
- **অফার কতক্ষণ বাঁচবে সেটা এখন সেটিং** (`202609250001`): `ps_offer_window()`
  → `site_settings.dispatch_offer_seconds`, ডিফল্ট **৩০০ সেকেন্ড (৫ মিনিট)**,
  clamp ৬০–৩৬০০। আগে হার্ডকোড করা ছিল ৯০ সেকেন্ড — বাইকে থাকা রাইডারের পক্ষে
  ওটা উত্তর দেওয়ার সময়ই ছিল না। বদলাতে SQL:
  `insert into site_settings (key, value) values ('dispatch_offer_seconds','600'::jsonb)
   on conflict (key) do update set value = excluded.value;`
- **রাইডারের ফোনে push যায়** (`202609250001`): `/rider`-এ "🔔 অফারের খবর ফোনে"
  একবার চালু করলে অ্যাপ বন্ধ থাকলেও অফার এলে ফোন বাজে
  (`src/lib/rider-push.ts`, টেবিল `push_subscriptions.rider_id`)। এর আগে
  রাইডার অফার জানতে পারত শুধু ১৫ সেকেন্ড পরপর poll করে — আর
  `usePoll` ট্যাব লুকানো থাকলে **পোলই করে না**, তাই পকেটের ফোন কখনো
  অফার দেখত না।
- Eligible মানে (`ps_next_eligible_rider`, `202609090008:13–40`):
  `status='active'` **এবং** `is_online = true` **এবং** rider-এর `zone_ids`-এ
  এই order-এর zone আছে **এবং** `cash_in_hand < 500000` paisa (= ৳৫,০০০) **এবং** এই মুহূর্তে
  তার হাতে অন্য কোনো live assignment নেই **এবং** আগে এই order-টা সে দেখেনি।
- ⚠️ **এটাই সবচেয়ে বড় আটকানোর জায়গা:** কোনো rider **Online toggle অন** না
  করলে offer তৈরিই হয় না, order `ready-for-pickup`-এ বসে থাকে। তখন Admin →
  Deliveries বোর্ডে হাতে **Assign** চাপতে হয় (`POST /api/admin/deliveries/offer`
  → `ps_offer_order`)।

**৭ · Accept**
- `POST /api/rider/assignments/[id]/accept` → `ps_rider_accept`
- assignment `accepted` + order `ready-for-pickup → courier-assigned`
  (`202609090007:38–61`)।
- **Reject** করলে `ps_rider_reject` সাথে সাথে পরের eligible rider-কে re-offer
  করে; ওই order সেই rider-কে আর দেখানো হয় না।

**৮ · Pickup**
- `POST /api/rider/assignments/[id]/pickup` → `ps_rider_pickup`
- order `courier-assigned → out-for-delivery`।
- এখান থেকেই customer-এর ৪-মাইলস্টোনের ৩য়টা ("Picked up") done হয়
  (`PUBLIC_STEPS[2].doneAt = "out-for-delivery"`, `src/lib/orders.ts`)।

**৯ · Customer-কে খবর**
- `notifyCustomerOfStatus(...)` pickup route-এ ডাকা হয় — RPC সফল হওয়ার **পরে**
  (`src/app/api/rider/assignments/[id]/pickup/route.ts`)।
- ⚠️ এই push পৌঁছাবে **শুধু যদি customer নিজে `/track`-এ "ফোনে খবর চালু করুন"
  চেপে subscribe করে থাকে** (`202609240001_customer_push.sql` + VAPID key লাগে)।
  না করলে ধাপটা `wa_outbox`-এ একটা **WhatsApp draft** হয়ে বসে থাকে
  (`202609240003_wa_outbox.sql`) — Admin-এর order list-এ সেই draft-এর strip
  (`src/components/admin/wa-draft-panel.tsx`) থেকে মালিক এক tap-এ পাঠান।
  মানে push off থাকলে flow ভাঙে না, শুধু মানুষের একটা tap লাগে।

**১০ · Deliver (৪-ডিজিট কোড)**
- `POST /api/rider/assignments/[id]/deliver` `{ code, proofUrl }`
- Route-এ `/^\d{4}$/` check, তারপর `ps_rider_deliver`-এ
  `upper(trim(code))` মিল না হলে `'delivery code mismatch'` — order `delivered` হয়
  **না** (`202609090007:115–151`)।
- `proofUrl` থাকলে https হতে হবে (Cloudinary ছবি)।

**১১ · টাকা settle**
- Rider COD cash জমা রাখে → `cash_in_hand` বাড়ে (**paisa**-তে সংরক্ষিত, তাই DB-তে
  cap `cash_in_hand < 500000` = **৳৫,০০০**)। cap-এ পৌঁছালে সেই rider-কে আর
  অটো-offer যায় না (`202609090008:26`) — settle করতে হবে।
- Admin → Riders → settle: `POST /api/admin/riders/[id]/settle` → `ps_admin_settle_rider`
- Rider নিজেও দেখতে পারে: `GET /api/rider/settlements`, `POST /api/rider/settle`।
- Shop-এর ভাগ: `ps_write_shop_ledger` + Admin → Payouts।

### ১.৪ State machine (এক নজরে)

```
pending ──► confirmed ──► preparing ──► ready-for-pickup ──► courier-assigned ──► out-for-delivery ──► delivered
   │            │              │              (অটো rider offer)   (rider Accept)      (rider Pickup)     (কোড + ছবি)
   └────────────┴──────────────┴──► cancelled      ▲  বাকি সব state থেকে cancel চলে না
```

- নিয়ম: **শুধু সামনে, +১ স্টেপ**, একমাত্র exception `confirmed → ready-for-pickup`।
  পেছনে ফেরা যায় না (`src/lib/orders.ts` → `TRANSITIONS`, DB-তে
  `ps_order_flow` position check)।
- Cancel শুধু `pending / confirmed / preparing` থেকে — customer-ও এই তিনটাই
  (`CUSTOMER_CANCELLABLE`, `POST /api/track/cancel`)। পার্সেল প্যাক হয়ে গেলে
  customer নিজে cancel করতে পারে না, shop-কে ফোন করতে হয়।

### ১.৫ Customer আসলে ৪টা ধাপই দেখে

```
1 Order placed  →  2 Confirmed  →  3 Picked up  →  4 Delivered
```
ভেতরে ৮টা state, বাইরে ৪টা মাইলস্টোন (`PUBLIC_STEPS`, `src/lib/orders.ts`)।

### ১.৬ যেখানে flow আটকে যায় + কী করবেন

| সমস্যা | আসল কারণ | সমাধান |
|---|---|---|
| Order হচ্ছে না, 503 | Supabase key নেই / migration চলেনি | `/api/health` খুলুন → `nextSteps` পড়ুন |
| Order আটকে `pending` | কেউ Confirm চাপেনি, আর push off | `/admin/orders` খুলুন + phone notification ON |
| `ready-for-pickup`-এ বসে আছে, rider কিছুই পাচ্ছে না | **কোনো rider Online নেই** / zone মিলছে না / shift-এর বাইরে / ক্যাশ cap / হাতে আগে থেকে assignment / সব রাইডার অফারটা দেখে ফেলেছে | Admin → Deliveries-এর **⚠️ কার্ডটা দেখুন** — আসল কারণ লেখা থাকে (`ps_dispatch_diagnosis`); তারপর **Assign now** বা রাইডার বেছে নিন |
| Admin-এর "Ready — call rider" 422 দেয় | `202609170001_two_tap_order_flow.sql` run হয়নি | SQL Editor-এ ওই migration চালান |
| Rider-এর job list 503 | একটা offer expire/reject হওয়ার পর re-offer ভাঙা | `202609160005_dispatch_reoffer_repair.sql` |
| Deliver করতে "code mismatch" | customer ভুল কোড দিচ্ছে / পুরনো অর্ডারের কোড | `/track` (order no + ফোন) থেকে কোড দেখান |
| bKash order এগোচ্ছে না | `payment_status = pending_verification` | Admin → Payments → verify (`ps_verify_payment`) |
| Delivery failed — order আটকে | `ps_rider_failed_attempt` শুধু `delivery_attempts` + reason লেখে, **status বদলায় না** (`202609090013:85–97`) | Admin হাতে re-offer (Deliveries → Assign) বা cancel |
| Rider offer সময় শেষ হয়ে যায় | `expires_at = now() + ps_offer_window()` (ডিফল্ট ৫ মিনিট) | রাইডারকে `/rider`-এ push চালু করতে বলুন; প্রয়োজনে `dispatch_offer_seconds` বাড়ান |
| Order ready হয়েছিল যখন সব রাইডার offline ছিল | auto-dispatch trigger একবারই চলে (ওই মুহূর্তে) | cron job `redispatch-stranded` ১৫ মিনিট পর পর নিজেই আবার অফার করে (`ps_redispatch_stranded`) |

### ১.৭ যে কাজগুলো মানুষ ছাড়াই হয়

`.github/workflows/cron.yml` → `POST /api/cron/tick` (`CRON_SECRET` লাগে) প্রতি
১৫ মিনিটে, `src/lib/cron.ts`:

| Job | কী করে |
|---|---|
| `expire-offers` | বাসি rider offer expire → order আবার dispatch board-এ ফেরে |
| `redispatch-stranded` | যেসব order dispatch-ready কিন্তু কোনো live offer নেই, সেগুলো পরের eligible রাইডারকে অফার + ফোনে push (`202609250001`) |
| `delivery-reminders` | customer-এর বেছে নেওয়া window-এর ~২ ঘণ্টা আগে "আজ আপনার পার্সেল আসছে 🛵" |
| `daily-digest` | সকাল ৯টায় (ঢাকা) একটা staff push: কালকের বিক্রি, আজকের অর্ডার, খোলা পড়ে থাকা, low stock |

`CRON_SECRET` না দিলে এই তিনটে চলে না — কিন্তু **order flow ভাঙে না**।

---

## ২. মডেল B — সহজ সিস্টেম (ছোট দোকানের জন্য)

> **কখন এটা বেছে নেবেন:** ১ জন মালিক + ১–৩ জন রাইডার + ১–২টা দোকান, দিনে
> ৫–৫০টা অর্ডার। এখানে "multi-vendor marketplace" দরকার নেই — জটিলতাই বাধা।

### ২.১ ৩ স্টেপ, এক বোর্ড

```
                 ┌──────────────────────────────────────────────┐
   customer      │            একটাই অর্ডার বোর্ড                  │
   অর্ডার করে ──► │   🟡 নতুন   →   🔵 রাইডারের হাতে   →   ✅ ডেলিভার্ড  │
                 └──────────────────────────────────────────────┘
                        │                  │                   │
                   মালিক চাপবে:        মালিক একটা         রাইডার কোড
                   "Confirm +          tap-এ রাইডার        দিয়ে deliver
                    rider ডাকুন"       ঠিক করে দেয়
```

| ধাপ | কে | কী করবে | সিস্টেমে |
|---|---|---|---|
| ১ | Customer | ফোন + ঠিকানা দিয়ে অর্ডার | `pending` |
| ২ | মালিক (এক tap) | "Confirm + rider ডাকুন" | `pending → confirmed → ready-for-pickup` (এক tap-এ দুটো) |
| ৩ | মালিক বা রাইডার | রাইডার "আমি নিলাম" চাপে, না হয় মালিক নাম বসায় | `courier-assigned` |
| ৪ | রাইডার | দরজায় ৪-ডিজিট কোড নিয়ে deliver | `delivered` |
| ৫ | মালিক | দিন শেষে রাইডারের cash নেয় | settle |

### ২.২ এই repo-তে মডেল B কীভাবে চালাবেন (নতুন কোড লাগবে না)

1. **Vendor বাদ দিন** — `/vendor` লগইন কাউকে দেবেন না, মালিক নিজেই
   `/admin` থেকে product + order সামলাবেন। (Vendor flow কোডে আছে,
   ব্যবহার না করলেই হলো।)
2. **Customer অ্যাকাউন্ট বাদ** — guest checkout-ই যথেষ্ট (ফোন + order no দিয়ে
   `/track`)। `/account` অপশনাল।
3. **Admin-এর দুটো বাটনই যথেষ্ট:** `/admin/orders`-এ "Confirm order", তারপর
   "Ready — call rider"।
4. **Rider-এর একটাই স্ক্রিন** `/rider`: Online toggle → job card → Pickup →
   Deliver (কোড)।
5. **Rider offer অটো না পেলে** Admin → Deliveries → Assign (নাম বেছে নেওয়া)।

### ২.৩ মডেল B-তে যেগুলো বন্ধ রাখলে ভালো

Membership/PROSANTI+, live shopping, referral, campaign, growth levers,
marketing feed, warranty queue, return pickup — সব কোডে আছে, কিন্তু চালু
করলেই বোর্ড জটিল হয়। প্রথমে **order → rider → cash** লাইনটা ঠিক করুন,
তারপর একটা একটা করে যোগ করুন।

---

## ৩. দিনের শুরুতে ৫ মিনিটের চেকলিস্ট

| # | কে | চেক |
|---|---|---|
| 1 | মালিক | `/api/health` → `live: true`? না হলে `nextSteps` অনুযায়ী migration/env |
| 2 | মালিক | `/admin/orders` → কালকের কোনো order `pending`/`ready-for-pickup`-এ আটকে নেই? |
| 3 | মালিক | `/admin/deliveries` → "awaiting dispatch" খালি? |
| 4 | রাইডার | `/rider` → **Online toggle সবুজ**? (এটা না হলে কোনো offer আসবে না) |
| 4a | রাইডার | `/rider` → **"🔔 অফারের খবর ফোনে" চালু**? (না হলে অ্যাপ বন্ধ থাকলে অফার চলে যাবে) |
| 5 | মালিক | `/admin/notifications` → Phone notification ON? (নইলে নতুন অর্ডারের খবর ফোনে আসবে না) |
| 6 | মালিক | রাইডারের cash-in-hand ৳৫,০০০-এর নিচে? (উপরে গেলে অটো-offer বন্ধ, Admin → Riders → settle) |

---

## ৪. ফাইল ম্যাপ (খোঁজার সময়)

| বিষয় | ফাইল |
|---|---|
| Status list, transition নিয়ম, public 4-step | `src/lib/orders.ts` |
| Customer order | `src/app/api/orders/route.ts`, `src/lib/order-validation.ts`, `src/lib/db/orders.ts` |
| Admin status change | `src/app/api/admin/orders/[id]/advance/route.ts`, `src/lib/db/admin.ts` |
| Shop (vendor) status change | `src/app/api/vendor/orders/[id]/advance/route.ts`, `src/lib/db/vendor.ts` |
| Dispatch board / offer / কেন আটকে | `src/app/api/admin/deliveries/*`, `src/lib/db/riders.ts` (`diagnoseDispatch`, `listStrandedOrders`, `redispatchStrandedOrders`) |
| Rider push (অফারের খবর) | `src/lib/rider-push.ts`, `src/lib/rider-push-client.ts`, `src/app/api/rider/push/route.ts` |
| Rider app | `src/app/rider/page.tsx`, `src/app/api/rider/*` |
| DB rules (আসল নিয়ম এখানে) | `supabase/migrations/*.sql` (`ps_advance_order`, `ps_rider_*`, `ps_auto_dispatch_ready_order`) |
| Customer track | `src/app/(site)/track/page.tsx`, `src/app/api/track/route.ts` |
| Notification (customer) | `src/lib/customer-push.ts`, `src/lib/notify-messages.ts` |
| ঘড়ি (cron) | `src/lib/cron.ts`, `docs/automation.md` |
| Go-live | `docs/go-live.md`, `docs/backend.md` |
