# PROSANTI Marketplace Blueprint — Foodpanda for Clothes (Phases 2 + 3)

**Vision:** PROSANTI is not a clothing brand — it is a **quick-commerce service
for clothing**. Customers order and get delivery within the hour; any shop can
list online; anyone can become a rider. Phase 1 (built ✅) is the same service
running with a single shop — the owner's own products.

This document is the build blueprint for Phase 2 (multi-vendor) and Phase 3
(rider network). No code changes come with it — decisions first, then sliced,
shippable builds.

```txt
Phase 1 (LIVE)          Phase 2 (THIS DOC)          Phase 3 (THIS DOC)
Single shop,            Multi-vendor marketplace:   Rider network:
own delivery staff,     any shop lists, vendor      dispatch, rider app,
zone ETA 45–50 min      dashboard, commission       proof-of-delivery, earnings
```

---

## 1. What Phase 1 already gives us (foundation inventory)

Do not rebuild any of this — Phase 2/3 extend it:

| Asset | File / table | Why it matters |
|---|---|---|
| Order status machine with dispatch states | `ps_order_status` enum + `src/lib/orders.ts` (`ready-for-pickup` → `courier-assigned` → `out-for-delivery` → `delivered`) | The marketplace dispatch flow already exists end-to-end |
| `courier` role | `ps_user_role` enum | Rider auth plugs into the existing role system |
| Zone-based delivery + ETA | `delivery_zones`, `/api/zones`, checkout | Quick-delivery promise + dispatch geography |
| Atomic checkout RPC | `ps_place_order` (migration 003) | Stock-safe ordering; Phase 2 adds a shop guard to it |
| Staff auth + admin API pattern | `staffRoute()`, `requireStaff()` | Vendor/rider endpoints reuse the same wrapper |
| Public track by id + phone | `/api/track`, Track page | Becomes customer live-tracking in Phase 3 |
| Reviews (approved-only) | `/api/reviews` | Extends to shop ratings in Phase 2 |

**Phase 1 delivery ops (no build needed):** the owner's own delivery staff
update status from the existing admin (`courier-assigned` →
`out-for-delivery` → `delivered`). That is the manual dispatch loop Phase 3
automates.

---

## 2. Phase 2 — Multi-vendor marketplace

### 2.1 Product decisions (recommendations — owner confirms in §7)

| # | Decision | Recommendation | Rationale |
|---|---|---|---|
| D1 | Cart model | **Single-shop-per-order (Foodpanda model)** | One kitchen → one bag → one rider. Multi-shop carts need split dispatch, split COD, split commission — 3× complexity for little launch value |
| D2 | Who sets delivery fee | **Platform zones (as today)**; per-shop override later | Keeps checkout + dispatch simple; zones already built |
| D3 | Shop visibility | Shops are **area-scoped**: customers see shops serving their zone | Quick-commerce promise only holds near the shop; prevents cross-city orders that can't arrive in an hour |
| D4 | Vendor powers | Vendor manages **own catalog + own orders + own hours**; platform manages zones, commissions, payouts, refunds | Least privilege; vendors can't break each other |
| D5 | Commission basis | **% of item subtotal** (delivery fee excluded), stored per shop | Simple, auditable, standard for the model |
| D6 | Payouts | **Manual settlement first** (weekly report + bank/bKash transfer recorded in admin), automated later | No payment-partner dependency at launch |

### 2.2 Data model

New tables (migration `004_marketplace.sql` sketch):

```sql
-- A listed shop. The owner's current catalog becomes shop #1 via backfill.
create table shops (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  tagline       text not null default '',
  logo_url      text not null default '',
  phone         text not null,
  address       text not null default '',
  zone_ids      text[] not null default '{}',   -- delivery_zones served
  prep_minutes  int not null default 15,        -- kitchen-equivalent: pack time
  commission_pct numeric(5,2) not null default 15.00,
  status        text not null default 'pending' -- pending|active|suspended
                check (status in ('pending','active','suspended')),
  is_open       boolean not null default false, -- vendor toggles daily
  rating_avg    numeric(3,2) not null default 0,-- maintained by trigger
  rating_count  int not null default 0,
  created_at    timestamptz not null default now()
);

-- Vendor staff. Separate from admin_users: different powers, different RLS.
create table vendor_users (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  shop_id  uuid not null references shops (id) on delete cascade,
  role     text not null default 'owner' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

-- Settlement ledger. One row per delivered order's shop share.
create table shop_ledger (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops (id),
  order_id   text not null references orders (id),
  subtotal   int not null,   -- paisa, items only
  commission int not null,   -- paisa, platform cut
  payable    int not null,   -- paisa, subtotal - commission
  created_at timestamptz not null default now(),
  unique (order_id)
);

-- Manual payout batches (D6).
create table shop_payouts (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops (id),
  amount     int not null,   -- paisa actually transferred
  method     text not null default 'bank', -- bank|bkash|cash
  reference  text not null default '',
  paid_at    timestamptz not null default now(),
  paid_by    uuid references auth.users (id)
);
```

