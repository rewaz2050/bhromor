# bhromor — PROSANTI storefront

Design-first build of **PROSANTI (প্রশান্তি)** — a premium commerce and rapid-delivery platform for Bangladesh, following the *PROSANTI Website Master Blueprint*.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Vitest**. Deploys to **Vercel**; later phases add **Supabase** (Postgres/auth/realtime) and **Cloudinary** (media).

## Current status

| Phase (per blueprint §83) | State |
|---|---|
| Phase 0 — Product definition (blueprint) | ✅ Complete |
| Phase 1 — Foundation (design system, routing, header/footer) | ✅ Complete |
| Phase 2 — Catalog & Multi-Vendor Marketplace (shops, shop apply, vendor panel, single-shop cart) | ✅ Complete |
| Phase 3 — Rider Network & Dispatch (mobile rider app, rider apply/login, 4-digit PIN verification, cash cap & settlements) | ✅ Complete |
| Phase 4 — Cart & Checkout (atomic ordering, 4-digit security PIN display, instant ETA split) | ✅ Complete |
| Phase 5 — Realtime Order Tracking (interactive live route map, simulated rider GPS, live ETA) | ✅ Complete |
| Phase 6 — Loyalty & Retention (10-order stamp card, admin reward engine, celebration unlock) | ✅ Complete |
| Phase 7 — Returns & Exchanges (7-day instant size exchange intake flow) | ✅ Complete |
| Phase 8 — Admin Control & Ops (live orders state machine, catalog CRUD, staff/shops/riders queues, cash settlements) | ✅ Complete |

The storefront paints the launch catalog instantly (`src/lib/catalog.ts` — the same source `scripts/seed-supabase.mjs` and `src/lib/db/auto-seed.ts` upsert into Supabase), then swaps in live database rows as soon as the backend answers. The admin order state machine lives in `src/lib/orders.ts`. Everything is live-only: there is no demo mode, no demo login, and no browser-local fallback store. When the backend is unconfigured, endpoints answer an honest 503/unavailable instead of pretending.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts (quality gates)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite (UI smoke + catalog/cart/orders invariants) |
| `npm run build` | Production build (what Vercel runs) |
| `npm start` | Serve production build |

Unit/component suite: 1,533 tests. Browser suite: 14 Chromium checks against a configured storefront (see `docs/browser-qa.md`).

## Premium storefront refresh

The public homepage is a shelf, top to bottom: **compact hero (headline + one button) → recently-viewed strip (returning devices only) → category row → offers → every category with its pieces → customer stories (approved reviews only; hidden when there are none) → delivery check → service promise strip**. There is no screen-filling poster any more — the category row is on the first screen of a phone. The offers block shows the flash drop while a window runs plus every piece with a struck-through price (`/shop?filter=sale` lists them all); with nothing on offer it stays away. Product pages end with the rest of the piece's own category (strictly the same category, never a "you may also like" mix). The curated new-arrival / best-seller paths and the owned visual journal remain available in the shop (`?sort=newest`, `?sort=best`). Product cards keep consistent cream-background catalogue photography and reveal Quick Add / Details controls on interaction.

The palette is warm ivory, deep charcoal/forest and restrained bronze-gold. English display type (Playfair), interface type (Inter) and Bengali copy (Noto Serif Bengali) have explicit roles. No seeded or fake ratings/reviews are rendered anywhere — public home and product pages only ever show real, approved customer reviews (verified badge only when a matching order exists); the moderation queue lives in admin.

Existing CMS hero copy and the six section toggles (hero, recently viewed, category row, offers, customer stories, service strip), search, filters, cart, wishlist, and service links remain connected. The mobile layout preserves 44px controls and uses horizontal collection/product rails to reduce page length.

## Premium feel & usability pass

A polish pass over the storefront chrome and the buying flow, keeping the same palette, type roles and motion budget:

- **Header condenses on scroll** — the announcement bar folds away and the bar drops from 80/72px to 64/56px, with a stronger blur and a soft shadow once the page moves.
- **Mobile bottom navigation is now actually rendered** (`src/components/layout/bottom-nav.tsx` existed but was never mounted): Home · Shop · Wishlist · Bag · Menu within thumb reach, hidden from `lg` up. The footer reserves space for it.
- **Product cards** stay quiet but read richer: subcategory + colour line, display title with a hairline hover underline, prices bottom-aligned across a row, struck-through compare-at price, and a calmer “Sold out” band.
- **Product pages** put the long copy into a native `<details>` accordion (Product details · Fabric & care · Delivery & returns) so phones are not one long scroll, and a **compact sticky buy bar** appears when the main CTA leaves the viewport (desktop keeps the inline panel only).
- **Bag drawer** states the flat ৳60 delivery promise up front, with a rounded close control, tabular-numeral quantity steppers and a display-sized subtotal.
- **Footer** gained an assurance strip (cash on delivery · 45–50 min · 7-day exchange).

### Delivery promise: instant, flat ৳60 delivery

**Instant delivery (45–50 min) is the headline promise** across the storefront — home trust strip, product page, bag drawer, cart, checkout, delivery page and footer. Delivery is a flat **৳60 everywhere** (`src/lib/delivery.ts`) with night/rain/express/weight surcharges on top; store pickup and free-delivery coupons ride free. There is no free-delivery threshold and no launch-offer promo. Copy lives in `DELIVERY_ETA` / `INSTANT_DELIVERY_TITLE` so the promise is edited in one place.

All motion stays inside the existing tokens (`--motion-*`, `--ease-refined`) and is neutralised under `prefers-reduced-motion`. Touch targets remain 44px; the sticky bar uses `inert` while hidden so it never traps keyboard focus.

## Product discovery update

- Header search opens a keyboard-accessible panel with live product previews, collection shortcuts, and an empty-state recovery link.
- Search matches English/Bengali names, SKU, subcategory, and category. Submitting opens `/shop?q=…`; incoming search links also work on reload.
- Shop selections appear as individually removable chips, with a clear-all action and a live result count.
- Mobile headers keep all navigation actions within narrow screens; size/colour controls use larger touch targets and the filter drawer keeps its result action visible while scrolling.
- Search and filters run over the live storefront catalog; no authentication is required.

## Conversion & usability pass (2026-09-20)

Fourteen small, real-data-only additions that make the shop easier to trust and quicker to buy from. Copy is en + bn throughout.

- **Bangla product names** on product cards (Bangla-first when the shopper reads Bangla) — sourced from `Product.nameBn`, never transliterated.
- **Share row** on every product page: WhatsApp / Facebook / copy link (uses the native share sheet on phones).
- **Customer stories** on the home page from real published reviews (`/api/reviews`); hidden until reviews exist. CMS toggle `sections.stories`.
- **CMS promo card + announcement bar** (`/admin/homepage`): the promo only advertises a code — checkout still validates it.
- **Recently viewed** rail on product pages and a strip on the home page (device-local, returning visitors only).
- **Analytics**: set `NEXT_PUBLIC_META_PIXEL_ID` and/or `NEXT_PUBLIC_GA4_ID` to load Meta Pixel / GA4 with page_view, view_item, add_to_cart, begin_checkout and purchase (amounts in taka, no personal data). Blank = nothing loads.
- **PWA**: `/manifest.webmanifest`, icons and a gentle "Add to Home Screen" card on a visitor's second day (iOS gets the Share → Add instruction). No service worker by design.
- **Product video**: a "▶ Video" badge on cards and an admin nudge listing published pieces still without a YouTube/Drive clip.
- **Arrival cue** on the product page and in the bag — "Order now → at your door by about 7:55 PM" from the checkout's own ETA maths (night surcharge named; the courier zone never gets a clock).
- **Sub-category chips** on `/shop` (`?category=men&sub=Panjabi` deep links) and a horizontal category chip bar on phones.
- **Image zoom**: hover magnifier on desktop, full-screen pinch / wheel / double-tap lightbox with pan.
- **Order again**: one tap on the account's order history or the track page re-adds a past order; anything gone, sold out or no longer offered in that colour/size is listed, never swapped; another shop's bag is only replaced after confirming.
- **Cash at the door** card in the bag: pieces + your zone's delivery charge (+ the ৳20 night surcharge when it applies), the ৳500 courier floor, and a reminder that the rider asks for the amount and the 4-digit PIN.

