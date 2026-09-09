# Backend — Supabase + API routes (full launch backend)

The storefront runs in **two modes** and always says which one:

| Mode | When | Checkout | Tracking | Catalog reads | Admin reads/writes |
|---|---|---|---|---|---|
| `demo` | No Supabase keys (default) | Browser-local order store, as before | Browser-local store | Typed seeds in `src/lib/catalog.ts` | Browser-local stores behind the demo login |
| `live` | Keys set + SQL applied + seeded + staff signed in | `POST /api/orders` → atomic `ps_place_order` RPC | `GET /api/track` reads real rows by id + phone | Live rows via registry + `/api/products`, `/api/zones` | Authenticated `/api/admin/*` routes (Supabase Auth + `admin_users` roles) |

`GET /api/health` reports the current mode. Every API response carries
`source` / `demoMode` so callers never guess, and a configured-but-broken
backend returns an explicit error — never silent demo substitution for
money paths.

## What lives where

```txt
src/app/api/
├── health/route.ts        # mode probe (no keys leaked — booleans only)
├── products/route.ts      # published catalog + active shops (live rows or demo seeds)
├── zones/route.ts         # active delivery zones
├── orders/route.ts        # POST: validate → ps_place_order RPC → return order
├── track/route.ts         # GET ?id=&phone=: phone-gated lookup
├── reviews/route.ts       # GET approved-only (?product, ?featured) / POST pending
├── coupons/validate/route.ts  # POST: honest { valid, discount?, reason? }
├── shops/route.ts         # GET active shops (?zone=), contact emails stripped
├── shops/apply/route.ts   # POST public intake → pending row (5/min/IP)
├── admin/_lib.ts          # staffRoute() wrapper: auth + rate limit + errors
├── admin/orders/...       # list (filters) / detail / advance (cancel releases stock)
├── admin/products/...     # GET full catalog / POST create / PATCH update
├── admin/categories/route.ts  # POST upsert (slug ids, shared with demo)
├── admin/zones/...        # upsert + move + delete (last-zone/order guards)
├── admin/coupons/...      # upsert (409 on code clash) + delete
├── admin/reviews/...      # list (filters) / moderate+feature / delete
├── admin/shops/route.ts   # queue: list + upsert (approve/suspend/commission)
├── admin/shops/[id]/link-vendor/route.ts  # POST {email}: link Auth user as vendor owner
├── admin/payouts/route.ts  # GET balances (+?shop= settlement lines) / POST record payout
├── vendor/_lib.ts         # vendorRoute() wrapper: vendor auth + rate limit + errors
├── vendor/me/route.ts     # vendor session probe (email + role + shop)
├── vendor/orders/...      # own-shop list (?status=) / detail / advance (early states)
├── vendor/products/...    # own catalog incl. drafts / POST create / PATCH update
├── vendor/shop/route.ts   # GET + PATCH profile/prep/open (whitelisted fields)
├── vendor/earnings/route.ts    # ledger + payouts + balance
├── vendor/categories/route.ts  # active categories for the product editor
├── admin/me/route.ts      # staff session probe for the admin gate
└── media/sign/route.ts    # STAFF-ONLY Cloudinary signed-upload params (§48)
src/lib/
├── env.ts                 # typed env access + is*Configured() checks
├── supabase-server.ts     # RLS + service-role server clients (server-only)
├── staff-auth.ts          # requireStaff(): JWT verify + admin_users role (server-only)
├── vendor-auth.ts         # requireVendor(): JWT + vendor_users link + active shop (server-only)
├── use-vendor.ts          # vendor fetch + session/orders/products/earnings hooks (no demo mode)
├── order-validation.ts    # pure checkout validator (client money ignored; single-shop + shop open/zone checks)
├── shop-utils.ts          # pure shop helpers: strip, zone filter, split ETA (client-safe)
├── use-my-zone.ts         # persisted customer "deliver to" zone for discovery
├── use-guarded-add.ts     # single-shop add-to-bag guard (stages conflicts)
├── rate-limit.ts          # fixed windows: per-IP public, per-staff admin
├── api-response.ts        # JSON envelopes (always no-store)
├── live-catalog.ts        # client registry: seeds paint, live rows swap in
├── use-live-catalog.ts / use-live-zones.ts / use-public-reviews.ts
├── admin-api.ts           # typed admin fetch (401 → sign out to login)
├── use-staff-live.ts      # shared staff probe for the upgraded hooks
├── use-orders/use-catalog/use-zones/use-coupons/use-reviews.ts  # demo ↔ live
└── db/
    ├── types.ts           # row types mirroring schema.sql
    ├── mappers.ts         # rows → Product/Order/Zone/Coupon (pure, tested)
    ├── catalog.ts         # server-side published-catalog read
    ├── orders.ts          # snapshot (+ shops) / placeLiveOrder (single RPC) / findLiveOrder
    ├── admin.ts           # staff CRUD used by /api/admin/* routes
    ├── marketplace.ts     # public shops discovery + application intake
    ├── vendor.ts          # vendor-scoped orders/products/shop/earnings (+ pure guards)
    └── storefront.ts      # server page reads with seed fallback
supabase/
├── schema.sql                              # base tables, RLS, §34 machine
└── migrations/
    ├── 202609080001_storefront_saved_items.sql  # account wishlists (standalone)
    ├── 202609080002_order_guards.sql            # totals guard, pending/COD-only inserts, ps_use_coupon
    ├── 202609080003_place_order_rpc.sql         # ps_place_order: atomic checkout + coupon increment
    └── 202609090004_marketplace_shops.sql       # shops/vendors/ledger + guards + vendor RLS + settlement triggers
scripts/seed-supabase.mjs  # one-shot launch seed (upsert-safe, re-runnable)
```