Column additions (same migration):

```sql
alter table products add column shop_id uuid references shops (id);
alter table orders   add column shop_id uuid references shops (id);
alter table reviews  add column shop_id uuid references shops (id); -- denormalized for shop ratings
```

Backfill: insert shop #1 ("PROSANTI Direct" / owner's shop name), set all
existing `shop_id`s to it. `ps_place_order` gains a guard: all items must
belong to one active + open shop serving the order's zone (else P0001 →
422 `items`, reusing the existing error mapping).

Shop ratings: reviews already attach to products; the `shop_id` denormalized
column + a trigger maintain `rating_avg`/`rating_count`. No fake seeding —
counts start at 0 for new shops.

### 2.3 Vendor auth & roles

- Reuse Supabase Auth (same as staff). `vendor_users` maps user → shop.
- New `requireVendor()` in `src/lib/vendor-auth.ts` (sibling of
  `staff-auth.ts`): verifies JWT, loads `(shop_id, role)`. Vendor endpoints
  use `staffRoute()`-style wrapper parameterized by shop ownership.
- RLS: vendors read/write only rows where `shop_id` matches their shop.
  Platform staff keep full access via existing `ps_is_admin()` policies.
- Vendor login: `/vendor/login` (separate gate from `/admin/login` so the
  two sessions never confuse each other).

### 2.4 Vendor dashboard scope (lite admin — new route group `/vendor`)

| Page | Vendor can | Vendor cannot |
|---|---|---|
| Orders | Confirm/cancel own orders, mark `preparing` → `ready-for-pickup` | Touch other shops' orders, assign riders (Phase 3 auto-dispatch) |
| Products | Full CRUD on own catalog (reuse product editor) | Publish to other shops/categories outside allowlist |
| Hours | Toggle `is_open`, edit prep time | Edit zones, commissions |
| Earnings | See ledger rows + payout history | Edit ledger/payouts |
| Reviews | Read + reply(?) own product reviews | Moderate (platform moderates — same as today) |

Reuse strategy: the existing admin components (`product-editor`, order UI)
are already hook-driven — vendor pages reuse them against `/api/vendor/*`
endpoints with the shop scope enforced server-side.

### 2.5 Storefront changes

1. **Shop discovery:** home gains "Shops near you" (zone-selected shops,
   active + open first); new `/shops` listing + `/shop/[id]` profile pages
   (logo, rating, hours, catalog, policies).
2. **Area scoping (D3):** the existing zone picker becomes the entry filter —
   catalog/search show only products from shops serving the chosen zone.
   URLs stay the same; the registry gains a shop filter.
3. **Single-shop cart (D1):** adding an item from another shop prompts
   "Start a new bag?" (Foodpanda behavior) — cart stores `shopId`, checkout
   validates it.
4. **Product pages** show the shop chip (name, rating, prep time) linking to
   the shop profile.
5. **Checkout** shows shop name + prep + delivery ETA split
   ("Packing ~15 min + delivery ~30 min").

### 2.6 Shop onboarding (platform admin flow)

1. Applicant submits: shop name, phone, address, zones, NID/trade-license
   photo (stored via existing media pipeline, private bucket/folder).
2. Row created with `status='pending'` → appears in new **Admin → Shops**
   queue.
3. Staff verifies → `active` (or `suspended` with reason). Activation email/
   SMS is manual at first (message template in the admin UI, copy-paste).
4. Vendor gets login → onboarding checklist (add 1st product, set hours,
   test order).

### 2.7 New API routes (Phase 2)

```txt
Public (extend existing style):
  GET /api/shops?zone=          # active shops serving a zone
  GET /api/shops/[id]           # profile + catalog snapshot
Vendor (requireVendor, per-shop RLS):
  GET/PATCH /api/vendor/orders            # own orders + status moves (early states only)
  GET/POST/PATCH /api/vendor/products     # own catalog CRUD
  PATCH /api/vendor/shop                  # hours/prep/profile (owner only)
  GET /api/vendor/earnings                # ledger + payouts, paginated
Platform admin (requireStaff):
  GET/POST/PATCH /api/admin/shops         # onboarding queue + suspend + commission
  GET/POST /api/admin/payouts             # settlement report + record transfer
```

### 2.8 COD money reality (Bangladesh — read before build)

- Customer pays rider cash → rider holds platform's money.
- Shop never touches cash (delivery-only model): platform owes shop
  `payable` per delivered order regardless of cash collection.