## Apply = sign up: shops and riders (2026-09-26)

Opening a shop or joining as a rider used to be three steps that people kept getting stuck between: send the application, then separately "Create account" on the login page with the same email, then wait for staff to approve **and** link the two by email. It is now one step, and the admin's approval is the only gate.

**What the applicant does**

- `/shops/apply` and `/rider/apply` collect the details **plus the login email and a password** (min 6, typed twice). Submitting creates the login and the pending row together — no email confirmation link, no second form. The success screen says exactly what happens next: *after approval, sign in at `/vendor/login` (or `/rider/login`) with this email and password.*
- Signing in **before** approval works but opens an "Awaiting approval" card (Check again · Sign out) instead of the dashboard; a suspended account gets a "suspended — contact support" card; a login that has no shop / rider profile is pointed at the application form. Nothing bounces between the login page and the dashboard any more.
- The moment staff approves (status → active), the same email + password open `/vendor` / `/rider`.
- The login pages are sign-in only (the "Create account" tabs are gone; "New here? Apply" links replace them).

**How it works**

- `POST /api/shops/apply` and `POST /api/riders/apply` still refuse without the service role (503) and are rate-limited 5/min/IP. The intake validates the fields **and the password** first, then `createApplicantAccount()` (`src/lib/db/applicant-account.ts`) calls `auth.admin.createUser({ email_confirm: true })`; then the row is inserted already linked (`vendor_users` owner row / `riders.user_id`). If the row cannot be written the fresh login is deleted again, so a failed submit never leaves a stray account.
- An email that **already has a PROSANTI login** (a vendor from the old two-step flow, or a rider also opening a shop) is reused when the given password matches it — verified with a throwaway sign-in — otherwise the form gets a 409 that says to use that account's password or sign in first. A signed-in applicant links the current login and needs no password.
- `requireVendor()` / `requireRider()` answer 403 with a `reason` (`pending` · `suspended` · `none`) that the login pages and shells read; the pending message is English for vendors and Bangla for riders.
- Admin → Shops / Riders show **Linked — {email} signs in … once approved** for applications (new shop rows carry `vendorLinked`, riders `hasLogin`); the manual "Link vendor / Link rider" boxes remain only for legacy or manually created rows. No database migration is needed.

Tests: `src/lib/__tests__/{applicant-password,apply-approval-gate}.test.ts`, `src/lib/db/__tests__/{applicant-account,apply-signup}.test.ts`, `src/app/api/__tests__/apply-signup-routes.test.ts`, and the apply/login page tests under `src/app/(site)/shops/apply`, `src/app/rider/{apply,login}`, `src/app/vendor/login`.

### Round 2 — running the onboarding without SMS or e-mail (2026-09-26)

There is deliberately **no SMS and no e-mail** anywhere in this flow, so the pieces that normally depend on them are done by people and WhatsApp instead:

- **Forgot password → staff reset.** `POST /api/admin/shops/[id]/reset-password` and `POST /api/admin/riders/[id]/reset-password` (admin / super_admin only, 10/min) generate a readable temporary password (`xxx-xxx-xxx`, no look-alike characters), set it with the service role and return it **once**. Admin → Shops / Riders → *Reset password* shows it with a Copy button and an "Open WhatsApp chat" link whose prefilled text never contains the password — staff read it out or paste it into the chat. Vendors change it in **Shop settings → পাসওয়ার্ড বদলান**, riders in **আমার রাইডার প্রোফাইল**, both through `auth.updateUser({ password })` on their own session (`src/components/account/change-password-card.tsx`). The login pages say so instead of promising a reset e-mail.
- **Approval hand-off by WhatsApp.** Once a row is active, the same card offers *WhatsApp: approved, sign in →* — a `wa.me` link with a Bangla message naming the login email and the absolute `/vendor/login` / `/rider/login` URL (`src/lib/onboarding-messages.ts`). Non-BD phones get a note instead of a dead link.
- **Applications are seen.** `GET /api/admin/applications` returns the two pending head-counts; `useApplicationsPending()` polls it every 30 s while the admin tab is visible and puts the numbers on the **Shops / Riders** nav links and a dashboard banner ("3 applications waiting for approval — 2 shops · 1 rider") with one-tap links into each queue.
- **Pending applicants get let in automatically.** `/vendor/login` and `/rider/login` re-check the session every 30 s (visible tab only) while the "awaiting approval" card is showing, so the dashboard opens the moment staff taps Approve — no reload, no message needed.
- **Duplicate applications** are refused on the shop's phone number as well as its email (409 with a specific message).
- **Forms.** Both application forms are split into three numbered fieldsets (details · login · zones) under a "what happens next" strip, password fields have show/hide toggles (also on both login pages), phone inputs use the numeric keypad, zone chips are real `aria-pressed` toggles at 44 px, the error banner scrolls into view and takes focus, and an "already applied? sign in" link closes the loop. Shared pieces: `src/components/apply/apply-form-ui.tsx`, `src/components/ui/password-input.tsx`, `src/components/admin/applicant-login-box.tsx`.

Still no database migration required for the above. Tests: `src/app/api/__tests__/admin-onboarding-routes.test.ts`, `src/lib/__tests__/{onboarding-messages,use-applications-pending}.test.ts(x)`, `src/components/{admin,account,apply,ui}/__tests__/*` for the new components, plus the extended login/dashboard/admin-gate tests.

### Round 3 — "Forgot password?" as a request the admin approves (2026-09-26)

The one thing round 2 still needed a phone call *to start* was a forgotten password. It is now self-service on the applicant's side and a decision on the admin's side — still with no SMS and no e-mail:

1. **Request.** `/vendor/login` and `/rider/login` have **পাসওয়ার্ড ভুলে গেছেন? / Forgot your password?** → email + phone as they appear on the shop / rider row → `POST /api/auth/reset-request`. The server resolves the login behind that pair (shop `contact_email` + `phone` → `vendor_users` owner; rider `contact_email` + `phone` → `riders.user_id`), files one open request per login (`password_reset_requests`, migration `202609260001`), and pings the staff inbox + Web Push. Unknown pair → a plain 404 message; 5/15 min per IP, 3/h per email.
2. **Decide.** Admin → **Access requests** (`/admin/access`, counted on the nav badge and the dashboard banner with the applications) shows each request with **Call** (`tel:`) and a WhatsApp "did you ask for this?" button. **Approve** stays disabled until the admin ticks *"I spoke to them on … and they confirmed"* — the phone call is the identity check, because a shop's email and phone are semi-public. Approve opens a 24-hour window; **Reject with note** leaves a note the requester sees. Both then offer a prefilled WhatsApp message (`resetApprovedMessage` / `resetRejectedMessage`). Admin / super_admin only.
3. **Set.** The login page keeps polling `GET /api/auth/reset-request` every 20 s (and remembers the request in `localStorage`, so closing the tab is fine). When the status turns `approved` it switches to a new-password form by itself; `POST /api/auth/reset-complete` sets the password with the service role **only** while an approved, unused, unexpired request exists for exactly that email + phone pair, then marks it `used`. The login form is prefilled with the email. `rejected` shows the note with *Request again*; `expired` (24 h passed) says so and lets them re-file.

