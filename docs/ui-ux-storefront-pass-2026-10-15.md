# Storefront UI/UX pass — 2026-10-15

এক রাউন্ড, শুধু **স্টোরফ্রন্ট** (ক্রেতা যা দেখে)। Admin / vendor / rider
স্ক্রিনে হাত দেওয়া হয়নি — `globals.css`-এর স্টোরফ্রন্ট-স্কোপড নিয়মগুলো যেমন
ছিল তেমনই আছে।

Cost: **৳0**. No new dependency, no schema change, no new endpoint. Every
line below reads data the app already had.

Quality gate — the exact steps `.github/workflows/ci.yml` runs, in order:

| Step | Result |
| --- | --- |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `npm run lint` | exit 0 (0 errors, 3 warnings — see §7) |
| `npm run typecheck` | exit 0 |
| `npm test` | **542 files / 3,712 tests pass** (was 541 / 3,706) |
| `npm run build` | exit 0, 83/83 static pages |

CI on `main` was already **red** before this branch: runs `38705235320` (the
PR #45 merge this branch is cut from) and `38681729490` (PR #44) both failed,
last green was PR #43. §7 is what turned it back on.

---

## ১. `/track` পুরোটা দ্বিভাষিক 🔴

**What was wrong, with evidence.** The tracker is the page the bottom nav's
Orders tab sends a guest to (`bottom-nav.tsx:49` — `ordersHref = customer ?
"/account" : "/track"`), and it was half translated. `track-view.tsx` called
`t()` for the timeline below the fold and hard-coded English for everything
above it:

| Where | Was |
| --- | --- |
| `track-view.tsx:223` | `Track your order — Sunamganj Sadar` |
| `:268` / `:283` | `Order ID` · `Phone number` |
| `:307` | `Checking…` / `Track order` |
| `:323` / `:336` | `Where is my order?` · `No order found` |
| `:238` / `:248` | `আপনার শেষ অর্ডার` · `ট্র্যাক করুন` — hard-coded **Bangla**, so an English reader met stray Bangla on the same form |
| `:510`–`:600` | `Your order` · `Subtotal` · `Free (shop offer)` · `Night:` · `💝 Tip` · `Total (COD)` · `Delivery — Sunamganj Sadar` · `WhatsApp Support` · `View Pin on Map` · `Note:` |
| `track/page.tsx` | `Rapid delivery, transparently` · `Track your order` · the sub-line |

A Bangla shopper read a Bangla timeline under an English form. An English
shopper read Bangla on the shortcut.

**What changed.** 40 new keys under `track.*` in both languages
(`src/lib/translations.ts`), every literal above now `t(…)`. The page header
stays a server component and uses the existing `<L>` bilingual leaf the info
pages already use (`components/i18n/l.tsx`).

The cancelled-order note keeps its number bold mid-sentence by splitting on
the `{number}` placeholder rather than appending, so the sentence reads
naturally in either language.

The tracker's own quantities now follow the shop's one number rule — a
`digits()` helper in `track-view.tsx` Bangla-ises them for a Bangla reader.

Two tests asserted the old hard-coded Bangla (`track-prefill.test.tsx:113`
and `:126` looked up buttons by the pasted string `ট্র্যাক করুন` /
`শেষ অর্ডার শর্টকাট সরান`). They now read the labels from
`translations.en.track.*` so they can never pin one language again, and
three new cases pin **both** languages — heading, both field labels, the
submit button, the empty state and the "no order found" answer.

## ২. ফুটারের নিউজলেটার কার্ড দ্বিভাষিক 🟠

`components/layout/newsletter.tsx` was entirely English, and it renders in
the footer of **every** storefront page, directly under a fully translated
footer. Nine strings were literal: the heading, the body, the button, both
button states, the success line, all three error lines and the cadence note.

New `newsletter.*` block (en + bn); the component reads `useLanguage()`,
which already falls back to English outside a provider, so the existing
tests needed no provider wrapper. One new case mounts it under
`LanguageProvider initialLang="bn"` and asserts no English button survives.

Same edit gave the email field a real focus indicator: it carried
`focus:outline-none` with only `focus:border-gold-300` behind it — a border
colour change on a dark background. It now has
`focus-visible:ring-2 ring-gold-300` with an offset.

## ৩. বাংলা সংখ্যা — বাকি পাঁচ জায়গা 🟢

UX plan §1.4 says every number reads in Bangla digits, and `bnDigits` was
already imported in 38 files before this pass (43 now). These were the last Latin digits a Bangla
shopper met on the storefront:

| File | Was |
| --- | --- |
| `product/product-card.tsx:427` | `String(product.unitsSold)` — the card Bangla-ised its rating, its review count and "only N left", but not "N sold" |
| `cart/bag-drawer.tsx:96` | `({itemCount})` in the drawer heading |
| `cart/cart-view.tsx:247` | `({itemCount} items)` in the summary |
| `account/order-history.tsx:263` | `` `মোট ${row.itemCount}টি` `` — Latin digits inside a Bangla sentence |
| `reviews/customer-stories.tsx:96,101` | the `4.5 / 5` average and the review count |

## ৪. কনট্রাস্ট — দুটো আসল ফেল 🔴

Measured (WCAG relative luminance, not eyeballed):

| Pair | Before | After |
| --- | --- | --- |
| `text-white` on `gold-500` (`#ab8748`) | **3.34:1** — under the 4.5:1 AA needs for text this small | `text-forest-950` → **5.40:1** |
| compare-at price, `ink-soft/75` on `ivory-50` | **3.40:1** | solid `ink-soft` → **5.82:1** |

Where: `ui/primitives.tsx` (`Badge` kind `sale`, and the same rule restated
on `btn.gold`), `live/live-view.tsx:266` ("Coming up" pill), and the struck
old price in `ui/primitives.tsx`'s `<Price>` — which is the number that
carries the "you are saving" claim, so it should not be the hardest thing on
the card to read.

The `bg-red-600` "LIVE" pills measure 4.83:1 and were left alone.

## ৫. টাচ টার্গেট 🟢

`ui/primitives.tsx`'s `btn` recipe set height by padding alone:

| Size | Was | Now |
| --- | --- | --- |
| `sm` | ~36px (`px-4 py-2 text-sm`) | `min-h-11` = 44px |
| `md` | ~44px (already fine) | `min-h-11`, explicit |
| `lg` | ~56px | `min-h-14`, explicit |

36px is fine for a mouse and too small for the thumb that actually taps
"continue shopping" on a phone. Only one `size="sm"` ButtonLink exists today
(`cart-view.tsx:224`), so nothing dense moved.

Two more targets on the tracker grew to 44px: the last-order "Track it"
button (`py-1.5` → `min-h-11`) and its ✕ dismiss, which was ~26px square
and is now `h-11 w-11`. The delivery card's two links (`WhatsApp Support`,
`View Pin on Map`) went from `py-1` to `min-h-11`, and the map link gained
the `rel="noreferrer"` its sibling already had.

