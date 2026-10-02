# Rider / Delivery / Money audit — ৩০ সেপ্টেম্বর ২০২৬

**Scope:** rider account creation, management, delivery dispatch, rider dashboard,
ride–shop connection, money management (admin ↔ rider ↔ shops).
**Method:** full code scan (`src/app/rider`, `src/app/api/rider`, `src/app/api/admin/riders`,
`src/lib/db/riders.ts`, dispatch/settle/wallet migrations, vendor earnings, payouts),
quality gates re-run locally: `lint` ✅ `typecheck` ✅ `test` ✅ (363 files / 2,377 tests).
**Note:** no live database in this workspace — production migration state was NOT verified here.

---

## 1. System overview (যা আছে)

| Area | Status |
|---|---|
| Account creation | Apply = signup (`/api/riders/apply`), phone-login fallback, account cleanup on failure, reject → re-apply with same login, KYC upload (pending gate), admin review queue |
| Dispatch | Area broadcast (90s offers, first-accept-wins with order lock), decline/withdraw cooldowns, expire sweep (10s throttle) + realtime channel, wallet-payment gate, ৳5,000 cash cap, load ≤ 2, shift + zone enforced **in SQL**, manual/batch assign |
| Delivery | Accept → pickup → 4-digit PIN (15-min lockout after 5 wrong) → Cloudinary proof, failed-attempt reporting, return legs reuse dispatch |
| Dashboard | `/rider` — online toggle, live jobs, offer countdown + beep, cash card, settlements, shift editor, profile, stats (lifetime / 7-day / rating) |
| Money: shop | `shop_ledger` (payable = subtotal − commission), `shop_payouts` + balance trigger, vendor earnings page |
| Money: rider | COD **custody only** (`cash_in_hand`) + staff-approved settle claims + settlement history |
| Money: platform | commission, delivery charge, surcharges recorded in ledger columns |

---

## 2. Bugs found (কোড-প্রমাণিত)

> **স্টেটাস (৩০ সেপ্টেম্বর ২০২৬, সন্ধ্যা):** Phase 1 (B3, B1, B4, B7, B8, B9, B10) fix হয়েছে —
> বিস্তারিত ও প্রমাণ §7-এ। বাকি (B2, B5, B6, B11, B12 + dashboard list) Phase 2–4।

### P0 — money / operations

**B1. Rider tip কখনো রাইডারের হাতে পৌঁছায় না।** ✅ **FIXED — §7.2**
- Checkout: `src/lib/order-validation.ts:84` — "*Rider* tip in paisa"; `orders.total`-এ tip যোগ হয় (:780).
- Rider UI: `src/app/rider/page.tsx:719` — "💝 Tip for you".
- Vendor UI: `src/app/vendor/earnings/page.tsx:31` — "*tips go 100% to the rider*".
- বাস্তবে: `ps_write_shop_ledger` (`202609160003`) tip → `shop_ledger.tip_amount`-এ লেখে, কিন্তু shop balance = Σ`payable` (tip/delivery/surcharge বাদে)। রাইডারের কোনো wallet/credit নেই — `ps_rider_deliver` শুধু COD total `cash_in_hand`-এ যোগ করে, তারপর settle-এ পুরো টাকা admin-এর কাছে চলে যায়।
- ফলাফল: COD অর্ডারে tip হারিয়ে যায় (rider আদায় করে, admin পান, rider পান না); prepaid-তে tip shop-এর মানিবাজারে ঢোকে বা ledger-এ strand থাকে।

**B2. Rider-এর কোনো earning/payout সিস্টেমই নেই।**
- Per-delivery fee ৳০; `grep wage|incentive|bonus|rider earning` → কিছু নেই।
- Delivery charge + surcharge platform-এ যায় (vendor copy: "go to the platform *and rider*" — rider share কোথাও define/credit করা নেই)।
- Rider wallet, statement, payout, admin "rider payable" report — কিছুই নেই। Admin ↔ rider টাকা শুধু COD custody + pay-in।

**B3. `bootstrap-fresh.sql` ও `diagnose.sql` ১৯টা migration পেছানে।** ✅ **FIXED — §7.1**
- bootstrap `202609250008`-এ শেষ; অনুপস্থ: `202609260001` → `202609290003` (গুরুত্বপূর্ণ: **application review + KYC columns** `202609260002`, free delivery, **multi-shop checkout** `202609280008`, commission audit, vendor staff, verification, ইত্যাদি)।
- `diagnose.sql` checklist-ও `202609250008`-এ শেষ → নতুন DB-তে "ALL PRESENT" দেখাবে অথচ ১৯টা নেই। ২৫ সেপ্টেম্বরের prod incident-এর একই প্যাটার্ন।
- `docs/go-live.md` ও `verify-2026-09-27.sql` কেউকে কভার করে, কিন্তু primary tools (header-ই বলে "diagnose first / fresh → bootstrap") stale।

### P1 — correctness / UX

**B4. Phone collision-এ rider apply দেয় গোলমেল 503।** ✅ **FIXED — §7.3**
`applyRider` (`src/lib/db/riders.ts`) dupe-check suspended/rejected row বাদ দেয় ("reusing a rejected rider's phone starts fresh" comment), কিন্তু `riders.phone` UNIQUE (`202609090005`) insert আটকায় → auth account create+delete → generic "Could not save the application." (503)। ঠিক করা স্ট্যাটাস-স্পেসিফিক 409 দেখানো হয় না।

**B5. Shop ↔ rider সংযোগ একদিকে।**
Rider দেখে দোকানের নাম/ফোন/ম্যাপ; কিন্তু vendor API/UI-তে assigned rider-এর নাম/ফোন কোথাও নেই (`src/lib/db/vendor.ts`, `src/app/vendor/page.tsx` — rider contact শূন্য)। দোকান pickup-এ rider-কে ফোন করতে পারে না।

**B6. Rider-এর জন্য push notification নেই।**
Customer/staff/vendor push আছে (web-push configured) — rider offer শুধু in-app beep (tab খোলা থাকলে) + realtime। Screen off হলে ৯০-সেকেন্ড offer মিস। Gig-ops-এর জন্য critical।

**B7. Failed-attempt form-এর error দৃশ্যমান নয়।** ✅ **FIXED — §7.4**
`rider/page.tsx` failed submit error → `setPinError`, কিন্তু `pinError` শুধু PIN modal-এ render হয় (modal বন্ধ থাকলে নিঃশব্দে হারায়); client-এ minLength validationও নেই।

