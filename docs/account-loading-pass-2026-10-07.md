# Account loading pass — the page stopped saying "চেক করা হচ্ছে…" (2026-10-07)

**Status:** shipped · **Surface:** `/account` (storefront) ·
**Language:** briefing in Bangla, UI terms in English.

An audit of the account surface for two things: **what the shopper sees while
it loads**, and **what the code does wrong**. Three real problems, all fixed.

| Problem | Why it was wrong | Fix |
|---|---|---|
| Every account visit began with "সেশন চেক করা হচ্ছে…", then swapped | The session lives in an httpOnly cookie — only the SERVER can read it — but the page was a client component waiting for a client probe. The HTML shipped a spinner and the real page arrived one round trip later. For a shopper signed in for months: spinner → whole dashboard swap, on every visit. | `/account` is now a server component: it reads the cookie with `next/headers`, resolves the customer, and hands it to `<AccountView initialCustomer={…}>`. The first paint IS the page (verified: the production HTML carries the sign-in form, no "checking…" line). |
| A slow network could hang the page forever | `fetch("/api/account/me")` had no deadline. A request that never answers is indistinguishable from a slow one, so `checked` stayed `false` and the spinner stayed up. | `lib/fetch-with-deadline.ts` — every read the shopper waits on gets a deadline (session probe 8 s, panels 12 s). When it passes, the panel shows its error state with a retry. |
| A failed probe signed the shopper out | Network failure set `customer: null` — so a phone that lost signal between two taps showed the login form to somebody who was signed in. | A **definitive** answer (200/401) is the truth and may correct the seed; a **failed** one keeps what the server proved. A dead connection is not a sign-out. |

## Rules the code follows

- **The server answers first, the browser confirms.** `useCustomer(initial)`
  returns the server's answer until the shared store has one of its own; the
  value is identical on the server render and on hydration, so React repairs
  nothing and nothing flickers. `seedCustomerSession()` shares it with every
  other consumer on the page (header, smart card, wishlist).
- **A seed may be corrected, never by silence.** `probeCustomerSession()`
  writes the customer only when the API answered. A timeout or a network
  error marks the session *checked* and leaves the identity alone.
- **Every read has a deadline.** `fetchWithDeadline(input, init, ms)`; an
  abort is re-thrown as `FetchDeadlineError` so callers can tell "slow" from
  "broken" (a `DOMException` is not an `instanceof Error` everywhere — the
  check is on `name`).

## Also looked at, no change needed

- `AccountWishlistProvider` — already pinned to one element type so the
  storefront is not remounted under it when the probe settles (that bug used
  to close drawers and drop typed input).
- `OrderHistory`, `ReferralCard`, `PlusCard` — already have loading, error
  and a retry; the orders and smart-card reads now also carry a deadline.
- `customer-profile` — reads device-local addresses, no network to hang.

## Tests

- `components/account/__tests__/account-initial-session.test.tsx` (4) — the
  dashboard paints at once for a signed-in shopper, the form at once for a
  guest, and the honest wait only when the server could not check.
- `lib/__tests__/customer-session-probe.test.ts` (4) — a hanging request
  resolves as *checked*; a network failure keeps the session; a real 401
  clears it; one request for every consumer.
- `lib/__tests__/fetch-with-deadline.test.ts` (4) — the deadline, the fast
  path, and a real failure not disguised as a timeout.