## ৬. ফোনে কার্টের চেকআউট বোতাম 🔴

On `lg` the summary is a sticky aside. Below `lg` the grid stacks, so the
summary — and the only checkout button on the page — sits **under** every
line item. A three-piece bag pushed it below the fold, and the listing
pages' `BagMiniBar` deliberately skips `/cart` (`bag-mini-bar.test.tsx` pins
that, and rightly: the cart has its own summary).

`cart-view.tsx` now renders `data-testid="cart-sticky-checkout"` — a fixed
bar above the bottom nav with the estimated total and the checkout link,
same geometry and same single primary action as the mini-bar. `lg:hidden`,
so desktop is untouched. `cart/page.tsx` reserves `pb-44 lg:pb-16` so the
bar never covers the last line.

Two new cases (`cart/__tests__/cart-sticky-checkout.test.tsx`): the bar
appears with three pieces, its link points at `/checkout`, and its total
renders in Bangla digits for a Bangla reader; an empty bag renders no bar.

---

## যা ইচ্ছে করে বাদ দেওয়া হয়েছে

- **`BagMiniBar`-এ `/cart` যোগ** — its own test says the cart is out of
  scope, and a second bar over the cart's own summary would be noise.
- **`btn.base`-এ `tap-press`** — `.tap-press` sets a bare
  `transition: transform`, unlayered, which would have overridden
  `transition-colors` on every ButtonLink and quietly killed the colour
  transitions to add a scale.