**B8. Settle claim amount ≠ settled amount।** ✅ **FIXED — §7.5**
`ps_rider_settle` claim-এর amount claim-time balance-এ freeze করে; `ps_admin_settle_rider` live full balance settle করে (rider পরে আরও cash এনে থাকলে mismatch)। Admin confirm dialog claim amount দেখায় — ভুল সংখ্যায় approve হতে পারে। Claim history-তে approved amount ও আপডেট হয় না।

### P2 — accuracy / maintainability

**B9.** ✅ **FIXED — §7.6** `getRiderStats.weekDeliveries` `orders.updated_at` দিয়ে গুনে — delivery-এর পরে order যেকোনো কারণে update হলে সংখ্যা নষ্ট হয়। Assignment-এর delivered timestamp ব্যবহার করতে হবে।

**B10.** ✅ **FIXED — §7.7** Dashboard `onlineOverride` কখনো clear হয় না — server-সাইডে is_online বদলালেও UI পুরোনো দেখায় (reload পর্যন্ত)।

**B11.** ৳৫,০০০ cash cap ≥৬টা SQL migration + `rider/page.tsx`-এ hardcoded — বদলাতে গেলে sync করতে হবে। DB `site_settings`-এ single source হওয়া উচিত।

**B12.** ছোটখাটো: apply-এ zoneIds cap 12 vs admin 24; suspended rider নতুন login দিয়ে apply করলে "already a rider — sign in" (সঠিক message "suspended"); awaiting-dispatch board-এ zone-coverage নেই এমন order-ও দেখায় ('no eligible rider')।

**সবুজ সিগন্যাল:** dispatch state-machine, RLS + security-definer RPCs, PIN lockout, settle-claim approval, wallet-payment guard, rate limits, realtime offers — গভীরভাবে hardened; `lint/typecheck/2,377 tests` পাস।

---

## 3. Best system (যা system হওয়া উচিত)

**তিন-খাতার double-entry ledger + আলাদা rider wallet** — বর্তমান COD-custody ঠিক আছে, তার উপরে:

1. **`party_ledger`** — প্রতিটি টাকা-আন্দোলন append-only row: (party=platform|shop|rider|customer, order_id, type, signed amount)। ইভেন্ট: `commission_earned`, `delivery_income`, `surcharge_income`, `tip_owed_rider`, `cod_collected_rider`, `cod_settled_platform`, `rider_fee_earned`, `rider_payout`, `shop_payout` ইত্যাদি। Report = এই table-এর group-by, আজীবন reconciliation সহজ।
2. **Rider দুইটা balance:**
   - `cash_in_hand` — COD **custody** (বর্তমানভাবে আছে; settle claim ফ্লো যথার্থ)।
   - **`earnings_balance` (নতুন)** — প্রতি delivery-এ credit: base fee (zone/distance-configurable) + COD handling fee + **১০০% tip** + incentive। Admin রাইডারের ঋণী।
3. **Rider payout flow** — আলাদা admin queue (shop payout-এর মতো): balance থেকে bKash/bank/cash payout, staff approve, statement (rider profile + admin দুই জায়গায়)।
4. **Tip fix** — `ps_rider_deliver`-এ tip → rider wallet credit; `shop_ledger.tip_amount` শুধু informational (vendor copy অনুযায়ী ১০০% rider)।
5. **Configurable rules** — fee/cash-cap/commission `site_settings`-এ (SQL + UI এক জায়গা থেকে পড়বে)।
6. **Money dashboard (admin)** — platform P&L: commission + delivery + surcharge income, rider payable, shop payable, COD custody exposure।
7. Dispatch/dashboard সব রাখা হবে — শুধু টাকার হিসাব যোগ হবে।

---

## 4. A–Z update list (কী কী update লাগবে)

| # | Update | Priority |
|---|---|---|
| A | **Tip → rider credit** (SQL: `ps_rider_deliver` + ledger semantics; UI copy verify) | P0 |
| B | **bootstrap-fresh + diagnose regenerate** (১৯টা migration যোগ, header count ঠিক, `split:bootstrap` re-run) | P0 |
| C | **Rider earnings wallet** (table + per-delivery fee credit at deliver + admin config) | P0 |
| D | **Rider payouts** (admin approve queue, rider withdraw request, statement) | P0 |
| E | **Apply phone-collision fix** (suspended/rejected phone → clear 409, আগেই dupe-তে ধরা) | P1 |
| F | **Shop → rider contact** (vendor order card-এ rider name/phone + call link, API-তে expose) | P1 |
| G | **Rider web-push** (offer এলে background notification, subscribe flow rider app-এ) | P1 |
| H | **Failed-attempt UX** (error inline দেখানো, reason chips, minLength) | P1 |
| I | **Claim/settle amount consistency** (approve-এ claim-এর approved amount update; dialog live balance দেখায়) | P1 |
| J | **weekDeliveries timestamp fix** (orders.updated_at → assignment delivered time) | P2 |
| K | **online override sync** (session refresh-সাথে clear) | P2 |
| L | **Cash cap / fee → site_settings** (SQL + UI single source) | P2 |
| M | **Admin money dashboard** (platform income, rider payable, shop payable, custody exposure) | P1 |
| N | **Rider earnings page** (আজ/সপ্তাহ/lifetime, per-delivery breakdown, tips, payout history) | P1 |
| O | **Trip history** (delivered list 60-item feed-এর বাইরে, date filter, search by order no) | P1 |
| P | **Offer reliability** (full-screen offer + sound settings + missed-offer log) | P1 |
| Q | **Rider announcements inbox** (admin থেকে message, claim approved/rejected notification) | P2 |
| R | **Distance/ETA on active trip** (in-dashboard map route, remaining ETA) | P2 |
| S | **Auto-offline / battery saver** (X মিনিট idle হলে নিজে অফলাইনের option) | P2 |
| T | **Rating feedback loop** (rider কাস্টমার rating দেখবে, low-rating reason) | P2 |
| U | **Suspended-reapply messaging** (status-specific error, support link) | P2 |
| Z | **Split dashboard code** (1,188-line page → component modules) + regression tests | P2 |

---

## 5. Rider dashboard improvement list (priority অনুযায়ী)

