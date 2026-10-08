# Vendor + rider pass — the handover's two blind spots (2026-10-07)

**Status:** shipped · **Surfaces:** `/vendor` (dashboard) and `/rider` (board) ·
**Language:** briefing in Bangla, UI terms in English.

The buyer side of the plan (`ux-sales-plan.md`, R0–R11) was about a shopper
staring at a screen and deciding. The two operator surfaces had one shared
blind spot: **the moment between "packed" and "collected"**.

| Change | Where | Why |
|---|---|---|
| "Rider-এর অপেক্ষায়" — the shelf panel | `lib/pickup-wait.ts`, `components/vendor/waiting-parcels.tsx` | The dashboard counted *"Ready for rider: 3"* but never said whether anybody was coming, or that a parcel had sat there for 25 minutes. Now each parcel shows its own wait, escalating 10 → 25 minutes, and the rider's name with a call button the moment dispatch names one. |
| Cash-in-hand check before going offline | `lib/rider-tasks.ts` (`offlineCashNote`), `app/rider/page.tsx` | A rider could switch off after a COD day and ride home with ৳3,000 of the platform's money — a silent toggle. The board now says what is in the pocket, offers "টাকা জমা দিন" (opens the settle claim), and still leaves the last word to the rider ("তবুও অফলাইন যাব"). |

## Rules the code follows

- **The clock starts at the shop's own tap.** `parcelWait()` reads the first
  dispatch mark in the order's timeline (`shopDispatchAt`), not the order's
  birth — a parcel packed at 4:50 has not waited since 4:10.
- **Nothing is invented about arrivals.** Before a rider accepts there is no
  ETA, so the copy says how long the wait has been and stops there. The
  rider appears in the data exactly when an assignment moves the order to
  `courier-assigned`; the panel shows the name, the rating-free phone call,
  and nothing before that.
- **No mark, no clock.** An order the shop never marked packed produces
  `null` from `parcelWait()` — the panel cannot accuse a shop of a delay it
  never recorded.
- **Empty means absent, not a box.** No parcels on the shelf → the panel
  renders nothing (no "all clear" card taking counter space). No cash in the
  pocket → `offlineCashNote()` is `null` and the toggle behaves as before.
- **The rider decides.** The cash nudge delays going offline by one tap; it
  never blocks it.

## Tests

- `lib/__tests__/pickup-wait.test.ts` — 11: the clock, the three tones, the
  named rider, the statuses that say nothing, the slipped clock, English.
- `components/vendor/__tests__/waiting-parcels.test.tsx` — 6: empty shelf,
  wait copy, absent call button, named rider's `tel:` link, urgent tone, the
  order link.
- `app/rider/__tests__/rider-page.test.tsx` — 3 more: asks first, can still go
  offline anyway, nags nobody with an empty pocket.
- `lib/__tests__/rider-offline-cash.test.ts` — 3: the sentence, the zero case,
  English.
