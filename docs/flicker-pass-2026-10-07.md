# Flicker pass — things that twitch after the paint (2026-10-07)

**Status:** shipped · **Surfaces:** storefront, `/rider`, vendor + admin boards ·
**Language:** briefing in Bangla, UI terms in English.

A flicker is almost always the same bug: **the server paints one thing, the
browser paints another a frame later.** Each fix below removes one such
disagreement — or removes an animation that fired on the wrong occasion.

| Flicker | Where | What changed |
|---|---|---|
| Every clock on the page re-worded itself after hydration | `lib/use-now.ts` | The hook answered hydration with a fixed epoch (2026-01-01), so countdowns and "১২ মিনিট আগে" were rendered against a date nine months old and then replaced. Both sides now read the SAME clock, floored to the interval — a server render at 10:00:59 and a hydration at 10:01:01 of a 60 s clock agree. |
| The cash-at-the-door amount could change in front of the shopper | `components/cart/cod-reminder.tsx` | `useState(() => Date.now())` → the shared clock. The night-surcharge line can no longer appear one frame after the paint. |
| The "order now → by about ৭:৩০" line arrived, then re-worded itself | `components/delivery/arrival-cue.tsx` | Same clock, and no `null` gate: the line is computed from the same minute the server saw. |
| The delivery date picker's `min`/`max` disagreed with the browser | `components/checkout/checkout-view.tsx` | The bounds came from a MODULE-level `Date.now()` — frozen when the server process booted. Now derived from the shared clock, in the component. |
| The live countdown's first number was always about to change | `components/live/live-view.tsx` | Its own `Date.now()` in render → the shared 1 s clock (one interval for every countdown on the page). |
| The review block flashed "No written reviews yet", then the reviews | `lib/use-public-reviews.ts`, `components/reviews/reviews-section.tsx` | Rows live in ONE module store keyed by (product, featured): `reviews` is `null` until the read answers, never `[]` — and a product revisited a second later paints from cache with no second request. |
| The bag badge bounced on every page load | `components/layout/cart-button.tsx` | `bag-pop` is armed only after the stored bag is known; "0 → 3" on load is not news, "3 → 4" in front of the shopper is. |

## Rules the code follows

- **One clock.** Anything time-dependent reads `useNow(interval)`. It is a
  `useSyncExternalStore`: the server snapshot and the hydration snapshot are
  the same interval-aligned value, one shared `setInterval` per interval, and
  no `Date.now()` in a render body.
- **`null` is not `[]`.** A list that has not been read is `null`; a list that
  came back empty is `[]`. An empty state painted before the read answers is
  a lie told at full brightness.
- **Module stores, not component state, for anything fetched twice.** The
  catalog, the zones, the settings and now the reviews all work this way: a
  warm read paints on the first frame, so a back-navigation does not re-flash
  a skeleton.
- **Animation marks an event, not a value.** A badge that changes because the
  page loaded is not an event.

## Tests

- `lib/__tests__/use-now.test.ts` (5) — the floor, the 1 s clock, the tick.
- `components/reviews/__tests__/reviews-no-flash.test.tsx` (2) — no empty
  state while the read is in flight; a revisit reads nothing twice.
- `components/layout/__tests__/cart-button-pop.test.tsx` (2) — no pop when
  the stored bag is read; a pop when another tab adds to it.
