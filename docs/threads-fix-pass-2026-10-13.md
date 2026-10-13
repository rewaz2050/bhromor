# Threads fix pass — 2026-10-13

A repo scan for "what else can be done" found a **bug in the messaging feature
shipped on 2026-10-11**, plus four gaps around it. All five are fixed here.

Cost: **৳0**. No new dependency, no third-party service, and **no new
migration** — the `202610110002_customer_threads` tables already cover all of
it.

## 1. The bug: one order, many threads

`openThread` (`src/lib/db/customer-threads.ts`) inserted a new
`customer_threads` row on **every** call. A shopper who wrote three times from
the tracker split one question across three inboxes:

- the shop saw three one-line "conversations" instead of one;
- the shop answered the first one;
- the shopper was looking at the third, so **the answer never reached them**.

Now `openThread` looks for an **open** thread on `(customer_phone, order_no)`
first and appends to it, inserting only when there is none. The order number
and phone both come from server-side data, so this cannot be steered by the
client.

`listThreads` gained an `orderNo` filter, which is what makes the next two
items cheap: one row for one order, not a whole inbox downloaded and searched.

## 2. The tracker now shows the conversation, not a blank box

`message-shop.tsx` started with `threadId = null` and only set it after a
POST. A shopper who had written before came back to an **empty composer** —
and if the shop had answered days earlier, nothing on the page said so.

It now reads `/api/account/threads?orderNo=…` on mount and opens the existing
thread. `MessageThread` has its own reply field, so nothing is lost by dropping
the standalone composer.

## 3. The shop answers from the order it is packing

`/vendor/orders/[id]` had no trace of the thread — the shop had to leave the
order, open Messages, and pick the right conversation out of the list.

`vendor-order-thread.tsx` puts it on the order page. It renders **nothing**
when nobody has written, which is most orders: an "no messages" card on every
order is noise the shop learns to skip, and then skips the real one too.

## 4. Staff oversight inbox — `/admin/threads`

Both `/api/admin/threads` routes had existed since the messaging pass with
**zero callers** (`grep` over `src` outside `src/app/api` returned nothing). A
shop that stopped answering left its customer with no way to reach the
platform.

The page lists every conversation, flags the ones that still owe an answer,
and lets staff reply as `platform` — so the shopper can see who is speaking
rather than wondering why the shop changed its voice.

Deliberately **not** behind `<AdminOnly>`: any staff account can read and
answer, exactly like the contact inbox beside it. These are ordinary
conversations, not money, and the routes are gated the same way.

## 5. A new question rings

`use-vendor-order-alert.ts` knew only about orders. A message is quieter than
an order — nobody is standing at the counter for it — which is exactly why it
goes unanswered.

The same hook now watches the awaiting count. It rings **on the count going
up**, never on the count being high: a shop that opens the dashboard to three
unanswered questions should read the card, not be rung at three times. One
switch, not two — it uses the ring the shop already armed for orders and never
asks for permission itself.

`MessagesAwaitingCard` became presentational so the dashboard reads the inbox
**once** and feeds both the card and the bell, instead of the two of them
polling it apart. The shell's nav badge still reads it on its own, so `/vendor`
makes two reads a minute in total — the same situation the home-screens pass
documented, left alone rather than gaining a shared cache for one page.

## Tests

| File | What it pins |
| --- | --- |
| `src/lib/db/__tests__/customer-threads.test.ts` | the reuse fix: a second message on the same order appends, and **exactly one** insert happens |
| `src/components/track/__tests__/message-shop.test.tsx` | an existing conversation replaces the "start one" box |
| `src/components/vendor/__tests__/vendor-order-thread.test.tsx` | appears when there is one, absent when there is not, absent on 501 |
| `src/app/admin/threads/__tests__/admin-threads-page.test.tsx` | awaiting count, migration notice, opening a thread, empty state |
| `src/lib/__tests__/use-vendor-order-alert.test.tsx` | rings on the way up, silent at the backlog, silent when unarmed, once per rise |

## Incidental breakage this pass caused, and how it was resolved

- **`admin-sidebar-nav.test.tsx` asserted a hardcoded 26 links.** Adding the
  27th made the suite red over a number, not over anything wrong. It now
  derives from `ADMIN_NAV_ITEMS.length`, so the assertion still means "every
  link rendered, none of them twice" without going stale on the next item —
  the same disease as the fixed-date fixtures the home-screens pass repaired.
- `setSelected(null)` inside an effect on the admin page → moved into the
  filter button's click, where it belongs.
- `ringMessage()` setting state from an effect → kept, with a
  `react-hooks/set-state-in-effect` disable and the reason: it fires only when
  the count grows, so at most once per new question, not on every render. The
  same file already carries one such disable for the stored-pref read.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | 0 problems |
| `npm run typecheck` | clean |
| `npm test` | **535 files / 3672 tests, all pass** (345 s) |
| `npm run build` | exit 0 |