1. **আয়ের সেকশন** — আজকের আয়, এই সপ্তাহ, lifetime; per-delivery fee + tip + COD custody আলাদা দেখানো
2. **Bottom navigation** — Jobs / আয় / History / Profile ট্যাব (এখন পুরো পাতা এক স্ক্রল)
3. **Active trip stepper** — Accepted → Pickup → Deliver ভিজ্যুয়াল ধাপ, ETA, distance
4. **Offer popup** — full-screen alert, sound/vibration toggle, missed-offer counter
5. **Push notification** (background-এ offer)
6. **Trip history page** — তারিখ অনুযায়ী filter, order no দিয়ে search, 60-item limit-এর বাইরে
7. **Cash summary card upgrade** — আজ আদায়, মোট settled, pending claim timeline (claim amount vs live balance)
8. **Claim status timeline** — filed → approved/rejected (note সহ), push/inbox update
9. **In-app inbox** — admin ঘোষণা, claim সিদ্ধান্ত
10. **Map inside dashboard** — বাইরের Google Maps link ছাড়া route preview + live position
11. **Rating + feedback** — ⭐ average, recent customer rating দেখা
12. **Failed-attempt flow** — inline error, preset reasons, সফল হলে feed-এ badge
13. **Cash-limit UX** — disable কেন তার tooltip/notice, কত বাকি settle করলে unlock
14. **Profile/KYC view** — এলাকা, vehicle, KYC document status (read-only)
15. **Language toggle (BN/EN)** + accessibility pass
16. **Code split** — page.tsx ভাগ করে testable components

---

## 6. Suggested phasing

- **Phase 1 (তাৎক্ষণিক):** B, A, E, H, I, J, K — bug + ops fixes (দিন ১–২)
- **Phase 2 (money):** C, D, M, N — earnings wallet + payouts + dashboards
- **Phase 3 (dashboard):** 5-নম্বর লিস্টের 1–8
- **Phase 4 (polish):** G, Q, R, S, T, U, Z

**Permission-এর পরে কাজ শুরু হবে** — Phase 1 দিয়ে start করাই নিরাপদ।


---

## 7. Phase 1 — যা fix হয়েছে (৩০ সেপ্টেম্বর ২০২৬)

সব gate পাস: `lint` ✅ · `typecheck` ✅ · **2386 tests ✅** (৯টা নতুন) · `npm run build` ✅ ·
migration-টা embedded PostgreSQL-এ (PGlite) চালিয়ে flow-টেস্ট ✅।

**৭.১ (B3) bootstrap + diagnose regenerate।**
`supabase/bootstrap-fresh.sql`-এ ২০টা section append — বাদ পড়া ১৯টা migration
(`202609260001` → `202609290003`) + নতুন `202609300001`, সঙ্গে খুঁজে পাওয়া আরও একটা আসল
ঘাটতি `202609170002_perf_indexes` (৮টা index)। header-এর "Generated from …" লাইন আপডেট।
`supabase/diagnose.sql`-এ checklist row `38`–`57` যোগ (আগে `37j`/`202609250008`-এ থেমে যেত →
"সব present" মিথ্যা দেখাত)। `npm run split:bootstrap` আবার চালানো — এখন ১৫টা part (আগে ১২)।
*Bonus:* কনটেন্ট-অডিটে দেখা গেল `202609140009/0010/0011`, `202609210001`, `202609240001/0002`
আগেই content-সহ ছিল, শুধু date-banner ছিল না (কোনো ফাংশনাল ঘাটতি নয়)।

**৭.২ (B1, P0 money) Tip → Rider wallet।**
নতুন migration `supabase/migrations/202609300001_rider_delivery_accounting.sql`:
- `riders.earnings_balance bigint` + append-only `rider_earnings` জার্নাল
  (RLS on, policy নেই — শুধু SECURITY DEFINER RPC / service লেখে), `(order_id, kind)` unique
  → একই order-এ কখনো ডাবল credit নয়।
- `ps_rider_deliver` (202609250005 বডি) এখন delivery-তে **tip ১০০% rider wallet-এ** credit করে —
  COD-এর হাতের ক্যাশ (`cash_in_hand`) আর আয় (`earnings_balance`) আলাদা খাত।
- **ইতিহাসের tip backfill করা হয়নি** — পুরোনো tip কে পাবে সেটা মালিকের টাকার সিদ্ধান্ত, schema default নয়।

UI/API: `/api/rider/stats`-এ `earningsBalance`; rider dashboard-এ "🏅 আপনার আয় (টিপ ইত্যাদি)"
কার্ড (হাতের ক্যাশ নয় — স্পষ্ট লেখা); admin Riders তালিকায় "owed to rider ৳X";
`/api/health`-এ ৯ম round-probe `riderEarningsReady` → migration না চললে নাম ধরে next-step।

**৭.৩ (B4) Apply-এ phone collision।**
revoked/suspended রাইডারের ফোন নম্বর দিয়ে নতুন application এলে আগে generic 503 আসত
(auth account খুলে-মুছে)। এখন `23505` ধরে স্পষ্ট 409: "This mobile number already has a rider
account — sign in at /rider/login…" (login collision-এর জন্য আলাদা message)।

**৭.৪ (B7) Failed-attempt UX।** error এখন form-এর ভেতরেই inline দেখায় (PIN modal-এর pinError-এ
হারিয়ে যেত না), ৫ অক্ষরের কম হলে Submit বন্ধ, সফল হলে feed refresh।

**৭.৫ (B8) Claim vs live balance।** Admin-এর claim queue এখন rider-এর **বর্তমান**
`cashInHand` দেখায় ("live balance ৳X") এবং confirm dialog-এ সেটাই বলে — approve যেটা settle করে।

**৭.৬ (B9) ৭ দিনের counter।** `delivery_assignments.delivered_at` stamp হয় deliver-এ
(পুরোনো row-গুলোর জন্য one-time backfill), stats এখন সেটাই গোনে — `orders.updated_at`-এর
ভুল আর নেই; migration না চললে পুরোনো basis-এ degrade করে (counter শূন্য হয় না)।

**৭.৭ (B10) Online override।** toggle-এর পর server refresh হলে optimistic override clear হয় —
staff-side suspend আর "অনলাইন" দেখায় না।

**পরের ধাপ (Permission-এর অপেক্ষায়):** Phase 2 (C/D/M/N — per-delivery fee, rider payout,
admin money dashboard), Phase 3 (dashboard redesign), তারপর B2/B5/B6/B11/B12।


---

## 8. Phase 2 — rider money system (৩০ সেপ্টেম্বর ২০২৬)

Permission: *"একটা একটা করে সব করো p1, p2, p3"* → Phase 1 merge-এর পর Phase 2।
নতুন migration: **`supabase/migrations/202609300002_rider_money.sql`** (idempotent,
202609300001 ছাড়াও একা চালানো যায় — দরকারি column/table নিজেই বানায়)।

