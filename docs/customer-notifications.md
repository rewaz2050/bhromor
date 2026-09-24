# Customer notifications — what exists, and the order of what is next

Written 2026-09-24, after the owner asked *"User er jonno ki ki notification
system ache?"* and chose the build order: **customer web push → WhatsApp
automation → email sender → customer in-app inbox.**

**Update (same day, second question — *"system ta automate kora jabe?"*):** the
clock that makes the rest of this file possible shipped as
`/api/cron/tick` (a GitHub Action every 15 minutes; **`docs/automation.md`**).

**Update (same day, third question — *"order confirmed theke baki process ektar
por ektar complete hole auto messages jabe"*):** the milestones-only design was
too quiet. §1's map now sends **one message per real status change** — packing
and rider-assignment included — so the shopper follows the whole journey from
the phone they ordered with, without opening the tracker.
Two things it already changed here: the scheduled-delivery reminder
("আজ আপনার পার্সেল আসছে") is now a push rather than a phone call, and
**price-drop / restock watches push to subscribed phones** — the staff note
keeps only the numbers that could not be reached. WhatsApp and email are still
the next two items (§2, §3), unchanged in order.

This file is the single place that answers "how does a customer find out?"
for the live store, so the answer cannot drift from the code.

---

## 1. What shipped today (2026-09-24): customer Web Push

**The gap it closes.** Before this, there was **no automatic customer
channel at all**: a shopper learned nothing until *they* re-opened `/track`,
and "order kothay?" was answered by the shop phoning them — on the shop's
time, one call per parcel. Staff already had push (`push_subscriptions`,
2026-09-21); customers had nothing.

**How it works**

| Piece | Where | What it does |
|---|---|---|
| Table | `supabase/migrations/202609240001_customer_push.sql` | `customer_push_subscriptions`: endpoint + keys + the checkout **phone** + the language the shopper was reading. Service-role only (RLS on, no policies) |
| Fan-out | `src/lib/customer-push.ts` | `pushOrderMilestone()` — VAPID Web Push to every device registered on that phone; prunes 404/410; capped at 2.5 s so it can never delay a status write |
| Copy | `src/lib/notify-messages.ts` | Pure Bangla/English templates + the milestone map |
| Public API | `src/app/api/track/push` (+ `/test`) | GET status for the card, POST register (order id **+** that order's phone = the tracker's own proof), DELETE forget, POST test push |
| Card | `src/components/track/notify-opt-in.tsx` | "অর্ডারের খবর ফোনে নিন" — on **the receipt, right after an order is placed** (the one moment the shopper is certainly looking), and on the tracker of a live order; the seven journey steps are listed on the card |
| Hook | `src/lib/use-order-push.ts` | Permission from the tap, subscribe through the existing `/sw.js`, remember the endpoint locally |
| Triggers | admin advance · vendor advance · rider pickup/deliver · payment verify · order placement | see below |

**One message per real step.** `CUSTOMER_PUSH_STATUS` maps each internal state
onto exactly one customer sentence, and the card promises the same seven steps
(`CUSTOMER_JOURNEY`) — the promise and the messages cannot drift apart:

| Sent when | Customer sees |
|---|---|
| order placed (`/api/orders`) | অর্ডার পেয়েছি ✅ + tracker link |
| `confirmed` (admin/vendor advance) | অর্ডার কনফার্ম হয়েছে ✅ |
| `preparing` (shop starts packing) | প্যাকিং চলছে 📦 |
| `ready-for-pickup` (packing done) | প্যাকিং শেষ — রাইডার ডাকা হচ্ছে 🛵 |
| `courier-assigned` (**rider accepts** the offer) | রাইডার নিয়োগ হয়েছে 🛵 — a rider took the delivery |
| `out-for-delivery` (rider pickup) | রাইডার আপনার পার্সেল নিয়েছে 🛵 + "keep the 4-digit code ready" |
| `delivered` (rider deliver) | ডেলিভারি হয়েছে 🎉 |
| `cancelled` (staff advance, or the shopper's own cancel) | অর্ডার বাতিল হয়েছে — nothing to pay |
| wallet payment **verified** (admin or vendor) | পেমেন্ট ভেরিফাই হয়েছে ✅ |

A status the shop skips sends nothing (the `preparing` step is optional in the
state machine — confirmed may go straight to ready-for-pickup), and `pending`
has no message of its own because placement already sent `placed`. `returned`
stays silent (returns are a different product flow).

**Who rings the bell.** Every writer of `orders.status` now calls
`notifyCustomerOfStatus` on the service client: staff advance
(`/api/admin/orders/[id]/advance`), **the vendor's own advance**
(`/api/vendor/orders/[id]/advance` — a shop confirming from its own panel used
to send nothing), **the rider's accept** (`/api/rider/assignments/[id]/accept`,
which is the moment `ps_rider_accept` sets `courier-assigned`), rider
pickup/deliver, payment verified (admin + vendor), and order placement.

Deliberately *not* a step: `/api/admin/deliveries/batch` offers the order to a
rider for 90 seconds. The order status does not change, the offer can expire
untaken, and a shopper told "rider assigned" would have been told a guess —
the message fires when the **rider accepts**.

**Security posture.** The endpoint is public because shoppers are guests.
What can it do? Register a device *only* for a phone number the caller can
already open a tracker for (order id + phone), and delete a device by its own
endpoint. A leaked endpoint alone subscribes nothing; a mismatched pair gets
the tracker's own vague 404. Rate limited per IP (20/min, 4/min for tests).

**Honest dead ends** (the same rules as the staff card): an in-app browser
(WhatsApp/Facebook WebView) can never push and says so; a sticky "denied"
shows hand-set steps instead of a retry loop; missing VAPID keys or a missing
migration disable the button with the reason on it; a delivered/cancelled
order does not offer the card at all.

**Owner steps.** Nothing new to configure: the same `PUSH_VAPID_PUBLIC_KEY` /
`PUSH_VAPID_PRIVATE_KEY` pair powers both audiences. One SQL file:
`supabase/migrations/202609240001_customer_push.sql` (also appended to
`supabase/bootstrap-fresh.sql`). `/api/health` now reports
`checks.customerPushTableReady` + `counts.customer_push_subscriptions`.

**What is *not* claimed.** Web Push is unavailable in some browsers and
in-app WebViews, and a shopper who never taps the card gets nothing — the
phone call stays the fallback. Push is a courtesy, not a guarantee: the
tracker and the shop's call remain the source of truth.

---

## 2. Next: WhatsApp status automation (draft → one tap)

**Already in the repo:** `src/lib/admin-wa.ts` builds the five pre-written
Bangla status messages (Confirmed / Ready-pickup / On the way / Courier /
Delivered) including a `/track?id=…&phone=…` link, and
`src/components/admin/order-whatsapp-status.tsx` renders them as chips on the
admin order page. Today a human must open the order and tap.

**The build:** after the same status hooks the push uses, write the message
for *that* order into a `wa_outbox` table (status, message, phone, created_at,
sent_at) and show it on the order page as "Ready to send" — one tap opens
`wa.me` with the text prefilled and marks the row sent.

**Why not the official API first:** Cloud API needs a Meta business account,
a verified number and per-message pricing; this shop's volume and margins say
start with the draft-outbox (zero cost, zero policy risk) and revisit if
volume justifies it. **Never** claim a message was sent when a human had to
tap it — the outbox row records who sent it.

## 3. Then: an email sender (Resend / ZeptoMail free tier)

**Already in the repo:** `newsletter_subscribers` (+ one-click unsubscribe
tokens at `/api/newsletter/unsubscribe`) and campaign early-access signups
feed it. Nothing sends mail today, and the code says so in three places
rather than pretending.

**The build:** an env-gated sender (`RESEND_API_KEY`, `EMAIL_FROM`) with two
uses only — order-confirmation email (receipt + tracker link) and the
newsletter/price-drop digest. No key → the feature stays honestly off, same
switch pattern as VAPID. Needs: a verified sending domain, a plain-text
template, and an unsubscribe footer on every message (the token already
exists).

## 4. Last: a customer in-app inbox

**The gap:** `notifications` (schema.sql L224) is per-**staff** (`recipient` →
`auth.users`, fanned out by `notifyStaff`) and the bell lives in the admin
panel. A signed-in shopper sees only the Orders tab in `/account`.

**The build:** reuse the same table shape with a `customer_id`/phone
recipient, a bell in the storefront header for signed-in shoppers, and rows
written by the same milestone map this push uses (so the inbox and the phone
cannot disagree). Before building this, note that it only reaches customers
who are signed in — which is why it comes last: push covers guests today.

---

## 5. Channels deliberately *not* on the list

- **SMS** — a gateway account, per-message cost, and no OTP flow needs it
  (delivery proof uses the 4-digit code the customer already has). Revisit
  only if push + WhatsApp leave a measurable gap for feature-phone shoppers.
- **A third-party push service (OneSignal/Firebase)** — the VAPID Web Push
  pipeline already exists for staff, is free, and keeps customer data in the
  shop's own Supabase. Adding an SDK would buy nothing but a dependency.
- **Automated WhatsApp (unofficial libraries)** — account-ban risk for a
  shop whose number is its main channel. Not worth it.

---

## 6. Verification checklist (after merging + SQL)

- [ ] `supabase/migrations/202609240001_customer_push.sql` applied →
      `/api/health` shows `customerPushTableReady: true`
- [ ] On a phone: place a test order → open `/track` → the card lists four
      Bangla milestones → **ফোনে খবর চালু করুন** → allow → **টেস্ট পাঠান**
      lands a notification
- [ ] Admin: Confirm the order → the shopper's phone says "অর্ডার কনফার্ম
      হয়েছে"; rider pickup → "রাইডার … নিয়েছে"; rider Delivered → "ডেলিভারি
      হয়েছে 🎉" — each tap opening *that* order's tracker
- [ ] Wallet order: verify the bKash payment → "পেমেন্ট ভেরিফাই হয়েছে ✅"
- [ ] Cancel an order → "অর্ডার বাতিল হয়েছে", and tapping it opens the tracker
- [ ] Cost check: `/api/orders` still returns in well under a second (the
      fan-out is capped at 2.5 s and runs after the order row is committed)