Nothing secret is ever generated or transported in this path: identity is the email + phone pair the requester already knew, the staff phone call, and the window. Status derivation (`effectiveStatus`), matching, the one-open-request rule and the full request → approve → complete → reuse-refused machine are covered in `src/lib/db/__tests__/password-reset.test.ts`; routes in `src/app/api/__tests__/reset-request-routes.test.ts`; the panel in `src/components/auth/__tests__/forgot-password-panel.test.tsx`; the queue page in `src/app/admin/access/__tests__/admin-access.test.tsx`. **Requires** `supabase/migrations/202609260001_password_reset_requests.sql` (one table, one staff RLS policy); until it is applied the login page answers 503 with a Bangla note and Admin → Access requests tells you what to run — the card-level *Reset password* from round 2 keeps working meanwhile.

### Round 4 — review decisions, rider KYC, phone-number login, vendor checklist (2026-09-26)

Four things the queue still could not do, all without SMS/e-mail (bKash/Nagad payout capture is deliberately **not** in this round — there is no merchant account yet):

1. **Reject with a reason, and every decision is audited.** Shops and riders gain a fourth status, `rejected` (migration `202609260002_application_review.sql`: constraint widened + `review_note`, `reviewed_by`, `reviewed_by_email`, `reviewed_at`; riders also get `kyc jsonb` + `kyc_submitted_at`). Admin → Shops / Riders now use one `ReviewActions` strip: **Approve**, **Reject…** (inline textarea — the reason is required, the applicant reads it), **Suspend** (confirm + optional staff note), **Re-open** / **Re-activate**. All go through `POST /api/admin/{shops,riders}/[id]/review` (`reviewApplication` in `lib/db/admin.ts`), which stamps who/when; the card shows *"Rejected by admin@… · 5 min ago"* plus the note, and the login box offers a prefilled WhatsApp *"not approved, here is why"* (`applicationRejectedMessage`). On the applicant's side `requireVendor` / `requireRider` answer 403 with `reason: "rejected"` and the note in the message; `/vendor/login` and `/rider/login` show it with **Fix the details and re-apply →**. Re-applying with the same login (or same email + password) **updates the rejected row back to `pending`** with the new details and a cleared verdict (`applyShop` / `applyRider` `resubmitted: true`; the update is fenced to `status = 'rejected'`), and the staff inbox gets *"re-submitted"*. Rejected/suspended rows no longer block a fresh application on the same phone. The vendor/rider self endpoints strip the review trail (`withoutReview`) — the reviewer's e-mail is staff-only.
2. **Rider KYC before approval.** While pending (or rejected and fixing), the rider's login page shows **পরিচয়ের কাগজপত্র (KYC)**: NID front, NID back, selfie with NID, and driving licence for bike/scooter (`lib/rider-kyc.ts` — required set depends on the vehicle). Each button opens the phone camera; the photo goes straight to Cloudinary with a signature from `POST /api/rider/kyc/sign` (folder `prosanti/rider-kyc`) and the URL is stored via `POST /api/rider/kyc` with the service role — only `https://res.cloudinary.com/<our cloud>/image/upload/…` is accepted, one per document, and `kyc_submitted_at` is stamped the first time the required set is complete. These are the only rider routes a pending applicant may call (`requireRider({ allowApplicant: true })`; jobs/cash stay active-only). Admin → Riders shows a **KYC 2/3** badge and, on pending/rejected cards, thumbnails that open full-size plus the missing list. Cloudinary not configured → 503 with a Bangla note; the application stands.
3. **Phone-number login, no SMS.** The e-mail field on both apply forms is optional. Without one, the server mints a synthetic login address from the mobile number — `01712345678@phone.prosanti.app` (`lib/phone-login.ts`; nothing is ever sent there) — and creates the Supabase user under it. Every login form and the reset panel now take **email or mobile number** (`loginIdentifierToEmail`: e-mail passes through, any BD spelling of a number — `+880`, spaces, Bangla digits — maps to the synthetic address). Success screens and the approval WhatsApp message tell the applicant to sign in with *the mobile number*; staff screens show `01712345678 (phone login)` instead of the synthetic address (`describeLoginEmail`).
4. **Vendor "Get your shop ready" card** on `/vendor`: phone + pickup address, tagline, first 3 live products, a photo on every live product, shop switched to Open (`lib/vendor-onboarding.ts`; `components/vendor/onboarding-checklist.tsx`). Progress bar + per-step link; the Open step flips the existing dashboard toggle; the card removes itself once complete and never flashes while products load.

Tests: `src/lib/__tests__/phone-login.test.ts`, `rider-kyc.test.ts`, `vendor-onboarding.test.ts`, `apply-approval-gate.test.ts` (rejected + KYC gate), `src/lib/db/__tests__/apply-signup.test.ts` (re-apply, phone-only apply), `rider-kyc.test.ts`, `src/app/api/__tests__/application-review-routes.test.ts`, `rider-kyc-routes.test.ts`, `src/components/admin/__tests__/review-actions.test.tsx`, `src/components/rider/__tests__/kyc-upload-card.test.tsx`, `src/components/vendor/__tests__/onboarding-checklist.test.tsx`, plus the login-page and applicant-box suites. **Requires** `supabase/migrations/202609260002_application_review.sql`; until it runs, the review buttons answer 503 naming the file and the KYC card says uploads are not enabled yet — approve/suspend from the old upsert path keeps working.

## Free delivery threshold — platform AND per-shop (2026-09-26)

"Add ৳150 more and delivery is free" — the cheapest average-order-value lever a bag can have, now a real, priced rule instead of a hard-coded promo. Two independent switches, both optional:

- **Platform rule** — Admin → Settings → *ফ্রি ডেলিভারি — প্ল্যাটফর্ম অফার*: on/off + minimum item subtotal (৳100–৳50,000; default OFF at ৳999). Stored in the ops settings document as `freeDelivery: {enabled, minSubtotalPaisa}` (`lib/settings-store.ts`, public via `/api/settings`). **PROSANTI pays** — the shop's payout is untouched.
- **Shop rule** — Vendor → Settings → *ফ্রি ডেলিভারি অফার (ঐচ্ছিক)* (owner only; staff get 403) or the admin's shop editor: on/off + the shop's own minimum, column `shops.free_delivery_min` (paisa, NULL = off). **The shop pays** — `ps_write_shop_ledger` deducts the waived rider charge from that order's `payable` (`greatest(0, payable − waived)`).

Rules (`lib/free-delivery.ts`, mirrored 1:1 in SQL): the shopper's target is the **lowest armed minimum**; who pays is decided at placement **platform first, then shop**; the waiver covers the base zone charge **plus every surcharge**; it never applies on the courier leg (z4), on store pickup, on a return order, or on top of a free-delivery coupon / PROSANTI+ (those already waived everything). `ps_place_order` (migration `202609260003_free_delivery.sql`, an in-place patch of the live function) prices it from the live rows and records `orders.free_delivery_by` (`'platform' | 'shop'`) + `orders.free_delivery_waived`; the TypeScript validator computes the same so the quote is honest, and `ps_check_order_totals` still guards the arithmetic.