**৮.১ (C) Per-delivery আয়।** `ps_rider_deliver` এখন ডেলিভারিতে ১০০% টিপের সঙ্গে
`site_settings`-এর **base fee** (`rider_base_fee_paisa`) আর COD অর্ডারে **COD handling
fee** (`rider_cod_handling_fee_paisa`) credit করে — দুটোই `ps_setting_int` দিয়ে প্রতি
ডেলিভারিতে live পড়া হয়, তাই রেট বদলালে **পরের ডেলিভারি থেকে** কার্যকর, পুরোনোতে
backfill হয় না। ডিফল্ট **৳০ ইচ্ছাকৃত**: rider-এর ওয়ালেটে মালিকের না-বলা রেট জমা করা
একটা টাকার সিদ্ধান্ত, schema-র নয় — রেট সেট না করা পর্যন্ত Admin → Money-তে হলুদ
সতর্কবার্তা থাকে আর শুধু টিপ জমা হয়। প্রতিটি credit একই `rider_earnings` জার্নালে
(`delivery_fee` / `cod_handling`; unique `(order_id, kind)` gate অপরিবর্তিত), তাই
`riders.earnings_balance` সবসময় ওই rider-এর জার্নাল-যোগফল।

**৮.২ (D) Rider payout (staff-approved)।** `rider_payout_requests` টেবিল +
`ps_rider_request_payout`: rider নিজের ওয়ালেট থেকে উত্তোলন চায় — **একসাথে একটির বেশি
pending নয়** — আর টাকা **সাথে সাথেই hold হয়** (wallet debit + ঋণাত্মক `payout` row,
request-এর সাথে linked), তাই একই টাকা দুইবার খরচ হতে পারে না। Staff সিদ্ধান্ত দেয়
`ps_admin_decide_rider_payout` দিয়ে: **paid** হলে wallet-এ কিছু নড়ে না (hold-টাই
পরিশোধ), **rejected** হলে টাকা ফেরত যায় ও `payout_refund` জার্নাল হয়। ফলে
`earnings_balance` যেকোনো মুহূর্তে জার্নালের সাথে মিলিয়ে দেখা যায় (drift check টেস্টে
আছে)।

**৮.৩ (M) Admin → Money।** `ps_admin_money_summary()` (staff-only) লেজার থেকেই পুরো
অবস্থান বলে: income (commission + delivery charge + সংগৃহীত টিপ), rider wallet payable,
pending/paid payout, shop payable, riders-এর হাতে থাকা COD cash (pending claim সহ)।
পেজে payout queue (bKash/bank reference দিয়ে approve, note দিয়ে reject) আর রেট এডিটর —
যেটি **একই** `site_settings` কী-তে লেখে যেটি deliver RPC পড়ে (এক এডিটর, এক source of
truth)। টাকা টাকায় লেখা হয়, paisa-তে জমা হয়; ভুল ইনপুট 422 দেয়, চুপচাপ ৳০ করে না।

**৮.৪ (N) /rider/earnings।** rider-এর নিজের statement: ওয়ালেট (প্ল্যাটফর্ম পাওনা) বনাম
হাতের COD ক্যাশ (দায়) বনাম এখন পর্যন্ত উত্তোলন — তিনটা কখনো মেশে না; আজ/৭ দিন/সর্বমোট,
kind-ভিত্তিক ভাঙা (টিপ, ডেলিভারি ফি, ক্যাশ হ্যান্ডলিং), অর্ডার নম্বরসহ জার্নাল ফিড,
payout history (status chip) আর উত্তোলনের ফর্ম (সর্বনিম্ন payout hint, এক pending থাকলে
দ্বিতীয়টার বদলে status কার্ড)। রাইডার ড্যাশবোর্ডে "📊 আমার আয়ের হিসাব ও উত্তোলন →"
লিংক।

**৮.৫ Health + tooling।** ১০ম round probe `riderPayoutsReady` (`rider_payout_requests`)
— না চললে `/api/health` ঠিক ফাইলের নাম বলে। `bootstrap-fresh.sql`-এ নতুন Feature
section (header এখন "through 202609300002"), `diagnose.sql`-এ row 58–63,
`npm run split:bootstrap` → **১৬** part।

**Verification।** Migration-টা embedded PostgreSQL-এ (PGlite, minimal schema + উভয়
migration) চালিয়ে **২৬টি চেক** পাস: ভুল PIN/state guard, COD বনাম prepaid credit,
double-credit replay-safe, hold/decrease/refund হিসাব, suspended rider নিষিদ্ধ,
wallet ≡ জার্নাল drift check, admin summary টোটাল, double re-apply no-op। নতুন টেস্ট
৫০টি (মোট **2436**), সব gate (`lint` / `typecheck` / `test` / `build`) পাস।

**Deploy।** মালিককে SQL Editor-এ ক্রমে `202609300001` → `202609300002` চালাতে হবে;
তার আগে rider শুধু টিপ পায় (৳০ fee), payout route 503 দেয় ফাইলের নাম বলে, আর
`/rider/earnings` + Admin → Money "backend update pending" দেখায় — বাকি অ্যাপ
অপরিবর্তিত।

## 9. Phase A — P0/P1 fix-gulo (১ অক্টোবর ২০২৬)

Permission: *"Suru koro and ek ek kore complete koro"*। নতুন migration: **`supabase/migrations/202610010001_rider_fixes_phase_a.sql`**
(একটাই transaction, idempotent, `notify pgrst` সহ; `202609300001` + `202609300002`-এর পরে চালাতে হবে)।
প্রতিটি item আলাদা commit।

