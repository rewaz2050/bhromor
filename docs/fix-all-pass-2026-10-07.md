# Fix-all pass — the two I had left, and one found on the way (2026-10-07)

**Status:** shipped · **Surfaces:** storefront layout, delivery zones ·
**Language:** briefing in Bangla, UI terms in English.

The previous passes ended with two known problems I had chosen not to fix,
and one the audit had not reached. All three are done.

| Problem | Why it was a problem | Fix |
|---|---|---|
| The storefront painted Bangla and swapped to English after hydration | The device's choice lives in a cookie only the SERVER can hand to the first byte — but the layout rendered `initialLang="bn"` and the client corrected it a moment later. A shopper who had picked English watched every word on the page change after the paint. | `src/app/(site)/layout.tsx` reads the cookie (`languageFromCookie`) and passes it to `LanguageProvider`. Verified against a production server: `Cookie: prosanti-lang=en` → the HTML carries "Shop"; without it → "কেনাকাটা". |
| `useLiveZones()` fetched `/api/zones` once PER consumer | Each consumer kept its own `useState` + fetch: the header's area pill, the home delivery check, checkout's zone list, both apply forms and the vendor's settings page — up to six requests for one page, each flashing the shipped fallback rows before its copy answered. | The hook now reads the shared zones store (`useSyncExternalStore` + `ensureLiveZones`, the same pattern the catalog uses). One request per page session; a revisit paints from memory. |
| A hanging zones read never settled | `fetch("/api/zones")` had no deadline, so `loading` stayed true forever on a dead connection. | `ensureLiveZones()` uses `fetchWithDeadline` (12 s), the helper this week's account pass added. |

## The trade-off, stated

Reading the cookie makes the storefront layouts **dynamic** — the home page
was ISR (`revalidate = 60`) and is now rendered per request. Two things keep
that cheap:

- **The data is still cached.** `getStorefrontCatalog()` and the homepage CMS
  row run through `unstable_cache` (`PUBLIC_CACHE_SECONDS`, tagged), so a
  dynamic render re-renders HTML from cached rows; it does not re-query the
  database.
- **What is lost is the cached HTML** (a CDN copy of one Bangla page). What
  is gained is that no shopper is served a page in the wrong language.

If the shop would rather keep the CDN copy, the alternative is one static
route per language with a middleware rewrite — a bigger change, not needed
at this scale.

## A trap worth remembering

`languageFromCookie` was first written in `language-provider.tsx`, which is
`"use client"`. Next replaces a client module's exports with *client
references*, so the server layout calling it threw at runtime:

> Attempted to call `languageFromCookie()` from the server but
> `languageFromCookie` is on the client.

(The layout already carried a warning about this for the cookie's NAME; the
same rule applies to any function.) The helper now lives in
`lib/translations.ts`, which has no `"use client"` — the provider re-exports
the key so existing imports keep working.

**Rule:** anything a server component must *call* lives outside a `"use
client"` module; a client component may import it, a server component may
not.

## Also in this pass

- The provider no longer writes `localStorage` + the cookie on every page
  load — only when the shopper actually changes the language (the server's
  answer already came from that cookie).

## Tests

- `lib/__tests__/language-from-cookie.test.ts` (3) — the two languages, the
  "not a choice" cases, the shared cookie name.
- `lib/__tests__/use-live-zones.test.tsx` (5) — fallback rows while the read
  is in flight, ONE request for many consumers, inactive zones dropped, a
  revisit without a second request, and the fallback kept when the backend
  answers nothing.