What the customer sees: a **progress bar** in the bag drawer and `/cart` (`components/cart/free-delivery-bar.tsx` — "আর ৳১৫০ যোগ করলে ডেলিভারি ফ্রি" → "এই অর্ডারে ডেলিভারি ফ্রি 🎉 · দোকানের অফার / PROSANTI অফার", a *keep shopping* link back to the shop, and the scope line "সদরের ভেতরে — কুরিয়ারে নয়"); a **pill** on shop cards, the shop hero and the PDP seller line (`components/shop/free-delivery-pill.tsx`); the checkout delivery row reads **ফ্রি — দোকানের অফার / PROSANTI অফার** with the struck-through charge; track, admin and vendor order pages name the payer; the staff inbox line says which offer paid. Nothing renders on a shop where neither rule is armed — the bag looks exactly as before.

Tests: `src/lib/__tests__/free-delivery.test.ts` (sanitizer, parser, offers/target/payer, breakdown mirror), `order-validation.test.ts` (platform / shop / precedence / courier / pickup / PROSANTI+), `src/lib/db/__tests__/vendor.test.ts` (owner sets/clears, staff 403), `src/components/cart/__tests__/free-delivery-bar.test.tsx`. **Requires** `supabase/migrations/202609260003_free_delivery.sql`; until it runs, saving a free-delivery minimum answers 503 naming the file (profile saves without the field are unaffected) and the RPC keeps charging as before.

## UX plan R0 — first-party funnel: the shop's own numbers (2026-09-26)

§০ of `docs/ux-sales-plan.md`: *what cannot be measured cannot be fixed*. Until now the funnel events only went to GA4 / Meta — when those ids are set. Now the storefront keeps its **own** copy, anonymous and first-party, and Admin → Reports prints the rates every later UX round is judged by.

- **Events** (`lib/analytics.ts` `track()` → `lib/events-sink.ts`): `page_view` (every one, including the first — sessions, bounce, pages/session), `view_item`, `add_to_cart` **with its source** (`card` quick-add / `pdp` / `bundle` / `live` — `addItem`'s fourth argument), `begin_checkout`, `purchase`, `search` (query + result count, once the typed text rests 800 ms; zero results = demand we don't stock), `view_item_list` (a rail/grid scrolled ≥ 25 % into view — `components/analytics/list-impression.tsx`, `data-list` on the offers rail, every category shelf and the shop grid), `select_item` (card tap credited to the nearest `data-list`), `scroll_depth` (home 25/50/75/100 %, `scroll-depth-tracker.tsx`). Vendors still get their usual payloads when configured; nothing here depends on them.
- **Wire** (`lib/funnel-events.ts`): tiny JSON `{sid, events:[{t,p,pid,shop,src,v,lang,meta}]}`, ≤ 25 events, batched every 4 s / on `pagehide` via `sendBeacon`. The session id is a random per-tab token in `sessionStorage` — no cookie, no user id, no IP stored.
- **Sink** — `POST /api/events`: whitelist + trim + cap, 60 batches/min/IP, insert into `storefront_events` with the service role, **always 204** (a beacon has nobody to show an error to; an unapplied migration never breaks the shop). Table has RLS on with no policies and all grants revoked from `anon`/`authenticated`.
- **Report** — `ps_funnel_report(p_days)` (SQL, security definer, staff route only) → `GET /api/admin/reports/funnel?days=7|28` → the **Funnel** card (`components/admin/funnel-card.tsx`): sessions · bounce · pages/session · session→order; **product page → add to bag → checkout → order** step rates; average order and repeat-customer rate **from the `orders` table** (cancelled + return excluded — the "order" step is real money); add-to-bag by source chips; top searches with a *no results* flag; home scroll-depth bars. 503 → "run `202609260004_storefront_events.sql`". `ps_prune_storefront_events(days)` keeps the table small (optional cron).

Tests: `src/lib/__tests__/funnel-events.test.ts`, `events-sink.test.ts`, `src/app/api/events/__tests__/route.test.ts`, `src/components/analytics/__tests__/funnel-tracking.test.tsx` (first page view, search settle/dedupe, select_item list credit, quick-add source, list impression, scroll marks), `src/components/admin/__tests__/funnel-card.test.tsx`. **Requires** `supabase/migrations/202609260004_storefront_events.sql`; until it runs the storefront still sends (204, dropped) and the Reports card names the file.

## UX plan R4 — the listing remembers: URL state, back-restore, sticky filter bar (2026-09-26)

§3 of `docs/ux-sales-plan.md` — the listing page's biggest time-killer was starting over after every product page:

- **The filters are the URL** — `lib/shop-url.ts` (`shopSearchString`, `parseList`, `resolvePriceBand`, price bands) + `ShopBrowser`: every change to category / sub-category / new / sale / query / mood / price / sort / **sizes / colours / in-stock** is written with `history.replaceState` (no server round-trip, no history spam; foreign params like `utm_*` survive), and `app/(site)/shop/page.tsx` parses the same params (`?size=M,L&color=Ivory&stock=1&price=<band>`), so reload, a shared link and **Back** all show the same list. The first render never rewrites the URL the server just produced.
- **Scroll restore** — before a card opens a product page the grid stamps `scrollY` on the current history entry (`SHOP_SCROLL_KEY`); when that entry is revisited the browser restores it once the grid is tall enough (rAF, ≤ 20 tries), then clears the stamp. A push navigation to `/shop` never inherits it.
- **Sticky compact bar** — *Filters (n) · N products · Sort* stays under the condensed header (`top-14` / `sm:top-[4.1rem]`) on every breakpoint; the search field and deliver-to select stay in the toolbar above.
- **Sold-out last** in the default *Featured* order (in stock → featured → catalog order); the result line now carries the zone's charge and time (*Deliver to Zone A · ৳60 · 40–50 min*).

Tests: `src/lib/__tests__/shop-url.test.ts`, `shop-browser.test.tsx` (URL writes + foreign params, `?size/stock/price` start state, sold-out last, scroll stamp/restore).

## UX plan R3 — best-seller / new-arrival rails, area pill (2026-09-26)

§2 + §1.2 of `docs/ux-sales-plan.md`, the first-screen items:

- **Curated rails after the category row** — `components/home/curated-rails.tsx`. *Best sellers* is ranked by real orders (`unitsSold` from `v_product_sales`, in stock only) and stays away until the shop has **two** genuine sellers; *New arrivals* leads with the shop's `isNew` flag, then the newest rows, needs a real row (**4+**) and never repeats a best seller. Both are plain `ProductRail`s (`data-list` `best-sellers-rail` / `new-arrivals-rail` for the funnel) linking to `/shop?sort=best` / `?sort=newest`, and both have Admin → Homepage section toggles (`sections.bestSellers`, `sections.newArrivals`, default on). Test `curated-rails.test.tsx`.
- **"Area: Borpara ▾" pill** — `components/layout/zone-pill.tsx`: a native `<select>` dressed as a pill (works on every phone, no popover to trap focus) that reads/writes the one remembered zone (`useMyZone`) the home delivery check, the PDP delivery line, the shop browser and checkout already share. In the header from `sm` up; inside the hero on phones. en + bn (`zonePill.*`). Test `zone-pill.test.tsx`.