| Item | Bug | Fix | Commit |
|---|---|---|---|
| A (N1–N3) | Admin payout approve, Admin money summary ও `/rider/earnings` summary — তিনটাই service-role client-এ চলত, কিন্তু RPC `auth.uid()` দিয়ে staff/rider চেনে ⇒ সব সময় `forbidden` | তিনটাই caller-এর নিজের JWT client-এ চলে। পুরোনো PGlite টেস্ট `ps_is_admin`/`auth.uid` stub করত বলে এটা ধরা পড়েনি — এখন real `auth.uid()` + `request.jwt.claims` দিয়ে টেস্ট (`npm run test:money`) | `e813f1b` |
| B (N4) | Return-pickup (zero-total, default `cod`) rider-কে COD handling fee দিত, অথচ কোনো ক্যাশ নেওয়া হয়নি | fee শুধু তখনই যখন সত্যিই ক্যাশ collect হয়েছে; return leg শুধু base fee পায় | `bf0c56d` |
| C (N5) | Failed attempt শুধু counter বাড়াত: job live থেকে যেত (rider-এর load slot আটকে), attempt অসীম, staff-এর কোনো উপায় নেই; "Awaiting dispatch"-এ দেখালেও "Send area requests" সব সময় fail | পার্সেল হাতে (`picked_up`) থাকলেই report করা যায়; `delivery_max_attempts` (`site_settings`, default 2, সীমা 1–5); শেষ attempt-এ assignment `failed`, rider মুক্ত, order-এ `delivery_failed_at`; Admin → Deliveries-এ "Failed deliveries — needs action" (Redispatch / Cancel); cancel-এ note বাধ্যতামূলক, prepaid wallet হলে refund অফলাইনে করতে history-তে লেখা থাকে | `703f7b3` |
| E (N8) | Admin "delivered" চাপলে rider-এর PIN/proof/COD custody/earnings কিছুই হত না, assignment `picked_up` পড়ে থাকত, অথচ shop ledger লেখা হত | `ps_advance_order` এখন rider-এর accepted/picked_up job থাকলে `delivered` refuse করে (409 + কী করতে হবে বলে)। Counter pickup ও rider-ছাড়া order অপরিবর্তিত। Rider নিখোঁজ হলে নতুন **Release rider** (`ps_admin_release_assignment`): পার্সেল নেওয়া না হলে area queue-তে ফেরত, rider-এর হাতে থাকলে Failed deliveries-এ | `38c4d54` |
| F (N9) | Proof photo ঐচ্ছিক, আর যেকোনো `https://` লিংক গ্রহণযোগ্য | Proof হতে হবে `https://res.cloudinary.com/<আমাদের cloud>/…`। Upload configured থাকলে ছবি বাধ্যতামূলক; তোলা না গেলে (ক্যামেরা/নেটওয়ার্ক) কারণ (≥৫ অক্ষর) লিখলে ডেলিভারি হয়, কারণটা order timeline-এ থাকে। যাচাই **PIN-এর আগে**, তাই ছবি ছাড়া চেষ্টা PIN attempt পোড়ায় না। Cloudinary configured না থাকলে বাধ্যতামূলক নয় | `1fdd067` |

**Tooling।** `/api/health`-এ ১১তম probe `riderFixesReady` (`orders.delivery_failed_at`) — না চললে ঠিক ফাইলের নাম বলে।
`bootstrap-fresh.sql` (header "through 202610010001") ও `bootstrap-parts/` (এখন **১৭** part) এবং `diagnose.sql` (row 64–67) sync করা।

**জানা সীমা / পরের ধাপ।**
- Failed delivery-তে rider কোনো fee পায় না — এটা business সিদ্ধান্ত, এখনো নেওয়া হয়নি।
- Final failure-এর পর staff সিদ্ধান্ত না নেওয়া পর্যন্ত customer tracking-এ "out for delivery" দেখায়।
- Redispatch-এর পর একই rider আবার offer পেতে পারে।
- `delivery_max_attempts` এখনো শুধু `site_settings` key; admin UI আসবে item J-তে।
- Cloudinary "dynamic folder" mode-এ folder URL-এ থাকে না, তাই proof URL-এ folder যাচাই ইচ্ছাকৃতভাবে করা হয়নি; শুধু cloud name।
- **D (N6)** — bKash/Nagad wallet পেমেন্ট verify করবে কে (platform staff না shop) — মালিকের সিদ্ধান্তের অপেক্ষায়।

## 10. Item D (N6) — bKash/Nagad payment কে verify করবে (১ অক্টোবর ২০২৬)

মালিকের সিদ্ধান্ত: *"দুইটাই রাখো, আর power থাকবে admin staff-এর কাছে — admin চাইলে নিজের কাছে রাখতে পারে,
shop-কেও দিতে পারে, অথবা দুইটাই"*। নতুন migration: **`supabase/migrations/202610010002_payment_verifier.sql`**
(idempotent, `202609160003`-এর `ps_verify_payment` body + অনুমতির নিয়ম)।

| `shops.payment_verifier` | Staff | Shop |
|---|---|---|
| `platform` | ✅ | ❌ ("reserved for the platform") |
| `shop` | ❌ ("delegated to the shop") | ✅ (শুধু নিজের order) |
| `both` (**default**) | ✅ | ✅ |

- Default `both` = আগের আচরণ, তাই migration চালালে কোনো shop-এর কিছু বদলায় না — admin বেছে নিলে তবেই।
- Admin → Shops → shop edit → **"Who verifies this shop's bKash / Nagad payments"** dropdown (সাথে ব্যাখ্যা)। Column না থাকলে
  (migration বাকি) অন্য সব ফিল্ড আগের মতো save হয়; verifier বদলালে 503 + ফাইলের নাম।
- Payment card (admin ও vendor দুই জায়গায়): যে পক্ষের অধিকার নেই তাকে বোতামের বদলে ব্যাখ্যা — staff দেখে
  "Waiting for the shop… Admin → Shops-এ বদলান", shop দেখে "PROSANTI staff verify করে, আপনার কিছু করতে হবে না"।
- Order history-র note এখন বলে **কে** সিদ্ধান্ত নিয়েছে ("verified by the shop / by PROSANTI staff")।
- Real-Postgres টেস্ট: ৩টি মোড, ভুল shop, shop-ছাড়া order, ভুল মান reject, প্রতি shop আলাদা।

**যা বদলায়নি (জেনে রাখুন)।** Customer এখনো **PROSANTI-র** wallet নম্বরে টাকা দেয় এবং `shop_ledger` ডেলিভারিতে shop-এর
`payable` credit করে (platform-collected মডেল)। তাই `shop` মোডে shop এমন টাকার verify করে যা তার wallet-এ আসেনি —
শুধু তখনই বেছে নিন যখন shop সত্যিই টাকাটা দেখতে পায়। সত্যিকারের "shop নিজের wallet-এ টাকা নেয়" মডেল চাইলে আলাদা কাজ:
shop-এর নিজের bKash/Nagad নম্বর, checkout-এ সেই নম্বর দেখানো, আর shop → platform commission/delivery charge হিসাব
(ledger-এ ঋণাত্মক payable)। দরকার হলে পরের item হিসেবে করা যাবে।
`/api/health` probe `paymentVerifierReady`, `bootstrap-fresh.sql` (এখনো ১৭ part), `diagnose.sql` row 68 sync করা।

## 11. Item G (N7) — net P&L (১ অক্টোবর ২০২৬)