- Therefore **rider cash settlement (Phase 3, §3.5) is load-bearing**, not a
  nice-to-have: without it, cash leaks. Phase 2 with owner-delivery works
  because the owner IS the cash collector.
- Launch rule: a shop goes live only in zones where rider/cash coverage
  exists.

---

## 3. Phase 3 — Rider network

### 3.1 Data model (migration `005_riders.sql` sketch)

```sql
create table riders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete cascade,
  name          text not null,
  phone         text not null unique,
  vehicle       text not null default 'bike' check (vehicle in ('bicycle','bike','scooter')),
  zone_ids      text[] not null default '{}',  -- home zones
  status        text not null default 'pending' -- pending|active|suspended
                check (status in ('pending','active','suspended')),
  is_online     boolean not null default false,
  cash_in_hand  int not null default 0,        -- paisa collected, not yet settled
  rating_avg    numeric(3,2) not null default 0,
  rating_count  int not null default 0,
  created_at    timestamptz not null default now()
);

create table delivery_assignments (
  id          uuid primary key default gen_random_uuid(),
  order_id    text not null references orders (id),
  rider_id    uuid not null references riders (id),
  state       text not null default 'offered'  -- offered|accepted|picked_up|delivered|cancelled|expired
              check (state in ('offered','accepted','picked_up','delivered','cancelled','expired')),
  offered_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '90 seconds',
  unique (order_id)   -- one live assignment per order; history via audit rows if needed
);

create table rider_settlements (   -- cash-in-hand pay-ins
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references riders (id),
  amount     int not null,   -- paisa handed over
  method     text not null default 'cash',
  reference  text not null default '',
  settled_at timestamptz not null default now(),
  settled_by uuid references auth.users (id)
);
```

`orders` gains: `rider_id uuid null`, `delivery_code text null`
(4-digit proof code, generated at confirm — §3.4).

### 3.2 Dispatch design (auto-assign by zone)

Trigger: order reaches `ready-for-pickup`.

1. Eligible riders: `status='active'`, `is_online=true`, order zone ∈
   `zone_ids`, no live assignment, `cash_in_hand` below cap (e.g. ৳5,000 —
   forces pay-in, §3.5).
2. Offer to exactly one rider (nearest-first needs GPS — start with
   round-robin/longest-idle among eligible). `expires_at` = +90s.
3. Accept → order `courier-assigned`, assignment `accepted`. Timeout/reject →
   `expired`, offer next rider; after N rounds → platform alert (manual
   dispatch from Admin → Deliveries).
4. Rider arrived → `picked_up` (order `out-for-delivery`) → delivered with
   proof (§3.4) → order `delivered`, ledger row written (§2.2), rider cash
   += COD amount.
5. Cancel mid-flight: assignment `cancelled`, order follows existing cancel
   rules (stock release already built).

