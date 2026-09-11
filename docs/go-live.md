# Go-live playbook — from launch catalog to fully seeded (owner-run)

Production (`bhromor-zeta.vercel.app`) already talks to Supabase, but on
2026-09-09 the database had **no catalog seed**, so every live checkout
failed. This doc takes the shop from there to fully real: database →
seed → staff → verify. Every step is run by the deployment owner (you);
nothing here needs the sandbox.

> Local `npm run dev` without keys paints the launch catalog, and every
> backend endpoint answers an honest 503/unavailable. There is no
> browser-local fallback store.

## 0. What “real” now covers

| Surface | Before | Now (after this playbook) |
|---|---|---|
| Catalog / zones / coupons / reviews / orders / riders / shops | Live-capable, DB empty | Seeded live rows |
| Contact form | Fake “sent” screen | `contact_messages` + admin **Messages** inbox + staff notice |
| Newsletter footer | “Opening soon” | Table-based signup + admin **Newsletter** list/CSV/unsubscribe links |
| Homepage CMS | This-browser-only | Published row in `site_settings`; storefront reads it live |
| Media library “added” shelf | This-browser-only | `media_library` table shared by all staff |
| Notifications bell + inbox | Seeded samples | Per-staff rows written by order/review/application/message/signup events |
| Low-stock threshold | This-browser-only | `site_settings['ops']`; dashboard + inventory use it live |
| Track page | No order lookup | Live orders tracked from the DB by id + phone |
| Admin “Reset demo” buttons | (removed) | No demo-reset controls exist; live data is never reset |
| Image upload | Add-by-URL only | Still add-by-URL until Cloudinary keys are set (step 6, optional) |

## 1. Apply the SQL (Supabase Dashboard → SQL editor)

Run **in this order, in one sequence** (skip files you already applied —
`schema.sql` must NOT be re-run on a database that has these tables):

1. `supabase/schema.sql` — only if the project is fresh
2. `supabase/migrations/202609080001_storefront_saved_items.sql`
3. `supabase/migrations/202609080002_order_guards.sql`
4. `supabase/migrations/202609080003_place_order_rpc.sql`
5. `supabase/migrations/202609090004_marketplace_shops.sql`
6. `supabase/migrations/202609090005_riders.sql`
7. `supabase/migrations/202609090006_engagement.sql`
8. `supabase/migrations/202609090007_rider_dispatch.sql`
9. **`supabase/migrations/202609090008_dispatch_auto.sql`** —
   auto-offer trigger + admin assign/cancel RPCs (Phase 3 slice 7)
10. **`supabase/migrations/202609100003_per_user_first10_free.sql`** —
    per-user first-10-free delivery (by normalized phone; supersedes the
    202609100001/202609100002 drafts — never apply those two)
