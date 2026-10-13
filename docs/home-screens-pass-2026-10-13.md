# Home screens pass — 2026-10-13

Three screens were reviewed for how "standard" they feel to the person using
them: the shop front (customer), the vendor dashboard (shop), and the rider
home. Each was already strong; each had one thing a comparable app would not
be missing. This pass closes those, and nothing else was touched.

Cost: **৳0**. No new dependency, no third-party service, no schema change.
Everything here reads data the app already had.

## What was wrong, with evidence

| Screen | Gap | Where it showed |
| --- | --- | --- |
| Customer home | The tree read the catalog and CMS settings and **nothing about the shopper**. `grep useCustomer\|/api/account/orders` over `home-client.tsx` + every file in `src/components/home/` returned no hits. A customer with a parcel on the way got the shop shelf; `/track` was only a trust-strip link (`home-client.tsx:331`). | no live order, no reorder |
| Shop dashboard | The Messages tab existed (`vendor-shell.tsx:32`) with **no badge and no dashboard card**, while orders polled every 20 s (`use-vendor.ts:175`). A customer's question was invisible until the shop tapped the tab. | silent inbox |
| Rider home | The daily bonus target rendered only on `/rider/earnings` (`earnings/page.tsx:158`). The rating was a 10 px line under the "৭ দিনে" tile (`stats-strip.tsx:54`). | nothing to aim at, rating unreadable |

## What changed

### 1. Live order on the home page — `src/components/home/home-orders.tsx`

Signed-in → one read of `/api/account/orders?limit=6`.

- Anything still moving (`isOrderActive`) → a card with the shop, the public
  milestone it is on, the total, and a **prefilled** `/track?id=…&phone=…`.
- Nothing moving → the last order with the existing `ReorderButton`, plus a
  link to the account. "Order again" used to exist only three screens deep in
  the account history.
- Guests: the fetch **never happens**. No session, no request, no empty card.
- Re-reads every 30 s — the same cadence the account history uses — and only
  while a parcel is genuinely still moving, so it stops by itself.

The row's state is kept with the phone it belongs to, so a response landing
after sign-out (or while someone else signs in) cannot paint another
customer's parcels.

`isOrderActive` moved to **`src/lib/order-activity.ts`** and is re-exported
from `order-history.tsx`; the rule was previously locked inside that
component, and importing it would have dragged the whole history into the
home page's bundle.

### 2. Shop inbox that announces itself

- **`useVendorThreads`** (`src/lib/use-vendor.ts`) — one shared read, 60 s.
- **Badge** on the Messages tab (`vendor-shell.tsx`) — visible on every vendor
  page, `9+` past nine.
- **`MessagesAwaitingCard`** on `/vendor` — the last three waiting questions,
  with an "Answer" button. Renders **nothing** when the inbox is clear.

The count is **"awaiting your reply"**, not "unread": an open thread whose
last message came from the customer. There is no shop-side read marker, and
inventing one would mean a third migration for a number the shop reads less
carefully than its order queue. This rule also clears itself the moment the
shop answers, so it cannot get stuck the way a read receipt does when a tab
is closed mid-thread.

### 3. Rider home — `incentive-progress.tsx` + `rating-tile.tsx`

- **Bonus target**: today's `done/target`, a progress bar, the amount, and a
  link to the full breakdown. Renders **nothing** when staff have the daily
  bonus off (`dailyBonusOn`) — never a promise the shop is not making. Does
  not fetch while the rider is offline.
- **Rating**: a first-class number with the count. `…` until the figure
  lands, `—` plus "এখনো রেটিং পাননি" for a new rider — never a fabricated 4.0.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | 0 problems |
| `npm run typecheck` | clean |
| `npm test` | **533 files / 3658 tests, all pass** (455 s) |
| `npm run build` | exit 0 |

New tests — 16 in 4 files:

- `src/components/home/__tests__/home-orders.test.tsx` (4) — guest costs one
  request short of zero; prefilled track link; reorder when nothing moves;
  empty history renders nothing.
- `src/components/vendor/__tests__/messages-awaiting-card.test.tsx` (3)
- `src/lib/__tests__/use-vendor-threads.test.ts` (3) — the badge number
- `src/components/rider/dashboard/__tests__/home-cards.test.tsx` (6)

## Two repairs the run turned up

A first full `npm test` came back **48 failures in 4 files**. Both causes are
recorded here because one was this pass's fault and the other was already
waiting.

**1. `rider-page.test.tsx` (42 tests) — caused by this pass.** The page grew a
collaborator (`useRiderIncentives` → `riderFetch`), and the file mocks
`@/lib/use-rider` without that export, so every test in it threw "No
`riderFetch` export is defined on the mock". Fixed by stubbing the new hook at
its own boundary:

```ts
vi.mock("@/lib/use-rider-incentives", () => ({
  useRiderIncentives: () => ({ view: null, loading: false }),
}));
```

**2. Six tests in three files — pre-existing, and not caused by this pass.**
Verified by `git stash push -u` and re-running on a clean tree: they failed
there too. All three pinned fixtures to fixed calendar days that have now
passed (today is 2026-10-13), so the suite went red overnight on its own —
exactly the failure mode `vendor-vacation-patch.test.ts` warns about in its
own header comment, which three assertions in the same file then did anyway.

| File | Fixture | Effect |
| --- | --- | --- |
| `vendor-vacation-patch.test.ts` | holiday `2026-10-10`…`2026-10-12` | "That holiday is already over" |
| `vacation-card.test.tsx` | same window typed into the form | save button disabled, no `role="alert"` |
| `promo-card.test.tsx` | `validUntil: 2026-10-12` | every "Live" row read "Expired" |

Fixed the way those files' own comments prescribe — dates computed from today
(`day(+2)`, `day(+4)`, `day(-20)`, `Date.now() + 30d`) rather than typed.
Assertions that deliberately exercise a past window keep one, and the
`vi.setSystemTime` blocks were left alone: their clock is fixed too, so they
are internally consistent and were never at risk.

## Known cost, stated plainly

On `/vendor` the Messages inbox is read twice a minute — once by the nav badge,
once by the dashboard card — because `useVendorResource` does not deduplicate.
That is two requests a minute on a screen that already polls its order queue
every 20 s, so it was left alone rather than gaining a shared cache. If the
vendor panel grows more live tiles, that is the thing to consolidate.

## Deliberately not done

- **No push on a new message.** The badge polls at 60 s; push is the blocked
  FCM work, not something this pass could deliver.
- **No shop-side read receipts.** See the "awaiting your reply" note above.
- **No rider messaging.** Unchanged from the previous pass — that needs a
  rider-side decision, not just a route.
