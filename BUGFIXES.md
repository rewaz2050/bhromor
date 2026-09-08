# Bug-fix pass — PROSANTI (bhromor)

Reported: *"menu open hoy na"* + "aro 100 ta bugs ase". This is what was found
and fixed. Everything below is a real defect that was reproducible in the
running app, not a style preference.

`npm run lint`, `npm run typecheck`, `npm test` (98 tests) and `npm run build`
all pass.

---

## 1. The menu bug (root cause)

The site header is `sticky` and uses `backdrop-blur`. **Any element with a
`backdrop-filter` becomes the containing block for its `position: fixed`
descendants**, so the mobile drawer — rendered inside the header — was clipped
to the 64 px header strip. React state flipped correctly; the panel was simply
painted inside an invisible 64 px box. It looked like the menu never opened.

Fix: a new shared `src/components/ui/drawer.tsx` renders through a **portal
into `<body>`**, escaping that containing block for good. It also fixes what
the old drawer never had:

| # | Fix |
|---|-----|
| 1 | Menu renders outside the blurred header (visible again) |
| 2 | `Escape` closes it |
| 3 | Background scroll is locked while open (with scrollbar-width compensation, so the page does not jump) |
| 4 | Focus moves into the panel on open, returns to the trigger on close |
| 5 | `Tab` is trapped inside the dialog |
| 6 | Hamburger exposes `aria-expanded` / `aria-haspopup` / `aria-controls` |
| 7 | Menu auto-closes on navigation (it used to stay open over the next page) |
| 8 | The scrim is a click-away layer hidden from screen readers (it used to be a second, duplicate "Close menu" button) |
| 9 | Desktop nav marks the current page (`aria-current` + underline) |
| 10 | **The admin panel had no mobile navigation at all** — 15 sidebar links stacked above every page. It is a hamburger + drawer below `lg` now |
| 11 | Admin drawer closes on navigation |
| 12 | `/#collections` (and `#story`) landed under the sticky header — `scroll-mt` added |

## 2. Shop & catalog

| # | Fix |
|---|-----|
| 13 | Price bands ignored their **lower** bound — "৳1,000–৳1,500" also matched a ৳390 gamcha. Every band behaved like "under X" |
| 14 | "Newest" sort just reversed the array; it now puts real new arrivals first with a stable secondary order |
| 15 | Filters never reacted to URL changes — from `/shop?category=men`, the header's "New Arrivals" link did nothing |
| 16 | The shop route only recognised three hard-coded category ids, so any category added later silently fell back to "all" |
| 17 | Size filter options were hard-coded → derived from the catalog (ordered XS→XXXL) |
| 18 | Colour filter options were hard-coded → derived from the catalog |
| 19 | The sidebar and drawer copies of the filter panel shared radio-group names and fought over the browser's grouping |
| 20 | The mobile "Filters" button showed an anonymous dot; it now shows how many filters are active |
| 21 | Result count is announced to screen readers (`aria-live`) |
| 22 | "Clear all filters" appears when only a search term is active, and clearing also resets the search |
| 23 | Search now matches the category name too |
| 24 | Mobile filter drawer gained Escape / scroll-lock / focus handling (same `Drawer`) |

## 3. Product page

| # | Fix |
|---|-----|
| 25 | Products without colours produced the variant label `" · L"` (dangling separator) and a mismatched cart line |
| 26 | Gallery thumbnails were keyed by image `src` — repeated images collided as React keys |
| 27 | Gallery index was not clamped; a shorter media list blanked the main image |
| 28 | Quick-add timer fired after unmount (filtering the grid) |
| 29 | Purchase-panel confirmation timer fired after unmount |
| 30 | Missing product media crashed the card (`media[0].src`) |
| 31 | The hover swap image duplicated the alt text for screen readers |
| 32 | "Added to cart" is announced (`role="status"`) |
| 33 | Quantity − is disabled at 1, + is disabled at the maximum |

## 4. Cart, checkout & money

| # | Fix |
|---|-----|
| 34 | The cart invented a flat ৳70 "sample" delivery fee — it now quotes the cheapest **active** zone from the shared store |
| 35 | The cart promised free delivery over ৳2,000; checkout charged the full fee anyway. Both now use one rule (`src/lib/delivery.ts`) |
| 36 | Checkout shows "Free" with the struck-through charge, and how much more unlocks it |
| 37 | Totals are clamped at ≥ 0 (a large fixed coupon could go negative) |
| 38 | The stored order records the charge actually payable (waived delivery included) |
| 39 | Line quantity had no ceiling in the cart (product page capped at 9, cart at nothing) → shared `MAX_LINE_QTY` |
| 40 | Corrupt/legacy `localStorage` cart entries produced `NaN` totals; they are filtered out |
| 41 | Quantity buttons got per-product accessible names, and the quantity is announced |
| 42 | Category-restricted coupons were validated against the whole subtotal — a code for "women" applied to a cart with none |
| 43 | An applied coupon was never re-validated when the cart changed; a stale discount survived onto the order |
| 44 | The coupon success message states the actual amount off |
| 45 | Double-submit race: two submits in the same tick both passed the `submitting` state check → ref guard |
| 46 | The order-placement timer is cleared on unmount |
| 47 | The area datalist wrote `"Kandirpar · Zone A"` into the customer's address record |
| 48 | Phone fields rejected `+8801…` numbers (checkout, tracking, contact) |