11. **`supabase/migrations/202609110004_customer_accounts.sql`** — Smart Card
    accounts: `customers` (phone+password, no verification by design) +
    `customer_sessions`; service-role only via the /api/account/* routes
12. **`supabase/migrations/202609110005_launch_offer_free.sql`** — LAUNCH
    OFFER: store-wide first 1000 orders ride free (any zone) + ৳1000+
    subtotal always free; keeps the per-user first-10 (Zone A). Supersedes
    202609100003 — run only this one for the pricing rule
13. **`supabase/migrations/202609110006_media_video.sql`** — product/library
    videos: adds the `video` media type + `media_library.media_type`.
    No transaction wrapper by design (run the file as-is). Needed before
    saving a product with a Cloudinary/Drive video — see
    [docs/media-setup.md](media-setup.md).

Quick check after step 11 (SQL editor):

```sql
select key from site_settings where key in ('homepage', 'ops');
select count(*) from contact_messages;
select count(*) from newsletter_subscribers;
select count(*) from media_library;
select count(*) from orders where delivery_code is not null;
select count(*) from delivery_assignments;
select count(*) from customers;
```

All statements must run without “relation does not exist”.

## 2. Environment

Vercel project → Settings → Environment Variables (project settings, not
team — see `docs/vercel.md` for Config-vs-Secret types):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server-only
```

After any env change: Deployments → ⋯ → **Redeploy** with “Use existing
Build Cache” **unchecked**.

## 3. Seed the launch catalog

On any machine with the repo + `.env.local` (same three keys):

```bash
npm run seed:dry   # review the plan (writes nothing)
npm run seed       # upsert shop #1, categories, zones, coupons, products
```

Re-running is safe (upserts on natural keys). The script never seeds fake
orders or fake reviews — those arrive from real customers.

> **Checkout self-heals (2026-09-11).** If this step is skipped and a customer
> checks out, `POST /api/orders` upserts the same launch catalog in place
> (`src/lib/db/auto-seed.ts`) and places a real order. If the database refuses
> even the seed (missing schema/outage), the route answers an honest 503 —
> the storefront never invents a browser-local order. The script remains the
> recommended path: run it BEFORE launch so the very first order prices
> against seeded rows.

Verify: `GET https://<your-app>/api/products` must return products, not
`{"code":"NOT_SEEDED"}`.

## 4. First staff account

1. Supabase Dashboard → Authentication → Users → **Add user** with the
   owner email `rahatbd2050@gmail.com` (strong password; confirm the email
   there if confirmation mails are off).
2. Grant the role from a machine with the repo + keys:

```bash
npm run grant-admin -- rahatbd2050@gmail.com super_admin
```

3. Open `/admin/login` — it is the real staff login — and sign in with the
   granted account. Only Supabase Auth + an `admin_users` row works; there
   are no demo credentials.

## 5. Verify everything is real (checklist)

Do these on the deployed site, in order:

- [ ] `GET /api/health` → `"live": true`, all `checks` true (probe verifies
      seed counts + the `ps_place_order` RPC; `/admin` home shows a
      green **LIVE** banner once every check passes, an amber checklist while
      anything is missing)
- [ ] `/checkout` has no global counter anywhere — first-10-free is per phone
      (check `snapshot.customerOrderCount` on a placed order in Supabase)
- [ ] `/shop` shows the seeded catalog with live prices
- [ ] `/admin/homepage` → change the hero title → **Publish** → public `/`
      shows it (proves the CMS row + public read policy)
- [ ] `/contact` → send a message → `/admin/messages` shows it (status
      `new`) and the bell gains an unread notice
- [ ] Open the message → **Mark replied** → status flips
- [ ] Footer → join the newsletter → `/admin/newsletter` lists the email;
      **Export CSV** downloads it; copy an **Unsub link**, open it in a new
      tab → `{"unsubscribed":true}`, row flips to unsubscribed
- [ ] `/admin/media` → add an image URL → it persists across reloads and
      browsers (proves the shared table, not localStorage)
- [ ] `/admin/settings` → set the low-stock threshold → dashboard and
      inventory alerts follow it; no demo-reset buttons anywhere
- [ ] `/checkout` → place a real test order (COD) → confirmation shows the
      4-digit delivery PIN → `/track` finds it by ID + phone →
      `/admin/orders` shows it → advance it → bell notice
- [ ] Rider network: `/admin/riders` approve a rider → `/admin/riders` →
      **link rider** with the rider's Auth email → open `/rider` in an
      incognito window → sign in → `/rider` shows their job queue
- [ ] Dispatch: advance a ready order in `/admin/orders` → it appears under
      **Admin → Deliveries → Awaiting dispatch** → **Assign rider** (or wait
      for the auto-offer trigger) → the linked rider sees the offer → accept
      → pickup → deliver with the customer's 4-digit code
- [ ] `/api/rider/*` returns 401/403 for signed-out or unlinked visitors;
      delivery only closes when the customer's 4-digit code matches
- [ ] `/admin/notifications` → **Mark all read** → bell count clears
- [ ] `/api/products`, `/api/zones`, `/api/reviews?featured=1` return rows

If any step fails, see Troubleshooting below before retrying.

## 6. Optional: real image upload (Cloudinary)

Without Cloudinary keys the media page keeps add-by-URL and
`POST /api/media/sign` answers 503 — honest, not broken. To enable the
direct file-picker upload, add the four Cloudinary variables from
`.env.example` in Vercel and redeploy (see `docs/backend.md` §2).

## 7. What is not automated yet

- SMS/WhatsApp: order updates live in the staff inbox + track timeline;
  carrier delivery needs a gateway account (blueprint §35, future phase).
- A hosted newsletter page (`NEWSLETTER_SIGNUP_URL`) still overrides the
  footer form when set — for teams that outgrow the table.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `/api/products` → `NOT_SEEDED` | Step 3 not run → `npm run seed` |
| Homepage publish “works” but `/` unchanged | Migration 006 not applied → public read policy missing; apply step 1.7 |
| `/rider` shows only login | No Auth user linked to a `riders` row yet → step 5 rider check + Admin → Riders → link |
| Contact/newsletter submit → “Could not …” | Service-role key missing/typo in Vercel → step 2 + redeploy |
| Admin sign-in → “not a staff member” | Auth user exists but no `admin_users` row → step 4.2 |
| Admin API → 401 right after sign-in | Session cookie lost (private window / clock skew) → sign in again |
| Bell empty after a test order | `notifyStaff` fan-out needs ≥1 `admin_users` row → step 4.2, then re-test |
| `npm run seed` → auth/permission errors | Service-role key wrong or schema older than migrations → re-check step 1–2 |