## UX plan R1/R2 — card price block, personal delivery line, bag mini-bar, add-ons first (2026-09-26)

The first items of `docs/ux-sales-plan.md` after the free-delivery decision, each small and measurable:

- **Product card price block (§1.1)** — one rule everywhere: current price, struck old price, and a **"Save 20%" / "২০% ছাড়"** chip computed from the shop's `compareAtPrice` (flash drops keep their image ribbon instead). **"Only 2 left" / "মাত্র ২টি বাকি"** when the row carries a real count ≤ 3, "Only a few left" from the shop's low-stock flag alone; sold-out cards show neither. Bengali digits in Bengali. `components/product/product-card.tsx`, test `product-card-price-block.test.tsx`.
- **Personal delivery line on the PDP (§4)** — `components/delivery/delivery-line.tsx` under the arrival cue: the shopper's remembered zone (`useMyZone`, shared with the home check, shop browser and checkout) → **"বড়পাড়ায় ডেলিভারি ৳৬০ · ক্যাশ অন ডেলিভারি · ৳৯৯৯+ অর্ডারে ফ্রি"**; the courier story for z4 (charge · days · minimum order from settings); and, when no zone is remembered, **"আপনার এলাকায় পাঠাই কি?"** with a zone picker that writes the same remembered zone. Test `delivery-line.test.tsx`.
- **Sticky bag mini-bar on listing pages (§1.3)** — `components/cart/bag-mini-bar.tsx` (mounted in the site layout, phones only): while the bag has pieces on `/shop`, `/shops/*`, `/campaign/*`, `/wishlist`, `/live`, `/style`, a bar above the bottom nav reads **"৩টি পণ্য · ৳১,২৫০"** (tap → bag drawer) + **চেকআউট →**. Never on the product page (own buy bar), bag or checkout, and hidden while the drawer is open. Test `bag-mini-bar.test.tsx`.
- **Add-on rail leads with the cheapest complements (§5)** — the bag drawer's *Pair it with* now sorts `completeTheLook` candidates by price and stays inside the bag's shop (single-shop rule), so the suggestion is a one-tap yes.

## Menubar redesign (2026-09-26)

A UI/UX pass on the storefront chrome — the parts every page shares — so it reads like a professional shop and is easier to use, in both languages.

**Desktop header**

- **Categories is a real menu.** Hover or click opens a panel of every category that has pieces (thumbnail, count), the garment types inside each as chips (`/shop?category=…&sub=…`), and an "All products / Offers" footer. Keyboard: `Escape` closes and returns focus; clicking elsewhere or navigating closes it. Until the live catalog answers it is the plain jump to the home shelf it used to be. Data comes from `src/lib/category-menu.ts` (`categoryMenuEntries`), which only lists discoverable pieces and follows the shop's declared sub-category order.
- **Search you can see.** From 1280px the search trigger is a field-shaped button showing the placeholder ("Panjabi, shirts, gamcha…") instead of a lone magnifier; below that it is the round icon. It is still one button (`aria-label` "Search products") opening the same full-screen search.
- **Quieter wayfinding.** Nav labels lost their pill boxes; the current section is marked by colour and a gold hairline. The in-page `Categories` jump (`/#collections`) is never marked "current" (it lit up on the home page before, reading as a page you were on). Account is one tap from every desktop page.
- Language switch is a light hairline pill; the actions read left-to-right as language · search · wishlist · account · bag.

**Phone**