আগে Admin → Money-র "Platform income" ছিল চারটা **gross** কার্ড: commission, delivery charge, **tips** (যা rider-এর টাকা,
platform-এর আয় নয়) আর "rider pay" (tip + fee মেশানো)। প্ল্যাটফর্ম আসলে লাভ করছে কিনা বোঝার উপায় ছিল না।
নতুন migration **`202610010003_money_pnl.sql`** (read-only RPC `ps_admin_money_pnl(from, to)`, staff JWT-এ):

```
+ Commission                         (shop_ledger, delivered order)
+ Delivery ও surcharge charge        (orders.delivery_charge)
+ Shop-funded free delivery          (shop যে waived charge payable থেকে ফেরত দেয়)
− Rider pay (fee + COD handling + incentive ± adjustment)
− PROSANTI যে discount নিজে বহন করে  (orders.discount − shop-funded promo)
= Net operating result   (+ প্রতি delivered order, + প্রতি trip-এ delivery charge − rider pay)
```
- Tips ফলাফলের **বাইরে** (pass-through): collected বনাম rider-কে credited, ফারাক আলাদা লেখা।
- Period: Today (Dhaka মধ্যরাত) / 7 days / 30 days / All time। পুরোনো gross কার্ডগুলো "Gross flows (all time, not a profit figure)" নামে নিচে।
- Delivery-র সময় = rider-এর `delivered_at`, না থাকলে history-র 'delivered' লাইন, না থাকলে `updated_at` (`orders`-এ `delivered_at` নেই —
  Postgres টেস্ট লিখতে গিয়ে এটা ধরা পড়ে, তাই টেস্ট ছাড়া SQL ভুল হত)।
- Migration না চললে পেজ ফাইলের নাম বলে; বাকি পেজ অপরিবর্তিত। `diagnose.sql` row 69, bootstrap sync।
- যা বাইরে: refund/cancel-এর খরচ, payment-gateway ফি (নেই — personal wallet), অফলাইন খরচ (অফিস, marketing)। তাই এটা *operating* result।

## 12. Item K — COD netting on settle (১ অক্টোবর ২০২৬)

সমস্যা: একই rider-এর কাছে platform ৳৫,০০০ ক্যাশ পায় (COD), আবার rider-এর wallet-এ platform-এর কাছে ৳১,২০০ পাওনা।
আগে rider ৳৫,০০০ জমা দিত, তারপর আলাদা payout করে ৳১,২০০ ফেরত যেত। এখন **`202610010004_cod_netting.sql`**:

- Admin → Riders-এ যে rider-এর `cash held` আর `owed to rider` দুটোই আছে, তার কার্ডে নতুন বাটন **"Net with wallet (−৳X)"**।
  `net = min(cash_in_hand, earnings_balance)`; rider হাতে দেয় `cash − net`। পুরো COD দেনা শূন্য হয়।
- Settlement row-তে `amount` = পুরো দেনা, `netted_amount` = wallet থেকে কাটা অংশ। Wallet-এ একটি ঋণাত্মক journal row (`cod_netting`,
  settlement-এর সাথে বাঁধা) — তাই `earnings_balance = Σ journal` অক্ষুণ্ণ।
- `cod_netting` আয় নয়: rider-এর today/week/lifetime আর admin P&L দুটোই নির্দিষ্ট earning kind গোনে, তাই বিকৃত হয় না।
- Wallet-এ pending payout থাকলে সেটা আগেই balance থেকে কাটা (hold), তাই শুধু মুক্ত টাকাই net হয়।
- Opt-in: সাধারণ "Settle Cash" আগের মতোই; migration না চললে সাধারণ settle কাজ করে, net চাইলে ফাইলের নাম বলা 503।
- Rider দেখে: settlement ইতিহাসে "এর মধ্যে ৳X wallet থেকে সমন্বয়", earnings খাতায় "🤝 ক্যাশ জমার সাথে সমন্বয়"।
- Rider-এর নিজের "টাকা জমা দিয়েছি" দাবির Approve শুধু নগদ (rider নিজে বলছে নগদ দিয়েছে) — netting শুধু staff-এর সরাসরি settle-এ।

## 13. Item H (B5) — shop sees its rider (১ অক্টোবর ২০২৬)

Shop "Ready — request riders" চাপার পর আর কিছুই দেখত না: কে accept করল, কাকে ফোন করবে। Shop-এর `riders` /
`delivery_assignments` পড়ার অধিকার নেই (RLS), তাই **`202610010005_vendor_rider_view.sql`**-এ একটি সংকীর্ণ definer RPC
`ps_vendor_order_rider(order_id)`:

- শুধু **নিজের shop-এর order** (`orders.shop_id = ps_vendor_shop()`); অন্য shop বা service-role/rider → `forbidden`/null।
- শুধু যখন rider সত্যিই কাজে (`accepted` / `picked_up`)। Offer, শেষ হওয়া বা failed job-এ rider-এর ফোন প্রকাশ হয় না।
- শুধু নাম, ফোন, vehicle, state। আর্থিক কিছু নয়।
- Vendor order detail পেজে "🛵 Rider on this order" কার্ড: নাম, vehicle, অবস্থা ("Pickup-এর জন্য আসছে — parcel রেডি রাখুন" /
  "Parcel নিয়ে গেছে"), `tel:` Call বাটন। পেজ আগে থেকেই poll করে, তাই rider accept করলেই কার্ড আসে।
- Migration না চললে কার্ড নেই, পেজ ঠিক চলে।
- সিদ্ধান্ত: counter-pickup order-এ কার্ড নেই। Rider-এর ফোন shop-কে দেখানো platform-এর নীতিগত সিদ্ধান্ত — চাইলে শুধু নাম দেখিয়ে ফোন লুকানো যায়।

## 14. Item T — money audit trail (১ অক্টোবর ২০২৬)

আগে "কে এই payout approve করল / কে settle করল / কে wallet number বদলাল" — কিছু জায়গায় আংশিক (`decided_by`, history note),
কিছু জায়গায় একেবারেই নেই। **`202610010006_money_audit.sql`**: `money_audit_log` + **database trigger**, app-code নয়, তাই কোনো
route/ভবিষ্যৎ feature লগ করতে ভুলতে পারে না। Table append-only (UPDATE/DELETE trigger-এ বন্ধ, service role-এও)।

