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