## 5. Order tracking

| # | Fix |
|---|-----|
| 49 | The timeline marked the **next** step as "Current" — a pending order claimed it was already being confirmed |
| 50 | Cancelled orders no longer show progress steps, and get an explicit notice |
| 51 | Lookup failed for anyone who typed the `+88` country code |
| 52 | Free delivery displayed as "৳0" |

## 6. Reviews & other forms

| # | Fix |
|---|-----|
| 53 | Review "thanks" timer fired after unmount |
| 54 | The validation error stayed on screen after it was fixed |
| 55 | The newsletter kept the address after subscribing, never re-armed, and did not announce success |

## 7. State stores — the crash / infinite-loop class

`useSyncExternalStore` compares snapshots by identity. A `getSnapshot` that
builds a new object per call makes React re-render forever
("*The result of getServerSnapshot should be cached*").

| # | Fix |
|---|-----|
| 56 | `getZonesServer()` returned a fresh array every call (checkout) |
| 57 | `getNotifsServer()` re-seeded with `Date.now()` every call — loop **and** nondeterministic hydration (admin shell) |
| 58 | `getMedia()` returned a freshly merged array every call (`/admin/media`) |
| 59 | `getMediaServer()` — same |
| 60 | The media base scan was cached forever, so newly added product images never appeared; it is now keyed on the catalog |
| 61 | Store mutations that pass empty lists could wipe that scan |
| 62 | `advanceOrderInStore` wrote to storage and woke every subscriber even for **illegal** transitions (`.map()` always returns a new array, so the old `next !== current` check was always true) |
| 63 | The wishlist did not sync across tabs |
| 64 | The cart did not sync across tabs — two open tabs overwrote each other |

## 8. Admin panel

| # | Fix |
|---|-----|
| 65 | **Inventory data loss**: pressing Save on an untouched row wrote `stock = 0` (`Number(undefined) \|\| 0`) |
| 66 | Inventory drafts are cleared after save; flash timers no longer leak |
| 67 | Coupons: non-numeric minimum/usage values entered the store as `NaN` and rendered "৳NaN" at checkout |
| 68 | Coupons: an invalid row edit silently did nothing — it now explains why |
| 69 | Coupons: errors raised while editing a row were rendered inside the (closed) "new coupon" panel |
| 70 | Coupons: invalid end dates are rejected |
| 71 | Zones: row inputs kept stale values after "Reset demo zones" |
| 72 | Zones: deleting the last zone asked for confirmation and *then* failed with an alert |
| 73 | Zones: saved-flash timer cleanup |
| 74 | Product editor: duplicate slugs were allowed — two products, one `/product/[slug]` URL |
| 75 | Product editor: duplicate SKUs were allowed |
| 76 | Product editor: an empty SKU saved as `""` and showed as "SKU " in the cart |
| 77 | Product editor: a non-numeric compare-at price saved as `NaN` |
| 78 | Product editor: a compare-at price below the selling price (fake discount) was allowed |
| 79 | Product editor: a blank/zero price was accepted |
| 80 | Product editor: non-numeric stock was accepted |
| 81 | Order detail masked the customer's phone (`017****78`) — staff could not call to confirm a COD order. Full number, `tel:` link |
| 82 | Customers list: same masking problem |
| 83 | Admin header overflowed on small screens (title truncates, hamburger added) |
| 84 | Categories / homepage / media / settings leaked flash timers → shared `useTransientValue` hook |

## 9. Homepage

| # | Fix |
|---|-----|
| 85 | The collections grid listed **every** category — including archived and empty ones — directly contradicting its own copy ("only categories that hold products appear here"). It now filters, and hides itself when nothing qualifies |

---

## New files

- `src/components/ui/drawer.tsx` — accessible, portalled drawer (menu, shop filters, admin nav)
- `src/components/layout/nav-links.tsx` — desktop nav with current-page state
- `src/lib/delivery.ts` — single source of truth for delivery charges & free-delivery
- `src/lib/use-transient-value.ts` — leak-free "flash" state

## New tests (24 net new — 74 → 98)

- `src/components/layout/__tests__/mobile-nav.test.tsx` — the menu opens, is portalled outside the header, locks scroll, closes on Escape / scrim / navigation, and takes focus
- `src/components/shop/__tests__/shop-browser.test.tsx` — price-band bounds, "Newest" ordering, URL→filter sync, derived facets, empty state
- `src/lib/__tests__/delivery.test.ts` — zone charge, free-delivery threshold, cheapest active zone, non-negative totals
- `src/lib/__tests__/store-snapshots.test.ts` — snapshot identity stability (the infinite-render class)
- plus phone-normalisation and cart-clamping cases in the existing suites