| Event | কখন |
|---|---|
| `shop_payout` | shop payout record হলে |
| `rider_payout_paid` / `rider_payout_rejected` | rider payout request pending → paid/rejected |
| `rider_settle` | staff rider-এর COD settle করলে (netted অংশসহ) |
| `settle_claim_rejected` | settle claim reject |
| `payment_verified` / `payment_rejected` | bKash/Nagad payment সিদ্ধান্ত (admin বা shop — actor দেখায় কে) |
| `rider_adjustment` | rider wallet-এ adjustment / incentive |
| `rate_change` | rider pay rate (base fee, COD handling, min payout) — আগে → পরে |
| `wallet_numbers_changed` | customer যে bKash/Nagad নম্বরে টাকা দেয় সেটা বদলালে (শুধু কোন method, **নম্বর কখনো লগে নয়**) |

- actor = `auth.uid()` + email; `NULL` মানে service role/DB session ("system / service")।
- Admin → Money → **Audit trail** (`/admin/money/audit`): newest-first তালিকা, event filter। পড়া শুধু `ps_is_admin()` (RLS)।
- Migration না চললে পেজ ফাইলের নাম বলে। `diagnose.sql` row 72, bootstrap sync।
- সীমা: migration চালানোর আগের ঘটনা লগে নেই। Order-delivery/status বদল এখানে নয় (সেগুলো `order_status_history`-তে)।

## 15. Item U — daily reconciliation (১ অক্টোবর ২০২৬)

**`202610010007_money_daily.sql`** → `ps_admin_money_daily(day)` (read-only, staff-only) আর Admin → Money → **Daily reconciliation**
(`/admin/money/daily`)। এক Dhaka-দিনের জন্য:

- **কী ঘটল:** delivered order ও মূল্য, rider-এর COD collected, rider কত নগদ জমা দিল (netted আলাদা), commission, delivery income,
  shop-কে নতুন পাওনা, shop/rider payout, rider earned/adjustment, payout request।
- **এখন কোথায় আছে:** rider-দের হাতে নগদ, rider-দের পাওনা, shop-দের পাওনা (নির্বাচিত দিনের শেষের নয়, *এখনকার*)।
- **৮টি check — সব সবুজ হলে দিন বন্ধ:**
  1. প্রতি rider-এর wallet = তার journal-এর যোগফল
  2. কোনো rider-এর নগদ ঋণাত্মক নয়
  3. কোনো shop যা আয় করেছে তার বেশি পায়নি
  4. আজ delivered প্রতিটি order-এর shop ledger লাইন আছে
  5. ৪৮ ঘণ্টার বেশি পড়ে থাকা rider payout নেই
  6. ৪৮ ঘণ্টার বেশি পড়ে থাকা settle claim নেই
  7. failed delivery অমীমাংসিত পড়ে নেই
  8. ২৪ ঘণ্টার বেশি অনিষ্পন্ন bKash/Nagad payment নেই
  প্রতিটি fail-এ কী করতে হবে আর নমুনা id দেখায়। DB যে check ফেরত দেয়নি সেটাকে কখনো "ঠিক আছে" ধরা হয় না।
- দিন বদলানোর তীর, তারিখ-বাছাই, **Copy summary** (WhatsApp-এ পেস্ট করার সাদা লেখা), **Print**।
- Postgres টেস্ট আসল ভুল ঢুকিয়ে প্রতিটি check ফ্লিপ হওয়া প্রমাণ করে (ভাঙা wallet, ঋণাত্মক নগদ, ledger-ছাড়া order…)।
- সীমা: cash custody-র "দিনের শেষ" অবস্থা ঐতিহাসিকভাবে সংরক্ষিত নয় — তাই position এখনকার। Staff-এর manual-delivered/release করা order rider-এর COD-তে ধরা হয় না (E-র সিদ্ধান্ত)।

## 16. Phase C1 — rider app: bottom nav, trip history, profile tab (১ অক্টোবর ২০২৬)

আগে `/rider` ছিল ১,৩০০ লাইনের এক লম্বা স্ক্রল: প্রোফাইল ফর্ম, shift ফর্ম, ক্যাশ কার্ড, settlement তালিকা, স্ট্যাটস — আর নিচে
আসল কাজ (ট্রিপ)। সম্পন্ন ডেলিভারির কোনো হিসাবও ছিল না (feed শুধু শেষ ৬০টি assignment)।

- **Bottom navigation** (`rider-bottom-nav.tsx`, shell-এ): ট্রিপ · আয় · ইতিহাস · প্রোফাইল। URL দেখে সক্রিয় ট্যাব জ্বলে।
  ভাসমান "সাইন আউট" বাটন সরে প্রোফাইল ট্যাবে।
- **ইতিহাস** (`/rider/history`, `GET /api/rider/history?before=`): সম্পন্ন ও চূড়ান্ত-ব্যর্থ ট্রিপ, দিন (Dhaka) অনুযায়ী ভাগ করা;
  প্রতি ট্রিপে দোকান → এলাকা, **আয় (fee + COD handling + tip + incentive)**, **নেওয়া COD ক্যাশ**, ব্যর্থ হলে rider-এর নিজের কারণ;
  দিনের মোট (ডেলিভারি, ব্যর্থ, আয়)। ৩০টি করে পেজ, cursor-এ "আরও দেখুন"। Rider-এর নিজের id route-context থেকে — URL থেকে নয়।
  `rider_earnings` না থাকলে শুধু আয় বাদ পড়ে, পেজ চলে।
- **প্রোফাইল ট্যাব** (`/rider/profile`): প্রোফাইল ফর্ম, shift কার্ড (`rider-shift-card.tsx`-এ আলাদা কম্পোনেন্ট), টাকা জমার ইতিহাস
  (netted অংশসহ), সাইন আউট।
- **হোম** এখন: header + অনলাইন টগল, ক্যাশ-সীমা কার্ড, স্ট্যাটস, সক্রিয় ট্রিপ।
- e2e `dashboards.spec.ts` প্রোফাইল-সেভ ধাপ নতুন পেজে সরানো হয়েছে (playwright এখানে চালানো হয়নি)।

## 17. Phase C2 — রাইডার হোম: ট্রিপ স্টেপার, নতুন-অফার অ্যালার্ট, আজকের হিসাব

কোনো migration লাগে না।