## Setup (deployment owner)

### 1. Create the Supabase project

1. Create a project at supabase.com. Note the **project URL** and **anon key**
   (Project Settings → API).
2. In the SQL editor, run **all files in this order, in one sequence**:
   - `supabase/schema.sql` (base commerce schema; safe on a fresh project —
     do **not** blindly re-run it on a database that already has these tables)
   - `supabase/migrations/202609080001_storefront_saved_items.sql`
   - `supabase/migrations/202609080002_order_guards.sql`
   - `supabase/migrations/202609080003_place_order_rpc.sql`
   - `supabase/migrations/202609090004_marketplace_shops.sql`

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local` (git-ignored — never commit real keys):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server-only, never NEXT_PUBLIC_
```

Cloudinary enables the admin **Media → Upload** button (direct
file-picker uploads; the API secret never leaves the server):

```bash
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<api key>
CLOUDINARY_API_SECRET=<api secret>             # server-only
```

Without Cloudinary keys, `POST /api/media/sign` answers 503 and the media
page keeps its add-by-URL flow. Restart/rebuild Next.js after changing env.
On Vercel, set the same variables in the project settings.

### 3. Seed the launch catalog

```bash
npm run seed:dry   # review the plan (writes nothing)
npm run seed       # upsert shop #1, categories, zones, coupons, products + variants + media
```

Re-running is safe (upserts on natural keys; media rows are rebuilt per
product). The script never seeds fake orders or fake reviews.

### 4. Create the first staff account

The admin login needs a Supabase Auth user **plus** a row in `admin_users`
(roles, not URLs, are the boundary):

1. In Supabase Dashboard → Authentication → Users → **Add user** (or sign
   the address up once through any Supabase Auth form), with a strong
   password. Confirm the email there if confirmation mails are off.
2. Find the user's uuid: `select id, email from auth.users;`
3. Grant staff (run as the SQL editor / postgres role):

```sql
insert into admin_users (id, role)
values ('<auth-user-uuid>', 'admin');
```