Fairness: longest-idle-first is explainable to riders ("why did HE get the
order?") — keep the rule visible in the rider app. Nearest-first waits for
live GPS (Phase 4).

### 3.3 Rider app — mobile web first, no install

New route group `/rider` (phone-first UI, big touch targets, works on
low-end Android):

| Screen | Contents |
|---|---|
| Login | Phone + password (Supabase Auth, same as staff/vendors) |
| Home / availability | Big Online/Offline toggle, today's earnings, cash-in-hand with pay-in reminder |
| Job offer | Shop name + address, customer area (not full address until accept), items count, COD amount, countdown accept/reject |
| Active job | Shop address → customer address, call buttons (`tel:` links), "Picked up" → "Delivered" flow with code entry |
| Earnings | Per-delivery fee × jobs, tips (later), settlement history |

Delivery fee model (recommendation): flat per-drop fee by zone (e.g.
৳40–60) + platform keeps delivery charge margin. Stored on zones or a
`rider_fee` column — owner sets numbers at launch.

PWA (installable, offline queue) is a hardening step AFTER the loop works
in plain mobile web. No native apps in Phase 3.

### 3.4 Delivery proof WITHOUT SMS (key decision)

SMS costs money and needs a provider. The proof loop works with **zero SMS**:

1. At order confirm, server generates a 4-digit `delivery_code`.
2. Customer sees it on the confirmation screen + Track page ("Tell this code
   to your rider: **4821**").
3. Rider taps "Delivered" → must enter the code → server verifies →
   `delivered`. Wrong code = honest error, retry allowed, attempts logged.
4. Edge: customer unreachable → rider marks "Customer unreachable" → order
   returns to shop flow (new terminal-ish state `return_requested`, handled
   manually at first).

SMS/WhatsApp (already documented out-of-scope) later upgrade this to
notifications + OTP fallback — the code mechanism stays identical.

### 3.5 Rider cash settlement (load-bearing — §2.8)

- Every COD delivery increments `riders.cash_in_hand`.
- Cap blocks new offers over the cap → rider must pay in (bKash to platform
  number / cash at hub) → staff records `rider_settlements` row →
  `cash_in_hand` decremented (trigger or RPC — same atomicity standard as
  `ps_place_order`).
- Admin → Riders page: cash exposure leaderboard, settle buttons, suspend.
- Disputes: delivery code log + timestamps are the evidence trail.

### 3.6 Customer tracking upgrade (still no GPS in Phase 3)

Track page gains rider-leg timeline from existing states: packing →
rider assigned (rider name + rating + call button) → picked up → arriving.
ETA = zone SLA − elapsed, shown as a range ("10–20 min away"). Live GPS map
is Phase 4 (needs rider location pipeline + map SDK costs).

### 3.7 Fraud & abuse notes

- Fake "delivered": blocked by the customer-held code (§3.4).
- Rider-shop collusion (fake orders): cash cap + new-shop order velocity
  alerts in Admin → Deliveries.
- Customer code sharing to strangers: their own risk; code rotates never,
  single-use per order.
- Report flow: customer "I didn't get my order" → order flagged →
  assignment + code-attempt log reviewed manually.

---

## 4. Cross-cutting notes

- **Status machine:** no enum change needed — `ready-for-pickup`,
  `courier-assigned`, `out-for-delivery` already exist. Only the ACTORS
  change (vendor moves early states, dispatch moves rider states).
- **Rate limits:** vendor/rider endpoints reuse the per-account limiter
  (tighter on offer-accept + code attempts: 10/min).
- **Notifications:** in-app + Track page first. SMS/WhatsApp stay documented
  out-of-scope until a provider is chosen.
- **Media:** shop logos + KYC docs reuse `/api/media/sign` (staff-only
  today → extend to vendor/rider signup flows with tight folders).
- **Search:** product search gains shop + zone filters; shop search is a new
  small index (name/trigram — Postgres `pg_trgm`, no new infra).

---

## 5. Suggested build order (each slice shippable, demo-safe)

Phase 2 slices:
1. ✅ `004` migration + shop #1 backfill + `ps_place_order` shop guard (no UI).
2. ✅ Admin → Shops queue (approve/suspend/commission) + public `/api/shops`.
3. ✅ Vendor auth + `/vendor` dashboard (orders → products → hours → earnings).
4. ✅ Storefront: zone-scoped discovery, shop pages, single-shop cart, checkout split ETA.
5. ✅ Ledger writer + Admin → Payouts + settlement report.
5. Ledger writer + Admin → Payouts + settlement report.

Phase 3 slices:
6. `005` migration + rider onboarding (apply → approve) + Admin → Riders.
7. Dispatch engine (offer/accept/expire/re-offer) + Admin → Deliveries board.
8. `/rider` mobile app (online toggle → job → pickup → code → delivered).
9. Delivery-code proof + Track page rider-leg timeline.
10. Cash settlement + caps + exposure dashboard.

Rule per slice: demo mode keeps working with zero keys (same standard as
Phase 1 — every slice ships with seeds/fallbacks and gates green).

---

## 6. Open decisions for the owner (needed before build starts)

| # | Question | Recommendation | Your call |
|---|---|---|---|
| D1 | Single-shop-per-order? | Yes (§2.1) | ☐ |
| D2 | Platform-owned delivery fee? | Yes for launch | ☐ |
| D3 | Area-scoped shop visibility? | Yes | ☐ |
| D4 | Vendor powers (catalog+orders+hours)? | As §2.4 | ☐ |
| D5 | Commission % of item subtotal? | Yes; number: ___% default | ☐ |
| D6 | Manual payouts first? | Yes (bank/bKash) | ☐ |
| D7 | Rider pay: flat per-drop by zone? | Yes; ৳___/drop starting | ☐ |
| D8 | Rider cash cap? | ৳5,000 to start | ☐ |
| D9 | Shop #1 name (your shop's public name)? | ___ | ☐ |
| D10 | Launch zones for marketplace (vendor onboarding open where)? | ___ | ☐ |

---

## 7. Explicitly NOT in Phases 2–3

Native rider/customer apps, live GPS maps, in-app chat, online payment
gateways, SMS/WhatsApp notifications, multi-shop carts, automated payouts,
demand heatmaps, promo/voucher marketplace mechanics beyond existing
coupons. Each has a named hook above for when the time comes.

---

*Companion docs: `docs/backend.md` (Phase 1 live system),
`docs/customer-accounts.md`, `docs/storefront-phase-two.md`.*