- Announcement bar is always one line (truncates with a title tooltip, no more two-line wrap); the wordmark steps aside below 360px instead of colliding with the language toggle.
- **Drawer rebuilt:** language row first (P1 #8 stays), Account / Wishlist (with count) / Track Order tiles, Shop · Offers · Shops rows, then **every category with a thumbnail and count** linking into the filtered shop, then Help. Panel is ivory, 88% wide, sticky header with the brand and a close button.
- Bottom bar: the active tab sits in a soft pill; the bag count is a badge (99+ cap) with a spoken label ("Open bag, 3 items").

**Bengali typography (systemic)**

- `--font-display` now falls back to Noto Serif Bengali, so the 129 `font-display` headings render Bangla in a serif instead of a fallback sans; `:lang(bn)` drops the letter-spacing that spread Bengali conjuncts apart (`tracking-*` and uppercase eyebrows) and removes synthetic italics.
- `<html lang>` is set **before first paint** by a tiny inline script in the site layout (stored choice, else `bn`), so these rules apply from frame one instead of flipping after hydration. Latin wordmarks/announcements carry `lang="en"` and keep their tracking.

**Found and fixed on the way**

- **The whole storefront remounted about a second after every page load.** `AccountWishlistProvider` switched wrapper element types when the customer-session probe answered, so React threw away the header, page and footer: a search or menu opened in that first second vanished, typed text was dropped, and every entrance animation replayed (the "blink" after load). It now keeps one element and only changes the context value; a device without a cloud client is a guest immediately (no blank-then-jump wishlist count). Regression test: `src/components/account/__tests__/account-wishlist-stability.test.tsx`.
- The Playwright storefront suite had gone stale against the Bangla-default storefront (English locators, an old dialog name). It now pins the remembered language to English per test, uses the current names and tolerates pages that nest their own `<header>`. It still needs a configured catalog to pass end to end — see `docs/browser-qa.md`.
- `npm run lint` no longer trips over Playwright's generated report under `.cache/`.

New strings are keyed in en + bn (`header.search`, `categoryMenu.*`, `mobileDrawer.*`). Tests: `src/lib/__tests__/category-menu.test.ts`, `src/components/layout/__tests__/{category-menu,mobile-nav-catalog,nav-links}.test.tsx`.

## Menubar polish (2026-09-21)

- **The nav is actually centered now** — the pills sat `ml-auto`, crammed against the search/wishlist/cart icons while the code comment claimed "centered". The bar is now three balanced zones: brand | nav | actions.
- Pill rhythm: 0.66rem → 0.72rem semibold, roomier padding — the 5-item bar reads instead of squeaks.
- **Offers gets a gold glow-dot** so the sale entry feels intentional, not like a sixth grey pill.
- Bottom bar: the active tab's label is now semibold (the gold tick + heavier stroke were doing all the work before).

## Realtime phone notifications for admin (2026-09-21)

Orders, reviews, stock alerts and other staff notices now **buzz the owner's phone even with the admin panel closed** (Web Push + VAPID; the in-panel inbox keeps its 15s poll + beep).

Setup once:
1. Generate keys: `npx web-push generate-vapid-keys`
2. Set env on the host: `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` (optional `PUSH_VAPID_SUBJECT`, mailto:)
3. Apply `supabase/migrations/202609210001_push_subscriptions.sql`
4. Admin → Notifications → **"Phone notification ON korun"** → tap **Test pathan**

Notes: staff-gated end to end (`/api/admin/push`, device table service-role only). Android: any browser. iPhone: the panel must be installed via "Add to Home Screen" (iOS 16.4+). Missing keys = honest off switch, nothing throws. Dead subscriptions (404/410) are pruned automatically; fan-out is capped at 2.5s so checkout never waits on a push service. `public/sw.js` has no fetch/cache handler on purpose — live prices stay live — and is registered only from the admin surface.

### "Notification on korte partesi na" — the five checks (2026-09-23)

The card on `/admin/notifications` is now a live checklist. Every row is read from the real state, so the failing one names itself:

| Check | If it is red | Fix |
|---|---|---|
| **Server key (VAPID)** | host env has no keys → the card shows no ON button at all | `npx web-push generate-vapid-keys` → `PUSH_VAPID_PUBLIC_KEY` + `PUSH_VAPID_PRIVATE_KEY` in Vercel env → Redeploy (see `.env.example`) |
| **Database table** | `push_subscriptions` does not exist → saving answers 503 | SQL Editor → `supabase/migrations/202609210001_push_subscriptions.sql` |
| **Ei browser** | opened inside WhatsApp / Messenger / Facebook / TikTok / Google app (Android WebView) or over http | open the panel in **Chrome** on https |
| **Browser permission** | `Block` was answered once → **the site can never prompt again** (Chrome auto-denies untapped prompts). The card prints hand-set steps: 🔒 site settings → Permissions → Notifications → Allow; Chrome → Settings → Site settings → Notifications → remove the site from "Not allowed" | on Android 13+ the **Chrome app** needs it too: Settings → Apps → Chrome → Notifications → ON (Nothing OS: App info → Notifications → "Sites"/"General"); battery → **Unrestricted** |
| **Ei phone ta** | this browser holds no subscription (permission granted but nothing saved) | one tap on **Phone notification ON korun** — it subscribes and saves; opening the card with permission already granted re-saves silently, healing a rotated/lost endpoint |

Also fixed here: in-panel alerts go through `ServiceWorkerRegistration.showNotification()` — `new Notification()` is an **illegal constructor on every mobile Chrome**, so the old inline call showed nothing on Android while the desktop thought it had alerted — and the beep now resumes its suspended `AudioContext` on the first tap (mobile Chrome's autoplay policy kept it silent before). `notifyStaff()` events → Web Push fan-out is unchanged.

## The shop's clock — work that happens without opening the panel (2026-09-24)

The owner's question was *"system ta automate kora jabe?"* — and the honest
answer started with what was still manual: a rider's unanswered offer expired
only when somebody next loaded a dispatch board, "your parcel comes this
evening" was a phone call, and yesterday's numbers required opening `/admin`.

Now `.github/workflows/cron.yml` calls a token-gated **`/api/cron/tick`** every
15 minutes (free, public repo — no Vercel Pro, no new account) and the app
decides what is due:

| Job | Effect |
|---|---|
| `expire-offers` | stale rider offers expire and the order returns to the dispatch board by itself |
| `delivery-reminders` | ~2 hours before the window the shopper chose at checkout: **"আজ আপনার পার্সেল আসছে 🛵"** with the shop's own label ("সন্ধ্যায় (৬–৯ PM) · 24 Sep, 6:00 pm") |
| `daily-digest` | at 9am Dhaka, one staff push (inbox + phone): yesterday's orders/takings, today's orders, what is still open, today's scheduled deliveries, low stock, shoppers waiting on a price/restock |

Alongside it, **price-drop and restock watches now push instead of always
calling**: a watcher whose phone is subscribed hears the news the moment the
product is saved, and the staff note keeps only the numbers that could *not* be
reached — "১ জনকে ফোনে খবর পাঠানো হয়েছে · বাকি ২ জনকে ফোন করুন" — or says
plainly that there is nobody left to call. Without VAPID keys or any opt-in,
the note is exactly the call list it was before.

Nothing is required for orders to work: every job is a courtesy that saves a
phone call. The tick answers an honest JSON report per job (`ran` / `skipped` /
`failed` + why), and `/api/health` reports `cronConfigured`, `cronMarksReady`
and `cronLastRunAt`. Setup (one secret, one migration, both free):
**`docs/automation.md`**.

## Customer notifications — the shopper's phone buzzes too (2026-09-24)

Until today the store had **no automatic customer channel at all**: shoppers
learned nothing until they re-opened `/track`, and "order kothay?" was
answered by the shop phoning them. Now **the receipt itself** carries
**"অর্ডারের খবর ফোনে নিন"** — the one moment a shopper is certainly looking —
and so does the tracker of a live order. One tap, and that phone follows the
whole journey (plus payment verified and cancelled) in Bangla or English,
whichever the shopper was reading.

| Sent when | Customer sees |
|---|---|
| order placed | অর্ডার পেয়েছি ✅ |
| confirmed (staff **or** the shop's own panel) | অর্ডার কনফার্ম হয়েছে ✅ |
| the shop starts packing | প্যাকিং চলছে 📦 |
| packing done | প্যাকিং শেষ — রাইডার ডাকা হচ্ছে 🛵 |
| a rider accepts the delivery | রাইডার নিয়োগ হয়েছে 🛵 |
| rider picked it up | রাইডার আপনার পার্সেল নিয়েছে 🛵 (+ keep the 4-digit code ready) |
| delivered | ডেলিভারি হয়েছে 🎉 |
| cancelled | অর্ডার বাতিল হয়েছে — nothing to pay |
| wallet payment verified (admin or shop) | পেমেন্ট ভেরিফাই হয়েছে ✅ |

One message per real step, and a step the shop skips sends nothing — the
two-tap flow may never touch `preparing`, and batch-assigning an order to a
rider is only an offer (90 s, may expire untaken), so the "rider assigned"
message waits for the rider's own accept.

**The free fallback for the shoppers push cannot reach** (2026-09-24): when a
step's push reaches **no device** — the shopper never tapped the opt-in card,
or every device is dead — the same message is written to `wa_outbox` as a
draft. The order page shows it under the status buttons as *"WhatsApp message
ready"* and the orders list carries a strip with a count; **one tap opens the
shop's own WhatsApp Business app with the text already written**, and the
staff member presses send. No Meta account, no template approval, no
per-message fee — and the row records `opened_at`, never a claim that WhatsApp
delivered it. A newer step supersedes a draft that has not been opened, so a
shopper can never be sent "confirmed" after "out for delivery".

Setup — **nothing new**: the same VAPID keys power staff and shoppers.
1. Apply `supabase/migrations/202609240001_customer_push.sql` (shopper push)
   and `supabase/migrations/202609240003_wa_outbox.sql` (the draft fallback)
   — both already appended to `supabase/bootstrap-fresh.sql`.
2. Place a test order → the receipt offers **ফোনে খবর চালু করুন** (or open
   `/track`) → tap it → **টেস্ট পাঠান**.
3. Confirm the order in the panel → the shopper's phone buzzes; tapping the
   notification opens *that* order's tracker. Every later step — packing,
   rider assigned, picked up, delivered — buzzes on its own.
4. Advance an order whose shopper never opted in → the same page shows the
   WhatsApp draft instead; tap **Open in WhatsApp** and press send.

Notes: the endpoint is public by necessity (shoppers are guests) but a device
can only be registered with the tracker's own proof — order number **and**
that order's phone — and only ever against the number the order carries.
Dead endpoints (404/410) are pruned; fan-out is capped at 2.5 s so checkout
never waits on a push service. Missing VAPID keys or a missing migration =
honest off switch, the card says which. Full picture, plus the roadmap for
WhatsApp automation → email sender → customer in-app inbox:
[`docs/customer-notifications.md`](docs/customer-notifications.md).
`/api/health` reports `customerPushTableReady` and the device count.

## Account dashboard rebuild (2026-09-21)

- **Hero up top** — greeting by name, phone chip, PROSANTI+ status chip (best-effort read, hides on failure), one-tap "track your last order" (the device's remembered receipt), wishlist count, and sign-out. The identity block used to sit at the BOTTOM of the card stack; logout was effectively undiscoverable.
- **Four lazy tabs** — Orders (landing) · Smart Card · Refer & Earn · PROSANTI+. Each programme mounts only when its tab opens, so its fetch fires once, when needed — no 8-request card stack, no endless scroll.
- **Guests: form first** — the signup/login form leads beside an honest "why an account" card (stamps, referral, history/tracking, PROSANTI+), teasers below. The auth flow, labels and error handling are byte-identical to the audited version.
- **Bilingual page heading** — the hardcoded English h1/eyebrow moved into the client view and now follows the language switcher; the heading renders even while the session probe runs.
- New copy is translation-keyed (`accountHero.*`, `accountTabs.*`, `accountPitch.*`, en+bn).

## Menubar pass (2026-09-21)

- **Offers pill** in the desktop bar and the drawer — appears only while pieces are genuinely on offer (admin-priced) and owns `/shop?filter=sale` exclusively: the sale tab never lights on the plain shop, and vice versa.
- **"Collections" → "Categories"** (en + bn) — the link jumps to the home category shelf, and the old name oversold it.
- **Track** joins the desktop bar (it lived only in the footer before).
- **Active state parity** — a product page now lights the Shop pill on desktop, same ownership the phone's thumb bar already used.
- **Drawer orientation** — the page you are on is highlighted in gold with a check, so the open menu tells you where you are.

## Performance audit (2026-09-21)

Measured on the production build (gzip on the wire): home **≈265 KB JS**, /shop ≈257 KB, /checkout ≈278 KB; CSS ≈134 KB raw; local TTFB 8–150 ms (first hit warms the dynamic shop route). Findings fixed:

- **Admin code no longer ships to shoppers** — `usePublicSettings` lives in its own module; importing it from the staff settings hook had pulled the admin-auth client (admin email + the secret ops-gate path) into every customer page's bundle. Customer surfaces (checkout, referral step, price-watch strip, bag COD card, arrival cue) now use the clean module. Rebuilt and verified: no admin markers in any storefront chunk.
- Same audit surfaced and fixed a real bug: customer surfaces were reading ops settings through the **staff hook**, so shoppers always got launch defaults regardless of what the admin saved.

## Admin-owned pricing (2026-09-21)

Every money knob is now the owner's, end to end:

- **Surcharge amounts** (night / rain / express / per-kg) and the **courier minimum order** moved from hard-coded constants into Admin → Settings → Delivery — set them in taka, save once.
- They flow everywhere through **one public read**: `GET /api/settings` (the sanitized ops document, nothing secret) → checkout quote, server-side order pricing (which also honours the toggles now — an older gap), the bag's cash-at-the-door card, the arrival cue and the delivery page.
- Checkout now reads these via `usePublicSettings()` instead of the staff-only hook — previously customers silently got launch defaults no matter what the admin set.
- Launch defaults match the old constants (৳20 / ৳15 / ৳40 / ৳10·kg, floor ৳500), so nothing changes until the owner changes it.

## UI/UX feel pass (2026-09-21)

- **Skeletons on every streamed route** — account, track, wishlist and checkout now show the brand-shaped placeholder (and the collection skeleton matches the real 4:5 cards). No blank flashes.
- **Empty states that recover the shopper** — the empty cart page and the shop's no-result state carry the device's recently-viewed pieces (returning visitors only).
- **Tap feedback** — quick add, add-to-bag and place-order acknowledge the press; the header bag icon pops when the bag changes.
- **Sticky mobile buy bar** — photo + flash-aware price + Add docks at the bottom edge once the purchase panel scrolls away; taps scroll back to the one real CTA.
- **Haptics** — a small vibration on added-to-bag and order-placed (Android; silently skipped elsewhere).

## Speed pass (2026-09-21)

- **Preconnect** to `res.cloudinary.com` / `lh3.googleusercontent.com` (+ dns-prefetch for YouTube thumbs) from the root layout — the media hosts' DNS+TLS is warmed before the catalog images are discovered, which matters on mobile networks.
- **Image optimizer**: AVIF → WebP explicitly, and `minimumCacheTTL` raised to 31 days — a photo is encoded once and served from the CDN instead of being re-encoded every week.
- Bengali fonts were already unicode-range–subset by Fontsource (Bengali / Latin split per weight), so devices only download the glyphs they render.

## The weekly pulse (2026-09-21)

Admin → Reports gains a six-number strip over the selected window — the owner's Monday-morning glance: orders + booked money, cancel rate, delivered with the **real average delivery minutes**, repeat customers (same phone, ≥2 live orders), the bKash/Nagad verification queue with its median wait, and cash actually collected at the door. All computed from the same live orders as the rest of the page; dashes when the window is empty, never invented numbers.

## Referral & review asks (2026-09-21)

- **On the receipt** (order placed): signed-in shoppers see their real referral code with copy-link and a prefilled WhatsApp share ("friend saves ৳50, you earn ৳50"); guests get a quiet sign-in line — codes are never mintable anonymously (`receipt-referral-row.tsx`).
- **On /track, delivered orders** show a one-tap review ask linking each bought piece's moderated review form (`review-ask.tsx`, max three links).

## Premium icon pass (2026-09-21)

No emoji in shopper-facing UI — delivery, slots, addresses, COD, gift, loyalty and map surfaces use the brand's stroke line-icon set (`src/components/ui/icons.tsx`; new: sparkles, moon, calendar, home, store, briefcase). Admin/vendor/rider tools may still use emoji internally.

## Marketing feeds & structured data (2026-09-21)

- **Facebook/Instagram catalog feed:** `GET /api/feed/facebook` — Meta Commerce CSV (id, title, price in BDT, availability, absolute links/images, brand). Paste into Commerce Manager → Catalog → Data sources as a scheduled feed.
- **Google free listings feed:** `GET /api/feed/google` — Merchant Center RSS 2.0 (`g:` namespace, whole-taka prices). Paste into Merchant Center → Products → Feeds as a scheduled fetch. Both revalidate hourly; video slides are never submitted as images and sold-out pieces are listed as `out of stock` (history preserved).
- **Structured data:** `Organization` + `WebSite` JSON-LD on every storefront page (facts only — logo, origin; address/phone join when the shop profile has them). Share cards: see the Conversion & usability pass above.

## Pages

Public: Home (CMS-aware) · Shop · Product details (public reviews launch-gated) · Cart · Checkout (shared zone store + coupon codes) · Track order (real order-store lookup by ID + phone) · Live shopping (`/live` — the shop's own stream with the on-air pieces one tap from the bag) · Wishlist · About · Contact (channels render only when the shop configured them) · FAQ · Delivery info · Returns · Privacy · Terms · 404.

**Admin** (`/admin` — always real, gated by Supabase staff auth):

- Login: staff Supabase Auth — an `admin_users` row grants access; the owner email `rahatbd2050@gmail.com` is prefilled. No demo credentials exist.
- Dashboard: today's sales, live status pipeline, §88 delivery performance, low-stock alerts
- Orders: search + status filters, order details with item snapshots, customer info, journey timeline, and state-machine-driven actions (advance / cancel per §34)
- Products: catalog list w/ search + visibility filters, quick featured/archive actions, full sectioned editor (basics, pricing, variants/stock, Cloudinary upload + Drive/YouTube media, publishing, SEO)
- Categories: data-driven create/edit/reorder/hide with Bengali names & subcategories (§5)
- Delivery zones: zone CRUD + reorder + active state — saved zones are what the customer checkout uses live (§20–21)
- Deliveries: §3.2 dispatch board — auto-offer on ready-for-pickup, offer expiry + re-offer, manual assign/cancel, rider cash exposure
- Reviews: moderation queue — approve/hide/flag/feature/delete; storefront reviews wait for approval, verified badge only with matching order (§30)
- Coupons: fixed/percent, min order, category scope, validity & usage limits; checkout applies codes live; usage is recorded when an order is placed (§56)
- Inventory: per-product stock editor with configurable low-stock threshold that drives the dashboard alert (§57–58)
- Reports: period presets (7/30/all days) over the live order store — booked vs collected COD revenue, daily revenue chart, top products, zone and coupon breakdowns
- Homepage: §31 CMS — announcement, hero copy, section visibility; Publish updates the live storefront
- Media: §49 library — in-use scan plus a shared “added” shelf (live table for staff; direct Cloudinary image/video upload when keys are set, plus Google Drive + YouTube links — see [docs/media-setup.md](docs/media-setup.md))
- Notifications: §35 per-staff inbox fed by real order/review/application/message/signup events, plus a live “needs attention” summary
- Messages: contact-form inbox — read/reply triage with click-to-call phone links
- Newsletter: table-based subscriber list with search, CSV export and per-subscriber unsubscribe links (no third party)
- Payments: COD stays the default; **bKash/Nagad into the shop's OWN wallet** — no merchant account, no API key: the customer sends the total and shares the TRXID, the shop verifies/rejects per order (fulfilment is gated until verified), with a live COD book on the same page. Cards still need a PSP.
- Live shopping: schedule a session (title, when, the shop's live link, pieces in on-air order), Start/End, tap the on-air piece — the storefront embeds a YouTube link in place or links out to any other platform. "LIVE" only shows between the shop's own taps.
- Settings: low-stock threshold (§58) + contact channels (phone/WhatsApp/email — blank = hidden, never a placeholder) saved live; platform constants (§68–70). There are no demo-data reset controls — live data is never reset.

Every admin domain reads and writes Postgres through Supabase — see **[docs/go-live.md](docs/go-live.md)** for the owner-run setup checklist (SQL → seed → staff grant → verify).

Design language: deep forest green + warm ivory + muted gold, Playfair display serif + Inter + Noto Serif Bengali, arch-shaped brand imagery (signature motif), mobile-first.

## Routes map

```txt
src/
├── app/
│   ├── layout.tsx            # root: fonts, globals, theme
│   ├── (site)/               # public storefront — header/footer chrome
│   │   ├── layout.tsx        # CartProvider, header, footer, site metadata/OG
│   │   ├── page.tsx          # homepage sections
│   │   ├── shop/             # catalog with client-side filtering
│   │   ├── product/[slug]/   # SSG product pages (+ JSON-LD, metadata)
│   │   └── cart · checkout · track · about · contact · faq · delivery · returns · privacy · terms
│   ├── admin/                # separate admin surface (own layout + guard)
│   │   ├── login/            # staff Supabase auth (§47)
│   │   ├── page.tsx          # dashboard (§32, §88)
│   │   ├── orders/           # list + [id] detail w/ status machine (§33–34)
│   │   ├── products/         # list, new, [id] editor (§71–74)
│   │   ├── categories/       # data-driven CRUD (§5)
│   │   ├── zones/            # delivery-zone manager (§20–21)
│   │   ├── deliveries/       # §3.2 dispatch board + manual assign/cancel
│   │   ├── homepage/         # §31 CMS: announcement, hero, sections
│   │   ├── customers/        # derived from the order store
│   │   ├── reviews/          # §30 moderation queue
│   │   ├── coupons/          # §56 discount-code manager
│   │   ├── inventory/        # §57–58 stock + threshold
│   │   ├── media/            # §49 library (in-use scan + shared shelf)
│   │   ├── messages/         # contact-form inbox (triage)
│   │   ├── newsletter/       # subscriber list + CSV export
│   │   ├── notifications/    # §35 inbox + bell + live attention
│   │   ├── reports/          # sales reports over the order store
│   │   ├── settings/         # ops settings (§58)
│   │   ├── live/             # live shopping control room (P1 #9)
│   │   └── payments/         # wallet numbers + COD book + pending verifications
│   └── rider/                # mobile rider surface (login/apply/shell)
│       ├── page.tsx          # live jobs, PIN proof, COD settlement
│       ├── login/            # rider Auth sign-in / sign-up
│       └── apply/            # pending rider intake
├── supabase/schema.sql       # §41–46: tables, RLS, order state machine
│   ├── icon.png · favicon.ico
│   └── globals.css           # design tokens (forest/ivory/gold)
├── components/
│   ├── layout/               # header, mobile nav, footer, newsletter
│   ├── admin/                # admin gate/shell, status badges, time helpers
│   ├── cart/                 # CartProvider (localStorage) + cart view
│   ├── product/              # card, gallery, purchase panel
│   ├── shop/ · checkout/ · track/ · contact/
│   └── ui/                   # buttons, badges, prices, icons
├── public/brand/             # official emblem artwork (transparent PNG + lockup)
└── lib/                      # catalog, orders (state machine), cart, money (paisa)
    ├── rider-auth.ts         # requireRider(): session → riders row gate
    └── use-rider.ts          # rider session/jobs/actions client hooks
```

## Deploying to Vercel

Live project: [bhromor-zeta.vercel.app](https://bhromor-zeta.vercel.app). `vercel.json` pins Framework = Next.js so dashboard Build settings cannot drift.

1. Push to `main` → auto-deploys.
2. Add keys in **Project → Settings → Environment Variables** (not team settings). Vercel’s form now asks **Config** vs **Secret** instead of a Sensitive checkbox — see **[docs/vercel.md](docs/vercel.md)** for the exact keys, types, and how to reset Build settings if they were changed by mistake.
3. After any env change: Deployments → ⋯ → **Redeploy** with “Use existing Build Cache” **unchecked**.
4. `GET /api/health` reports `"live": true` once the Supabase keys are set **and** the database is seeded; until then it returns a step-by-step checklist of exactly what is missing.

## Next phases (in order)

1. **Go-live (owner)** — follow **[docs/go-live.md](docs/go-live.md)**: apply the SQL migrations, `npm run seed`, approve the first rider (the application already carries the login), grant the first staff role (`npm run grant-admin -- rahatbd2050@gmail.com super_admin`), run the verify checklist. The storefront serves the launch catalog out of the box, but the database must be seeded before live checkout, admin, and tracking work.
2. **Notif channels (SMS/WhatsApp)** on top of the inbox (§35) once a gateway account exists; Cloudinary keys enable direct media upload (§48) — both optional, everything else is already real.


## Customer accounts & remote wishlists

The storefront now includes `/account` with Supabase email OTP authentication and an RLS-protected, per-customer wishlist. Guest shopping still works without Supabase configuration. Guest import is explicit and additive; account data is not copied into guest localStorage.

See **[customer account setup and verification](docs/customer-accounts.md)** for the standalone SQL migration, OTP email template, environment configuration and required live two-account isolation checks. Automated tests use mocked service responses; live email/RLS verification requires a configured Supabase project.


## Browser regression checks

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

Playwright starts a dev storefront at port 3100, or uses `E2E_BASE_URL` when supplied. Screenshots, traces and the HTML report go under ignored `.cache/`. The suite checks five responsive widths, keyboard/modal behaviour, reduced motion, wishlist/filter persistence, accessibility and the shopping flow up to checkout (without submitting an order). See [QA results and limitations](docs/browser-qa.md).