- **Admin/vendor/rider-এর gold ব্যাজ** — `admin-gate`, `admin-sidebar-nav`,
  `command-palette`, `message-inbox` carry the same white-on-gold pill. Out
  of scope for a storefront pass; worth a follow-up.
- **`about` / `delivery` / `returns` / `contact`-এর মূল কপি** — still
  English, still listed as open in the UX plan §1.4. Bigger than one pass.

---

## ৭. CI আবার সবুজ — দুটো pre-existing lint error 🔴

CI was red on `main` before this branch, at the **Lint** step — so the
`Types`, `Unit tests` and `Build` steps never ran on the last two merges.
Both errors were in one file, `components/analytics/analytics-consent-gate.tsx`,
added by `3a04b7f` (PR #45), the commit this branch is cut from. Neither was
in this pass's diff; both are cleared here because a PR whose gate is red
gets merged without being read.

| Error | Fix |
| --- | --- |
| `react-hooks/set-state-in-effect` (`:28`) | An `eslint-disable-next-line` with the reason, matching the convention already used in 10+ files here (`admin/growth`, `admin/orders`, `i18n/language-provider`…). The effect is **correct**: `readAnalyticsConsent()` reads localStorage, and a lazy `useState` initializer would render the stored choice on the client and `null` on the server — a hydration mismatch on every returning visit. The rule is being told why, not being worked around. |
| `@next/next/no-html-link-for-pages` (`:77`) | `<a href="/privacy">` → `<Link>`. This one is a real UX fix and it belongs in a storefront pass: the consent banner is rendered by `(site)/layout.tsx`, so the `<a>` did a full document load that tore down the banner and the visitor's half-made choice just to read one info page. |

The 3 remaining **warnings** (`WINDOW_MS` / `LIMIT` unused in
`api/track/reschedule/route.ts` and `api/track/rider-location/route.ts`) do
not fail `eslint` and were left alone — deleting a named constant from a
route file that someone is evidently mid-edit on is not this pass's call.

---

## যাচাই — build করা আউটপুটে, সত্যিকারের রিকোয়েস্ট

`npm run build` তারপর `npx next start`, আর `/track`-এ দুই ভাষার কুকি পাঠানো
হয়েছে। rendered DOM (`<script>` বাদ দিয়ে, কারণ RSC payload-এ দুটো ভাষাই
থাকে — ক্লায়েন্ট যেন রিফেচ ছাড়াই ভাষা বদলাতে পারে):

| রিকোয়েস্ট | HTTP | বাংলা হেডিং | ইংরেজি হেডিং |
| --- | --- | --- | --- |
| `Cookie: prosanti-lang=bn` | 200 | 4 | 0 |
| `Cookie: prosanti-lang=en` | 200 | 0 | 1 |

## পাওয়া একটা সমস্যা — এই রাউন্ডে ঠিক করা হয়নি

**`src/app/layout.tsx:54` hard-codes `lang="en"`.** The Bangla request above
came back with `<html lang="en">` in its raw HTML even though every word on
the page was Bangla. This pass did not touch that file.

A shopper never sees it: `(site)/layout.tsx` injects a pre-paint
`LANG_BOOTSTRAP` script that sets `document.documentElement.lang` before the
first frame, so the `:lang(bn)` typography rules (no letter-spacing on
conjuncts, the Noto Serif Bengali display fallback) apply correctly. What is
left exposed is anyone reading the HTML without running that script — a
crawler, a screen reader hitting the markup directly, a link preview.

The obvious fix is wrong. `<html>` is rendered once, by the root layout, and
that layout is shared with the admin, vendor and rider apps — which are
English-only. They read the *same* `prosanti-lang` cookie, so a Bangladeshi
ops user with `bn` stored would get `:lang(bn)` applied across every admin
screen: Noto Serif Bengali and `letter-spacing: 0` on English text. Fixing
it properly means making the root layout aware of which route group it is
serving, which is middleware work and a bigger blast radius than a
storefront copy pass should carry. Left open on purpose.