- **ট্রিপ স্টেপার** (`src/components/rider/trip-stepper.tsx`): অফার → দোকানে → পথে → ডেলিভারি। জব কার্ডের হেডারের নিচে বসে; বর্তমান ধাপ highlight, আগেরগুলো ✓।
- **অফার অ্যালার্ট** (`src/lib/use-offer-alert.ts`): বোর্ডে আগে-না-থাকা offer এলে ফোন vibrate করে, ব্যানার flash হয়, আর অফার pending থাকা পর্যন্ত ট্যাব টাইটেলে `🔔 (n) নতুন অফার` দেখায়। প্রথম লোডে অ্যালার্ট হয় না (ওগুলো "নতুন" না)।
- **আজকের হিসাব**: `getRiderToday` (`src/lib/db/rider-history.ts`) ঢাকার মধ্যরাত থেকে delivered সংখ্যা ও আয় (tip + fee + COD handling + incentive)। `/api/rider/stats` এখন `todayDeliveries` / `todayEarned` যোগ করে। কোনো কলাম/টেবিল না থাকলে বা error হলে ওই সংখ্যা বাদ যায় (নকল ৳0 দেখায় না, স্কোরবোর্ড কখনো fail করে না)। হোমে কার্ডে ট্যাপ করলে `/rider/earnings`।
- টেস্ট: `trip-stepper`, `use-offer-alert`, `rider-stats-route`, `rider-history` (db) ও `rider-page`।
- সীমা: অ্যালার্ট শুধু অ্যাপ খোলা থাকলে কাজ করে — অ্যাপ বন্ধ থাকলে web-push (item I) লাগবে। iOS Safari-তে `navigator.vibrate` নেই (শুধু ব্যানার + টাইটেল)।

## 18. Phase C3 — রাইডারের টাকা জমা / উত্তোলনের টাইমলাইন

কোনো migration লাগে না।

**সমস্যা:** রাইডার টাকা জমার দাবি (claim) করলে অফিস reject করলে অ্যাপ থেকে দাবিটা শুধু উধাও হয়ে যেত — কারণ বা নোট রাইডার জানত না, ক্যাশ ব্যালেন্সও কেন কমল না বুঝত না।

- `listRiderRecentClaims` (`src/lib/db/riders.ts`): রাইডারের সর্বশেষ ১০টি claim সব অবস্থায় (pending / approved / rejected), `decidedAt` ও `note` সহ। claims টেবিল না থাকলে খালি তালিকা।
- `GET /api/rider/settlements` এখন `recentClaims` ফেরত দেয়; `useRiderJobs` এ `recentClaims`।
- `src/lib/rider-cash-timeline.ts`: settlement + claim মিলিয়ে একটি টাইমলাইন — ⏳ অপেক্ষায় / ✖ অনুমোদন হয়নি (অফিসের কারণসহ ও "ক্যাশ ব্যালেন্স কমেনি") / ✓ জমা হয়েছে। approved claim আলাদা সারি হয় না (তার settlement-ই সারি) — যাতে দুবার না দেখায়।
- `/rider/profile`-এ "টাকা জমার টাইমলাইন" (আগের সাধারণ settlement তালিকার জায়গায়); wallet netting-এর বিবরণ আগের মতোই থাকে।
- `/rider/earnings`-এর উত্তোলন তালিকায়: pending হলে "টাকা ওয়ালেটে হোল্ডে আছে", rejected হলে "হোল্ড করা টাকা ওয়ালেটে ফেরত এসেছে"।
- টেস্ট: `rider-cash-timeline`, `rider-recent-claims` (db), `rider-profile-page`, `rider-earnings-page`।

## 19. Phase C4 (+ item O) — রাইডার ইনবক্স: অফিস থেকে রাইডারকে বার্তা

**Migration লাগবে:** `supabase/migrations/202610020001_rider_inbox.sql` (Supabase SQL Editor-এ চালান; আগের সব migration-এর পরে)। `bootstrap-fresh.sql` / `bootstrap-parts/18` / `diagnose.sql` (সারি 74) সিঙ্ক করা হয়েছে। migration না চললে রাইডারের ইনবক্সে "এখনো চালু হয়নি" আর admin পেজে migration-এর নাম দেখায় — কিছু ভাঙে না।

- **টেবিল:** `rider_announcements` (title ≤120, body ≤1000, `info`/`important`, `rider_id` null = সব রাইডার, ঐচ্ছিক `expires_at`) ও `rider_inbox_state` (প্রতি রাইডারের last_read_at)। RLS চালু; রাইডারের সরাসরি টেবিল-অ্যাক্সেস নেই।
- **লেখা:** শুধু স্টাফ, দুটি SECURITY DEFINER RPC (`ps_admin_post_announcement`, `ps_admin_delete_announcement`) — `ps_is_admin()` ছাড়া `forbidden`। লেখকের আইডি আসল `auth.uid()` থেকে। রাইডার ডিলিট হলে তার ব্যক্তিগত বার্তাও যায়।
- **রাইডার অ্যাপ:** নিচের বারে ৫ম ট্যাব "বার্তা" (অপঠিত সংখ্যার লাল ব্যাজ, প্রতি মিনিটে রিফ্রেশ)। `/rider/inbox`-এ বার্তা, 🔴 নতুন চিহ্ন, ❗ জরুরি, "আপনার জন্য" ট্যাগ; পেজ খুললে পড়া হিসেবে চিহ্নিত হয় (ব্যাজ সাথে সাথে শূন্য)। মেয়াদ-উত্তীর্ণ বার্তা দেখায় না। মার্কার না থাকলে শুধু গত ১৪ দিনের বার্তা "নতুন" গণ্য হয় (নতুন রাইডার পুরনো নোটিশে ডুবে যাবে না)।
- **অ্যাডমিন:** `/admin/riders/announcements` (Riders পেজ থেকে "Announcements" বাটন) — সব রাইডার বা একজন, সাধারণ/জরুরি, মেয়াদ (২৪ঘ/৩দিন/৭দিন/নেই), পাঠানো তালিকা ও মুছে ফেলা।
- **API:** রাইডার `GET/POST /api/rider/inbox` (সবসময় সেশনের রাইডার, URL-এর আইডি অগ্রাহ্য); স্টাফ `GET/POST /api/admin/rider-announcements`, `DELETE …/[id]`।
- **টেস্ট:** `rider-inbox` (lib, db, routes, pages, nav badge) ও pglite SQL টেস্ট (`npm run test:money`, নতুন PASS লাইন)।
- **সীমা:** বার্তা পড়তে অ্যাপ খুলতে হয় — অ্যাপ বন্ধ থাকলে web-push (item I) লাগবে। কে কে পড়েছে (read receipt) রাখা হয় না, শুধু প্রতি রাইডারের "শেষ পড়ার সময়"। জোন-ভিত্তিক টার্গেটিং এখনো নেই (সব বা একজন)।
