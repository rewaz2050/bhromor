# Scroll performance — audit and rules (2026-09-27)

**Complaint:** "scrolling smooth na" — the storefront stutters while scrolling,
most noticeably on phones. This note records what the code was doing on every
scrolled frame, what changed, and the rules that keep it from coming back.
Nothing here was measured on a device (the sandbox has no browser); every item
is a known jank source in Chrome/Android, found by reading the code.

## What was happening per frame

| # | Source | Cost while scrolling | Fix |
|---|--------|----------------------|-----|
| 1 | `usePromos()` put a **1 s `setState(Date.now())` into every component that quotes a price** — i.e. every `ProductCard` via `useFlashPrice`. | 24–100 cards re-rendered once a second, on every page, whether or not a flash window existed. A visible hitch every second while scrolling a listing. | `src/lib/use-promos.ts`: one module-level phase check (`active / endsAtMs / nextStartsAtMs`) that notifies subscribers **only when the phase changes**. A grid re-renders at 19:00:00 and 21:00:00, not sixty times a minute. Countdown digits stay in `FlashTimer`/`FlashCountup` (leaf components). The flash-strip progress line is now one CSS transform transition (`FlashProgress`) instead of a `width:%` restyled from a tick. |
| 2 | Header `setProgress(float)` per scrolled frame → React re-render of the whole header (nav, search, cart, wishlist, language, zone pill) every frame; `setScrolled` flipped a **height animation** (`h-[4.4rem]→h-14`), the announcement bar folded via `grid-template-rows`, logo/wordmark sizes transitioned. | Layout of the sticky header (and everything under it) on every frame around the 10 px threshold; the page shifted under the thumb. | `src/components/layout/header.tsx`: announcement bar is normal flow above the sticky bar (scrolls away); the bar has **one height per breakpoint** (`h-14 sm:h-[4.1rem]`, the offsets the shop filter bar already sticks under); progress is written to the gold line's `transform` **via a ref from rAF** (no state); `scrolled` flips once and only toggles a shadow/border. `will-change` removed from the header, the bar, the logo, the announcement shell. |
| 3 | `backdrop-filter` on **fixed/sticky chrome over scrolling content**: header (`backdrop-blur-xl` + saturate), phone bottom nav (`blur(16px)`), bag mini-bar, PDP sticky buy bar, checkout order bar, shop filter bar, drawer scrim (full viewport), drawer header. | Each is a re-blur of the pixels under it on every scrolled frame; on a low-end Android GPU three of them at once is the difference between 60 fps and 25. | Phone-only bars: blur removed, background ~96–97 % opaque. Bars on both breakpoints (header, shop filter bar): blur only under Tailwind's `pointer-fine:` variant (desktop GPUs are fine). Scrim: plain tint. |
| 4 | Per-card blur/layers: `.product-image-primary { will-change: transform }` (a permanent compositor layer per card image), `.product-heart { backdrop-filter }`, `.product-card-badge { backdrop-filter }`, `backdrop-blur-*` on the quick-add button, details button, peek dots, sold-out band, video badge, toast, category tile arrow. | GPU memory + per-frame blur × number of cards. | All removed; hover transitions promote on demand. |
| 5 | A duplicate `.reveal-pending` rule at the end of `globals.css` re-added `filter: blur(3px)` + `will-change: transform, opacity, filter` to every card revealing while scrolling (the audited compositor-only version higher up was being overridden). | A blur filter animation per card entering the viewport. | Dead block deleted; `<Reveal>` is opacity + translate only. |
| 6 | Every product card mounted **all** of its photos (`opacity: 0`) for the hover swap / press-and-hold peek. `next/image` lazy-loads by viewport intersection, so an invisible image in view still downloads and decodes. | 3–5× the image bytes and decodes per card as the listing scrolls. | `ProductCard`: extra photos mount on the first hover / press / focus ("armed") and stay mounted; the listing decodes one photo per card. Grid cards (`/shop`, wishlist, offers, campaign, more-in-category) pass `GRID_CARD_SIZES` (48vw on phones instead of the rail's 72vw — 2.25× fewer pixels to decode per card). |
| 7 | **Lenis** wheel hijack on desktop: every wheel tick animated from a `requestAnimationFrame` loop, so any main-thread work (a re-render, an image decode) showed as a stutter, and the 1.1 s exponential ease read as lag. | Scrolling depended on the main thread. | Removed (`lenis` dependency, `SmoothScroll`, its CSS). Scrolling is native everywhere; the compositor cannot be blocked by the page. |
| 8 | `html { scroll-behavior: smooth }` + **Next 16**: Next no longer suppresses smooth scrolling during route transitions unless `<html data-scroll-behavior="smooth">` is set. | Tapping a product from the bottom of a listing glided the new page up from wherever the old one was. | Attribute added in `src/app/layout.tsx`; anchors still glide, route changes jump. |
| 9 | Styled `::-webkit-scrollbar` on `*` — on phones a styled scrollbar is painted by the page instead of drawn as a free overlay by the compositor. | Main-thread scrollbar paint per frame on Android. | Scrollbar styling scoped to `(hover: hover) and (pointer: fine)`. |
| 10 | Footer laid out and painted on every page although it is off-screen for the whole browse. | Layout/paint budget on long pages. | `.below-fold-block` (`content-visibility: auto; contain-intrinsic-size: auto 720px`) on the footer. |

Left alone on purpose: `ScrollDepthTracker` (passive + rAF, no state), `Reveal`
(compositor-only, self-cleaning), the shop's scroll restore (`behavior:
"instant"`), `snap-x` rails (horizontal only), `Link` viewport prefetch (deduped,
and the reason a tap feels instant).

## Rules (so it stays smooth)

1. **Nothing re-renders on a clock unless it shows the clock.** Subscribe to
   a *phase* (a boolean/instant that changes rarely); keep ticking digits in a
   leaf component. `useNow()` exists for the few places that need wall time.
2. **Scroll handlers write styles through refs**, never `setState` per frame.
   `scrolled`-style booleans may use state but must only toggle paint
   properties (shadow, border, opacity, transform) — never height/padding.
3. **No `backdrop-filter` on anything that is fixed/sticky on phones.** Use a
   ≥ 95 % opaque background; blur only under `pointer-fine:`.
4. **No standing `will-change` in stylesheets.** The two exceptions are
   transient (`.reveal-pending`, removed once the reveal ends) or a single
   tiny element written every frame (the header progress line). Transitions
   promote on demand.
5. **One image per card until the shopper asks** (hover/press/focus); pass
   `sizes` that match the column the card sits in.
6. **`scroll-behavior: smooth` is for anchors.** Programmatic scrolls set
   `behavior` explicitly; the root layout keeps `data-scroll-behavior="smooth"`.

## Tests

- `src/lib/__tests__/use-promos-phase.test.tsx` — a price does not re-render
  while the clock ticks; one render when a window opens and one when it closes;
  the shared timer stops with the last subscriber.
- `src/components/layout/__tests__/header-scroll.test.tsx` — one bar height,
  announcement outside the sticky element, `data-scrolled` flips once, progress
  written to the line's transform with no child render per frame, blur is
  `pointer-fine:` only.
- `src/components/product/__tests__/product-card.test.tsx` — one `<img>` per
  card until pointer-enter/focus; the peek suite still cycles the photos.
- `src/components/promo/__tests__/flash-progress.test.tsx` — the progress
  line's transform/transition maths, reduced-motion behaviour.

## On-device checklist (what to feel for)

Phone (Android Chrome, ideally a mid/low-end one), production build:

1. `/shop` — fling the grid up and down: no per-second hitch, the header does
   not change height, the bottom bar stays crisp (no frosted look), cards keep
   one photo until you press one.
2. Home — rails and sections should fade in once as they enter; no blur
   "flash" on cards.
3. Tap a product from far down the list: the product page should appear at
   the top **without** a visible glide from below.
4. Open the menu / bag drawer: the page behind dims (no blur), the panel
   slides without dropping frames.
5. Desktop — mouse wheel: native scrolling (stops when the wheel stops); the
   header keeps its frosted look; the gold progress line follows the page.

If a flash window is configured, leave a listing open across the opening
minute: prices flip once, exactly at the minute; the strip's progress line
moves on its own.