Roles: `manager` (daily operations), `admin`, `super_admin`. All three pass
the API gate today; finer per-action roles are a hardening follow-up.
Further staff are added the same way. To revoke, delete the
`admin_users` row — the next API call answers 403 and the gate returns to
login.

### 5. Verify

```bash
npm run dev
curl localhost:3000/api/health        # "mode":"live", reachable:true
curl localhost:3000/api/products      # "source":"live"
```

Then, in the browser:
- place a test COD order through checkout: the confirmation shows a
  `PS-YYYYMMDD-NNNN` id from the database trigger; the row exists in
  `orders` + `order_items` + `order_status_history`;
- `/track` finds it from another browser with id + phone; a wrong phone
  returns the same message as an unknown id (no probing);
- sign in at `/admin/login` with the staff account: the header badge reads
  **Live data**; advance the order to `packed`, then cancel a test order
  and confirm `reserved` stock drops back;
- submit a product review as a customer: it lands `pending`, invisible on
  the storefront until **Reviews → Approve** in the admin;
- apply a coupon code at checkout and confirm misuse (expired / capped /
  wrong category) is refused with a reason, not a silent discount drop.

Rollback is instant: remove the keys (or unset them on Vercel) and the
storefront returns to demo mode — no code change, no broken pages.

## Security boundary (please read before launch)

- **Service role stays server-side.** Only `src/lib/db/*` and API routes
  import it, guarded by the `server-only` package. Client components use
  the anon browser client (`src/lib/supabase-browser.ts`) + RLS, or the API.
- **Staff routes verify JWT + role on every call** (`requireStaff` in
  `src/lib/staff-auth.ts`). No session → 401; signed-in non-staff → 403.
  Admin reads/writes flow through RLS-bound clients, and staff endpoints
  are rate-limited per staff account (30–60/min depending on the route).
- **Anonymous clients cannot write orders.** There is deliberately no anon
  `INSERT` policy on `orders`; guest checkout writes go through
  `POST /api/orders`, which validates everything and prices from the
  database. Client totals are ignored.
- **Checkout is one atomic RPC.** `ps_place_order` locks the product rows,
  re-validates price/stock/zones/coupons, inserts the order + items +
  history, and increments coupon usage — concurrent checkouts cannot
  over-sell the last unit, and a coupon can never be consumed without its
  order. Failures raise distinct `P0001` messages the API maps to 422s.
- **Tracking needs id + phone.** The API compares normalized phones
  server-side and answers 404 identically for unknown ids and wrong phones.
- **Totals are guarded twice** — TypeScript validator plus the
  `trg_orders_check_totals` trigger — and inserts are constrained to
  pending COD orders by `trg_orders_check_insert`.
- **Media signing is staff-only.** `POST /api/media/sign` requires a staff
  session (quota abuse vector otherwise) and returns short-lived signature
  material; uploads go browser → Cloudinary directly.
- **Vendor routes verify JWT + shop link + active status on every call**
  (`requireVendor` in `src/lib/vendor-auth.ts`). Suspended shops lose API
  access immediately. Vendors advance only their own orders through early
  states (the `ps_advance_order` vendor leg), edit only whitelisted shop
  fields (a `trg_shops_guard_vendor_update` trigger stops direct Supabase
  calls from touching status/commission/zones), and cannot self-feature
  products. The `/vendor` dashboard has no demo mode — without Supabase
  there are no vendor accounts, and the UI says so.
- **In-memory rate limits** blunt casual abuse only; edge rate-limiting is
  a hardening follow-up.

## Still demo-local / external (not in this phase)

- **SMS/WhatsApp** notifications and **online payment gateways** need third
  party accounts — documented only, no code paths pretend otherwise.
- Admin **Homepage CMS, Notifications, Payments, Settings** pages stay
  browser-local (no live tables yet); the dashboard, reports, customers,
  inventory and catalog-overview pages read through the upgraded hooks, so
  they reflect live data automatically.
- Hardening follow-ups: edge rate limits, audit logging (§76), per-action
  staff roles, variant-level stock counts.
