# Backend — Supabase + API routes (phase 1)

The storefront runs in **two modes** and always says which one:

| Mode | When | Checkout | Tracking | Catalog reads |
|---|---|---|---|---|
| `demo` | No Supabase keys (default) | Browser-local order store, as before | Browser-local store | Typed seeds in `src/lib/catalog.ts` |
| `live` | Keys set + schema applied + seeded | `POST /api/orders` writes real `orders` rows | `GET /api/track` reads real rows by id + phone | `/api/products`, `/api/zones` serve live rows |

`GET /api/health` reports the current mode. Every API response carries
`source` / `demoMode` so callers never guess, and a configured-but-broken
backend returns an explicit error — never silent demo substitution for
money paths.

## What lives where

```txt
src/app/api/
├── health/route.ts        # mode probe (no keys leaked — booleans only)
├── products/route.ts      # published catalog (live rows or demo seeds)
├── zones/route.ts         # active delivery zones
├── orders/route.ts        # POST: validate → reserve → persist → return order
├── track/route.ts         # GET ?id=&phone=: phone-gated lookup
└── media/sign/route.ts    # Cloudinary signed-upload params (§48)
src/lib/
├── env.ts                 # typed env access + is*Configured() checks
├── supabase-server.ts     # RLS + service-role server clients (server-only)
├── order-validation.ts    # pure checkout validator (client money ignored)
├── rate-limit.ts          # per-IP fixed windows for public routes
├── api-response.ts        # JSON envelopes (always no-store)
└── db/
    ├── types.ts           # row types mirroring schema.sql
    ├── mappers.ts         # rows → Product/Order/Zone/Coupon (pure, tested)
    ├── catalog.ts         # server-side published-catalog read
    └── orders.ts          # snapshot / placeLiveOrder / findLiveOrder
supabase/
├── schema.sql                              # base tables, RLS, §34 machine
└── migrations/
    ├── 202609080001_storefront_saved_items.sql  # account wishlists (standalone)
    └── 202609080002_order_guards.sql            # totals guard, pending/COD-only inserts, ps_use_coupon
scripts/seed-supabase.mjs  # one-shot launch seed (upsert-safe, re-runnable)
```

## Setup (deployment owner)

### 1. Create the Supabase project

1. Create a project at supabase.com. Note the **project URL** and **anon key**
   (Project Settings → API).
2. In the SQL editor, run in order:
   - `supabase/schema.sql` (base commerce schema; safe on a fresh project —
     do **not** blindly re-run it on a database that already has these tables)
   - `supabase/migrations/202609080001_storefront_saved_items.sql`
   - `supabase/migrations/202609080002_order_guards.sql`

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

Cloudinary is optional in this phase (add-by-URL keeps working); when ready,
fill `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET` to enable `POST /api/media/sign`.

Restart/rebuild Next.js after changing env. On Vercel, set the same three
Supabase variables in the project settings.

### 3. Seed the launch catalog

```bash
npm run seed:dry   # review the plan (writes nothing)
npm run seed       # upsert categories, zones, coupons, 7 products + variants + media
```

Re-running is safe (upserts on natural keys; media rows are rebuilt per
product). The script never seeds fake orders.

### 4. Verify

```bash
npm run dev
curl localhost:3000/api/health        # "mode":"live", reachable:true
curl localhost:3000/api/products      # "source":"live", 7 products
```

Then place a test COD order through the checkout UI and confirm:
- the confirmation shows a `PS-YYYYMMDD-NNNN` id from the database trigger,
- the row exists in `orders` + `order_items` + `order_status_history`,
- `/track` finds it from another browser with id + phone,
- a wrong phone returns the same message as an unknown id (no probing).

Rollback is instant: remove the keys (or unset them on Vercel) and the
storefront returns to demo mode — no code change, no broken pages.

## Security boundary (please read before launch)

- **Service role stays server-side.** Only `src/lib/db/*` and API routes
  import it, guarded by the `server-only` package. Client components use the
  anon browser client (`src/lib/supabase-browser.ts`) + RLS, or the API.
- **Anonymous clients cannot write orders.** There is deliberately no anon
  `INSERT` policy on `orders`; guest checkout writes go through
  `POST /api/orders`, which validates everything and prices from the
  database. Client totals are ignored.
- **Tracking needs id + phone.** The API compares normalized phones
  server-side and answers 404 identically for unknown ids and wrong phones.
- **Totals are guarded twice** — TypeScript validator plus the
  `trg_orders_check_totals` trigger — and inserts are constrained to
  pending COD orders by `trg_orders_check_insert`.
- **In-memory rate limits** (20 orders/min, 30 track/sign calls/min per IP)
  blunt casual abuse only; edge rate-limiting is a hardening follow-up.
- **Admin is still the demo gate.** Live orders are mirrored into the
  browser-local store on the ordering device so this device's admin queue
  keeps working, but staff auth + live order management via API arrive in
  the next backend phase. Do not expose `/admin` as production
  administration yet.

## Known phase-1 limits (next steps, in order)

1. **Admin on live data** — Supabase Auth staff login + `admin_users` roles,
   then admin reads/writes through authenticated API routes (order list,
   `ps_advance_order` transitions, catalog CRUD, coupon/zone/review writes).
2. **Atomic checkout RPC** — fold reserve + insert + coupon increment into
   one `ps_place_order` function so concurrent checkouts cannot over-sell
   the last unit (today: best-effort reservation, documented race).
3. **Stock release on cancel** — decrement `reserved` when an order cancels.
4. **Catalog cutover** — shop/product pages read `/api/products` (with
   SWR-style caching) instead of `src/lib/catalog.ts` seeds.
5. Reviews/coupons/notifications/CMS/media writes behind admin API routes;
   Cloudinary upload UI using `/api/media/sign`; SMS/WhatsApp on the
   notifications inbox (§35); edge rate limits + audit logging (§76).
