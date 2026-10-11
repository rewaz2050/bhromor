# Customer dashboard & the rider/shop relation — 2026-10-11

**Cost: ৳0.** No new dependency, no third-party service, no per-message fee,
no push requirement. Everything here is code plus two optional tables
(`docs/sql-to-run-2026-10-11.md`).

The pass started from one observation repeated across the customer side: the
data was already there, and the screens either did not show it or went stale
while you were looking at them.

---

## 1. The dashboard says what is happening now

**Shop name on every order.** `listOrdersForPhone` never selected
`orders.shop_id`, even though the column has been `NOT NULL` and indexed since
the marketplace slice (`202609090004:69,88,92`). Five orders from three shops
were indistinguishable — "Cotton Panjabi" says nothing about who sold it. It
rides along now, and rows from an older API shape simply omit the line.

**The moving orders get their own strip.** They were buried in a flat list
between last month's. They now sit at the top and the list re-reads every 30 s
while any of them is live, stopping by itself once the last parcel has landed.

**"Load more" replaces the hard stop at 20.** `/api/account/orders` takes
`?limit=`; `listOrdersForPhone` already clamped at 50, so a long history still
opens fast.

**The hero's track shortcut works.** It pointed at `/track?id=…` with no phone,
and `/track` only looks an order up by itself when it has *both* — so the
shortcut from the customer's own dashboard still asked for their number. It
carries the phone now, via the `trackHref` helper the order list already used.

## 2. The rider is reachable before anything goes wrong

`order.rider` has carried the name, phone and rating since slice 9, but the
only control built on it lived inside `DelayNote`, which returns null until
`eta.late` is true. The customer could call the rider exactly when the parcel
was already late and never before — while the rider could call the customer at
any point (`rider/dashboard/task-card.tsx:175`). One way is not a relationship.

`RiderCard` now shows as soon as a rider is on the job: name, rating (or an
honest "no ratings yet"), and the call. It drops the call after the handover
and renders nothing for a cancelled or failed attempt, where a dead number is
worse than no card. `DelayNote` keeps its own call button — when something has
gone wrong the button belongs next to the bad news.

## 3. Open pages stop lying

The tracker read the order exactly once. The rider's pin moved on its own 10 s
poll; the milestone above it did not. A customer who left `/track` open watched
"Confirmed — the shop is packing" for a whole delivery. Push covers a closed
tab; nothing covered an open one.

An open order now re-reads every 15 s, silent (no spinner over a page someone
is reading, and one dropped poll is not an error worth interrupting for),
paused on a hidden tab, and stopped entirely once the order is delivered,
cancelled or failed.

Both screens share one hook — `useLiveRefresh(enabled, ms, onTick)` — rather
than each growing its own interval. `enabled` is the stop condition, `onTick`
must be stable, and the interval is cleared on unmount.

## 4. The address book follows the customer

Saved addresses lived in `localStorage` and the account page had to admit it.
The wishlist has synced since `202609080001`; the address book was the last
piece of the account stuck on one device.

`202610110001` adds `customer_addresses`, keyed by the same client id the
browser already uses so the two never disagree about which row is which. The
local copy stays the working store — checkout reads it synchronously and has
to work with no session and no network — and `/api/account/addresses` is the
mirror: `GET` pulls, `PUT` replaces the set with what a device sent whole, so
the server never has to guess which side is newer.

The merge puts remote rows first, keeps anything local the server has not
seen, and prefers the local copy of a row both sides have, because that is the
one checkout is about to read. Every path is best effort: signed out,
unmigrated table or dropped request all leave the local book exactly as it
was, and the account page says which case it is in.

## 5. A shopper and a shop can actually talk

Every customer→shop path left the site — the tracker's WhatsApp button, the
delay note, the contact form — so nothing was kept, the shop could not answer
the person who asked, and `contact_messages` is a one-way inbox rather than a
thread.

`202610110002` adds `customer_threads` + `customer_messages`. Three doors onto
the same conversation:

| Where | Who | Route |
|---|---|---|
| Tracker → "দোকানকে বার্তা দিন" | shopper | `POST /api/account/threads` |
| Account → **বার্তা** tab | shopper | `GET/POST /api/account/threads[/:id]` |
| Vendor panel → **Messages** | shop | `GET/POST/PATCH /api/vendor/threads[/:id]` |
| `/api/admin/threads[/:id]` | staff oversight | read all, answer as `platform` |

Rules worth knowing:

- **The shop comes from the order row, never from the request.** A shopper
  cannot open a thread in a shop they never bought from.
- **Ownership is checked through one function** (`canReadThread`) — a shopper
  only on their own number, a shop only on its own `shop_id`.
- **Unread** is every non-customer reply after `customer_read_at`; opening a
  thread sets it. No per-message read receipts — a small shop inbox does not
  need them and a second table would cost.
- **A closed thread refuses messages.** The shop answered, the shopper read
  it; a stale thread that still accepts messages is how an inbox fills with
  things nobody will see.
- **Read by polling**, the same tick as the tracker: 10 s inside a thread,
  15 s in the list. No third party, no per-message cost, no push dependency.
- The WhatsApp button stays. It is still the fastest route for someone who has
  it; this is the one that keeps a record.

## 6. What is deliberately *not* here

- **SMS/OTP verification** — costs money, and the no-verification signup is a
  deliberate choice, not an oversight.
- **Push for a new message** — the existing web push could carry it, but a
  message that appears in 10 s does not justify a new push trigger yet.
- **Rider in the thread** — `sender` allows `'rider'` and the UI can draw the
  bubble, but no route lets a rider post. That is a decision to make with a
  rider in the room, not beside them.
- **Attachments** — text only, 2000 characters. Photos belong to the delivery
  proof flow, which already has Cloudinary.

## 7. Tests

| File | What it pins |
|---|---|
| `src/lib/__tests__/use-live-refresh.test.ts` | the tick, the stop condition, the hidden-tab pause, the cleanup |
| `src/components/track/__tests__/track-auto-refresh.test.tsx` | the tracker re-reads, a failed poll is silent, it stops when delivered |
| `src/components/track/__tests__/rider-card.test.tsx` | the call is there before the delay, gone after the handover |
| `src/components/account/__tests__/order-history.test.tsx` | the shop name, the live strip, "load more" stepping to the cap |
| `src/lib/__tests__/address-sync.test.ts` | every failure leaves the local book untouched; the merge and the cap |
| `src/lib/db/__tests__/customer-threads.test.ts` | ownership, unread, shop-from-order, `missing_table` |
| `src/components/messages/__tests__/message-inbox.test.tsx` | unread badge, opening a thread, the migration notice |
| `src/components/track/__tests__/message-shop.test.tsx` | a guest is sent to sign in, the order number goes up |
