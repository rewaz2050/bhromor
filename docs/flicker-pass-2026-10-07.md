# Flicker pass — "আর কিছু আছে যাতে flicker হয়?" (2026-10-07)

**Status:** shipped · **Surfaces:** storefront chrome, promos, contact, fonts, dates · **Language:** briefing in Bangla, UI terms in English.

The audit question was: what else moves after the shopper starts reading it?
Six things did. All six are fixed. Three more were found and left alone —
with the reason, at the bottom.

| # | What moved | Where | Fix |
|---|---|---|---|
| 1 | The flash bar, the campaign strip AND every flash price arrived after `/api/promo` answered | whole storefront | The layout reads the promo document on the server and seeds the client store before the first render |
| 2 | The whole page jumped down when those strips appeared | every page, during a drop | Same fix — they are now in the first paint |
| 3 | The language provider re-rendered the whole tree after hydration, and could contradict the server | every page | It now only *corrects* a device that disagrees; it never re-decides |
| 4 | The contact channels replaced "use the message form" with 1–3 cards after a fetch | `/contact` | The page reads them on the server and passes them down |
| 5 | Dates printed in the server's time zone during SSR and the shopper's in the browser | reviews, returns, live, warranty, tracking | One pinned formatter (`formatShopDate`, Asia/Dhaka) |
| 6 | Text arrived in a fallback face and swapped | every page, cold load | The two faces that paint the page are preloaded |

## 1 + 2 — the promo state in the first paint

`useSyncExternalStore`'s third argument is `getServerSnapshot`, and the promo
store's answered `OFFLINE_PROMOS` — always. So the server painted "nothing
is running": no strip, and **catalog prices**. Then the client fetched
`/api/promo` and corrected it.

The visible cost was not one thing:

- the flash bar appeared and pushed the page down by its height;
- the campaign strip pushed it down again;
- and every `useFlashPrice()` card on a listing silently changed — ৳1,490
  became ৳1,192 a beat after the shopper started reading it. A price that
  moves on its own is worse than no discount.

**Fix.** `readPromoSeed()` (new, `src/lib/db/promo.ts`) reads the ops
document on the server; the storefront layout passes it to `<PromoBoot>`,
which seeds the store in its render body — before the strips and the product
grid below it render. Seeding happens on both sides on purpose: during SSR it
seeds the server's copy (the one the strips read while rendering), and on the
client it seeds the browser's copy before the same strips hydrate.
`getServerSnapshot` now returns that seed, so React sees the SAME answer on
both sides and has nothing to tear out.

Three details that matter:

- **The store moved out of the `"use client"` module** into
  `src/lib/promo-store.ts`. A server component can call `seedPromos` there;
  an export from a `"use client"` file is a *client reference* on the server,
  not a value — the exact trap that 500'd this layout one pass ago.
- **The countdown's first frame is frozen at the clock the server
  published** (`promoView` already carried `asOf`). `Date.now()` on both
  sides differs by the few hundred milliseconds between them, which is a text
  mismatch React repaints.
- **No extra database round trip.** The seed is `unstable_cache`'d for
  `PUBLIC_CACHE_SECONDS` and tagged `CACHE_TAG_OPS` — the same minute and the
  same tag `/api/promo` used, and staff edits already revalidate that tag.
  The store still refreshes itself at the window boundaries
  (`schedulePromoRefresh`), and the paint read is skipped when seeded.

## 3 — the language provider

It called `setMounted(true)` and re-read `localStorage` on every mount, so
the entire provider subtree re-rendered once, right after hydration, on every
page load. Worse, `readStoredLanguage()` prefers `localStorage` over the
cookie the server had just read — a device where the cookie write had been
blocked got served Bangla and then swapped to English, which is the flicker
the previous pass set out to remove.

Now the effect only fires when the device's own answer *differs* from what
the server rendered (`stored !== initialLang`), and the write effect keys off
the last written value instead of a mount flag. A page load writes nothing.

## 4 — the contact page

`/contact` painted a "Use the message form" panel and then swapped it for one
to three channel cards, moving the whole column. The page is a server
component: it now reads the channels itself (`readContactChannels`, cached
and tagged like the promo seed) and passes them to `<ContactChannels
initial={...}>`, which does not ask again. `/api/contact` reads the same
function, so the two cannot drift.

While in there: this page was the one storefront surface still speaking pure
English on a shop whose default language is Bangla. The copy is now
bilingual through `<L>`.

## 5 — dates

An unpinned `toLocaleDateString("en-GB")` answers from the machine it runs
on. The server is UTC; a shopper is in Dhaka. For six hours of every
Bangladeshi day those are different dates: the HTML carries one, hydration
paints another, and React tears the text out. `formatShopDate(ms, options)`
pins `Asia/Dhaka` and takes epoch ms, an ISO string or a Date (the backend
returns all three). Applied to reviews, the returns window, the live
schedule, the warranty panel and the rider's live-location stamp.

This is also just correct: a customer in Sunamganj should never be shown a
date the shop's own clock would not agree with.

## 6 — fonts

Inter and Noto Serif Bengali are self-hosted through `@fontsource`, but
nothing preloaded them, so the browser met the faces only after parsing the
CSS that names them: the page painted in a fallback and swapped — a full-page
reflow on every cold load, on a site whose body text is Bangla. The two faces
that paint the storefront are now `<link rel="preload" as="font">` in the
layouts. Verified in a production build: both hints are emitted and both URLs
answer 200.

## Tests

- `lib/__tests__/promo-seed.test.tsx` (7) — the strips and the flash PRICE
  through `renderToStaticMarkup`, the frozen countdown, no duplicate read
  when the server seeded, a read still happens where it did not.
- `lib/__tests__/shop-date.test.ts` (3) — Dhaka dates for the three
  timestamps that fall on different days in UTC, ISO/Date parity, garbage in
  → nothing out.
- `components/i18n/__tests__/language-provider.test.tsx` (4) — keeps the
  server's language and writes nothing, writes once on a real switch, brings
  back a choice the server could not see.
- `components/contact/__tests__/contact-channels.test.tsx` (+2) — Bangla
  copy, and the server's channels painted without a second request.

## Found, and left alone

- **`window.alert` / `window.confirm` in the admin — fixed elsewhere, this
  one is done.** `src/app/admin/zones/page.tsx` used both: they freeze the
  tab and cannot be styled. Deleting a zone is now a two-press button with
  the question on the row, and failures print in the page's own notice.
- **43 `target="_blank"` links without `rel="noreferrer"`.** Left: every
  current browser implies `noopener` for `target="_blank"`, so there is no
  reverse-tabnabbing to fix, only a lint pedant to please.
- **"Coming soon" panels in `/admin/payments` and the campaign page.** Left:
  they are honest placeholders for work that is not built, not broken copy.
- **Timezone-unpinned `toLocale*` calls in the admin, vendor and rider
  dashboards** (12-odd sites). Left: those surfaces render their rows after a
  client fetch, so nothing is server-rendered to disagree with. They should
  still move to `formatShopDate` the next time each file is opened — the
  formatter is there and tested.
