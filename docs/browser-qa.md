# Storefront browser QA — 8 September 2026

## Executed
14 Playwright tests passed against the running Next.js development storefront in headless Chromium 149. The browser was supplied through a temporary bundled Chromium binary because the normal browser CDN/dependency downloads were inaccessible in the sandbox. Browser binaries/libraries are not repository dependencies or committed artifacts.

- **320, 390, 768, 1024 and 1440px:** homepage, shop and Panjabi PDP; no horizontal document overflow or uncaught page errors. Full-page screenshots captured for all 15 combinations. Desktop home, mobile home/shop and narrow PDP screenshots visually inspected.
- **Mobile touch context, 390 × 844:** Quick Add requires a size, quantity increase, inline fit guide, Add to Bag, selected variant/count retention, navigation to checkout and valid address form entry. No order submitted.
- **Keyboard:** search input receives initial focus, repeated Tab stays inside the modal, Escape closes, trigger focus and body scrolling restore. Background elements are inert while the dialog is open.
- **Wishlist/filter:** guest wishlist survives reload; mood + price produces an empty result and Clear all restores the catalogue.
- **Reduced motion:** hero and drawer entrance animations disabled; section headings remain visible.
- **axe WCAG 2 A/AA + 2.1 AA checks:** homepage, shop, PDP, account, wishlist, expanded Quick Add, populated bag, checkout form and search dialog have zero detected violations in tested states.

## Issues found and fixed
- Mobile hero spotlight covered the model's face. Moved it below the upper image area on small screens and removed the competing mobile signature caption. Added a position regression assertion.
- Gold eyebrow text had insufficient contrast against ivory. Darkened the text token while preserving the palette.
- Struck-through prices, checkout policy copy and unavailable-payment descriptions were too faint. Removed inappropriate opacity.
- Decorative footer lettering and several gold badges had insufficient contrast. Increased contrast.
- Review star groups used `aria-label` without valid semantics. Added `role="img"`.
- Disabled online-payment radio lacked an accessible label. Added a descriptive label without enabling the unavailable payment method.
- Modal backgrounds were not inert. Added reversible inert handling, included native summary controls in focus management and handled empty focus lists.
- The Next.js development indicator overlapped mobile navigation. Disabled the indicator in development configuration; compilation errors remain visible in logs/overlays.

## Re-run
```bash
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

### Which suite runs where (2026-10-13)

The two suites were kept out of CI together, on the grounds that both "need a
seeded backend and a browser". Only one of them does.

| Suite | Network | In CI? |
| --- | --- | --- |
| `test:dashboards` — `e2e/dashboards.spec.ts` | intercepts every `**/api/**` with fixtures; config points Supabase at `https://verification.invalid` | on `main` and on demand — job `browser` in `.github/workflows/ci.yml`, Chromium only, no secrets, `continue-on-error`, skipped on pull requests |
| `test:e2e` — `e2e/storefront.spec.ts` | stubs nothing; asserts on `/product/heritage-green-panjabi` by slug | no — needs a real seeded catalog, so it would fail against an empty shop |

So the storefront suite is opt-in until there is a staging database to point it
at. The dashboards suite runs, but it is **not a gate and not on pull
requests**: its first CI run (`38404495301`) installed Chromium cleanly and
then failed in the test step, and the detail could not be read — the Actions
log host (`results-receiver.actions.githubusercontent.com`) and the artifact
blob (`*.blob.core.windows.net`) are both outside the network allowlist of the
sandbox that wired the job up, and the check-run annotation says only "Process
completed with exit code 1".

What *was* ruled out from the source, without a browser: every selector and
route the spec uses still resolves. `account-tab-profile` is generated from
`` data-testid={`account-tab-${key}`} `` with `profile` in the tab list, the
six Bengali button/label strings all still appear in `src`, and the five
routes (`/account`, `/admin/deliveries`, `/rider/profile`, `/vendor/orders`,
`/vendor/settings`) all exist. So it is not a stale selector — which is why
guessing further was not worth more than saying so.

**To close this out:** open run `38404495301` → job `browser` → step
`Dashboards` in the GitHub UI, or download the `playwright-report` artifact
from that run. Fix what it names, then in `.github/workflows/ci.yml` remove
both `continue-on-error: true` and the `if: github.event_name != 'pull_request'`
line, and it becomes a real gate on pull requests.

For an existing preview:
```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

An environment with a separately installed Chromium may set `CHROMIUM_EXECUTABLE_PATH`. The configuration otherwise uses Playwright's standard browser. HTML report, screenshots and failure traces are under `.cache/playwright-*` and intentionally excluded from Git.

**Serve a production build for the isolated dashboard contracts.** The staff surfaces (`/admin/*`, `/vendor/*`, `/rider/*`) enforce a Content-Security-Policy whose `script-src` deliberately omits `unsafe-eval`, while React in development mode uses `eval()` for debugging call stacks. Under `next dev` the staff pages therefore log *“eval() is not supported in this environment”* and do not hydrate, so every interactive contract times out even though the routes answer 200. Build once, then start the same server the tests target:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://verification.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=verification-only SUPABASE_SERVICE_ROLE_KEY= npm run build
NEXT_PUBLIC_SUPABASE_URL=https://verification.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=verification-only SUPABASE_SERVICE_ROLE_KEY= npx next start --hostname 0.0.0.0 --port 3100
E2E_BASE_URL=http://127.0.0.1:3100 npm run test:dashboards
```

Measured on 2026-10-27: same spec file, 12/12 in 11.9 s against the production build, 6 failures in 2.6 min against `next dev` (only the storefront contracts passed there).

## Limits
- Automated accessibility checks do not establish complete WCAG conformance or replace screen-reader/manual usability testing.
- Chromium responsive/touch emulation is not physical iOS Safari or Android-device testing. Firefox, WebKit, real devices and slow-network testing remain unverified.
- This suite does not send OTP emails, test deployed Supabase RLS, submit orders, charge payments, or verify production social/review/sales sources. See `customer-accounts.md` for required backend checks.
- Screenshots are inspection artifacts, not stored visual-diff baselines; future pixel changes are not automatically compared to a golden image.

## Update — 26 September 2026 (menubar redesign)

- The storefront defaults to Bangla since P1 #8; this suite asserts English copy, so every test now pins `localStorage["prosanti-lang"] = "en"` before the page scripts run (`pinEnglish` in `e2e/storefront.spec.ts`). The search dialog is located by its current name ("Search products") and `settled()` waits on the first `<header>` (the account page nests one of its own).
- Running the suite here surfaced a real storefront bug: the site remounted wholesale ~1.5 s after load when the customer-session probe answered (`AccountWishlistProvider` switched wrapper types), which is why a click on the search trigger in that window "did nothing" — the dialog opened and was thrown away. Fixed in `src/components/account/account-wishlist-provider.tsx`; the header no longer remounts, and the search/keyboard test passes.
- The catalog is live-only (no seed rows in the browser). Against a sandbox with no Supabase the home category row, shop grid and product pages are empty, so the responsive, quick-add, wishlist/filter and reduced-motion checks cannot pass there — they need a configured preview (`E2E_BASE_URL=https://…`). The axe scans on `/`, `/account` and `/wishlist` pass in the empty state; `/shop` and the PDP report mid-transition contrast on the below-the-fold journal block only because the empty page is short enough for it to be revealing while the scan runs.


## Update — 20 October 2026 (UX refinement pass)

- `e2e/ux-refinement.spec.ts` adds browser-only catalog/zone fixtures. These
  intercept browser requests; they do not seed Supabase or alter production
  fallback behavior. The shop route's server-rendered grid still needs a
  configured database, so populated fixture checks use the home shelf.
- Verified Bengali and English home/small-catalog layouts plus the empty
  shop layout at 320, 390 and 1440px: no horizontal document overflow or
  uncaught page errors; native announcement disclosure opens by click and
  closes with Enter. Best/new/offers rails stay absent with two products.
- Verified mobile quick-add → bag → checkout with fixture products, the
  choose-area estimate prompt, and optional house input retaining its value
  across disclosure close/reopen. No order was submitted. Seven tests pass.
- Axe scans pass on local `/`, `/shop`, `/account` (guest), and `/wishlist`
  (empty). The helper materializes `.below-fold-block` before scanning: Axe
  otherwise samples the body background for Chromium's unpainted
  `content-visibility: auto` footer and produces misleading contrast results.
  This test-only override does not change production rendering.
- Targeted Vitest regression: 58 files / 242 tests pass. TypeScript, ESLint
  and production build also pass. Some existing tests emit React `act()`
  warnings; these are not a clean full-repository test run.
- The full pre-existing storefront browser suite remains unverified here: it
  requires live server catalog rows, including PDPs. Authenticated portals,
  live CMS announcements, payment/order submission, valid tracking, physical
  devices and performance metrics remain outside this pass.
- For Arena's embedded local dev preview, use `ARENA_PREVIEW=1 npm run dev --
  --hostname 0.0.0.0 --port 3100`. The iframe exception applies only in
  development; production keeps its clickjacking protection.


## Update — 20 October 2026 (support and information phase)

- Contact: localized field-level errors describe invalid inputs and focus the
  first one. Drafts survive failed sends and rate limits; success requires
  the API's explicit `sent: true`. Submit payload/topic values and server
  validation rules are unchanged. Inputs are disabled only during sending.
- The no-channel fallback now remains visible with an empty server response
  or a failed fetch. It no longer promises that every attempted message
  arrives. Direct channel cards avoid unsupported fastest-reply claims.
- On the contact page, the location panel follows the form instead of
  pushing it below a long panel on phones. A browser-detected low-contrast
  note in that panel was corrected. Existing address/support hours and legal
  policy assertions were not independently verified in this phase.
- Tracking: a manual lookup focuses the result region and announces a short
  status. A not-found result offers return-to-input and contact-support
  actions; drafts remain in the form. Background refresh does not move
  focus (covered by the polling regression test).
- Privacy and terms: bilingual contents links target each existing section,
  with heading scroll offsets for sticky chrome. Legal policy text and
  displayed policy update dates are unchanged.
- `e2e/support-information.spec.ts`: four passing Chromium tests cover both
  languages at 320px, eight Axe page scans (contact, track, privacy, terms
  in both languages), working policy anchors, no document overflow, and
  intercepted contact failure/retry and tracking-not-found flows at 390px.
  No support message was actually sent and no real order was queried.
- Targeted support/tracking regression: 18 files / 116 tests pass. TypeScript,
  ESLint and production build pass. Real message delivery, valid production
  tracking, assistive-technology testing and authenticated staff workflows
  remain unverified.

## Update — 20 October 2026 (navigation and discovery phase)

- Search distinguishes a pending catalog, no catalog rows, and no matches
  for a query against available rows. A query entered while loading is kept
  when results arrive. Search analytics do not count an unavailable/loading
  catalog as zero-result demand.
- Search promotes only categories and quick terms represented in the
  catalog. Featured/in-stock fallback copy says “You may also like” rather
  than implying verified popularity. Configured WhatsApp links are retained;
  their action uses the high-contrast storefront palette.
- Search input, clear, close and submit controls have bilingual names, and
  clearing or choosing a query returns focus to the input. Its enclosing
  group provides one visible focus ring rather than a second inner outline.
- Mobile menu names/navigation regions follow the selected language. The
  category jump is omitted when no category shelf exists. Menu section
  labels are slightly larger; filter radio rows/close controls have 44px
  minimum dimensions.
- Filter drawer names, removal labels, category/mood labels, selected-filter
  feedback and result counts are localized. A live result count exists
  inside the modal, where the background status is inert. Filtering, URL
  serialization and immediate-apply/reset behavior remain unchanged.
- A genuinely empty shop no longer recommends a no-op “Clear filters” action.
  The no-catalog message offers support; filtered-empty and out-of-area
  recovery actions remain distinct.
- Final targeted Vitest run: 40 files / 233 tests pass across layout, shop,
  contact and tracking. TypeScript, ESLint, production build and diff
  whitespace checks pass. This is not the full repository test suite.
- Final Chromium run: all 16 tests across `discovery.spec.ts`,
  `support-information.spec.ts`, and `ux-refinement.spec.ts` pass. Discovery
  adds 320px Bengali/English search/menu focus restoration, keyboard focus
  containment, clear-control dimensions, six modal Axe scans, filter URL
  changes/reset, and a deliberately delayed catalog response.
- Discovery search/menu use browser-only catalog fixtures. The filter
  browser checks use the local empty server catalog; populated filter
  behavior is covered by component tests, not live database browser QA.
  Physical on-screen keyboards, screen readers, authenticated portals,
  production catalog flows and performance benchmarks remain unverified.

## Update — 20 October 2026 (account and staff access phase)

- Guest account access now leads the mobile page, before the benefits panel.
  The form, hints and guest-policy links follow English/Bengali preference;
  server-returned error text remains authoritative and is not rewritten.
- Customer signup now advertises/enforces the server's existing eight-character
  floor in the HTML field. Login retains its existing six-character floor;
  backend password policy, account enumeration protections and permissions
  are unchanged. No authentication endpoints were modified.
- Access tabs use labelled panels, roving tab stops and Left/Right/Home/End
  keyboard navigation. Password visibility resets when switching modes.
  Failed submissions focus the error and retain inputs; password-reset help
  offers `/contact` if no real WhatsApp number is configured.
- Shared `PasswordInput` ties its toggle to the actual input, supports input
  refs, and disables its toggle with the field. Existing application/reset/
  checkout callers were included in the targeted regression run.
- Vendor/rider sign-in marks and describes invalid fields, focuses the failing
  control, disables inputs while busy, and announces form busy state. Vendor
  sign-in now catches thrown request failures and reliably restores controls.
  Rider unconfigured-service copy no longer mentions implementation keys.
  Application approval, polling, session checks and redirects remain intact.
- `e2e/account-access.spec.ts`: four passing 320px browser tests cover Bengali
  and English customer access, native password requirements, keyboard tab
  changes, password controls, failed-login draft retention/focus, support
  recovery and form-before-benefits ordering. Vendor/rider checks exercise
  local invalid-input cases only, without sending valid credentials. All
  four checked screens pass Axe scans and document-overflow checks.
- Final targeted regression: 35 files / 146 tests pass, including account,
  password input, staff login, reset, application and checkout suites. Some
  existing tests still emit React `act()` warnings. TypeScript, ESLint,
  production build and whitespace checks pass.
- Combined browser rerun: 20/20 tests pass across account access, discovery,
  support/information and storefront refinement. This is not the entire
  pre-existing E2E suite. Customer failure responses are intercepted; no real
  account was created or signed in. Authenticated portals, staff approval,
  real password reset, backend permissions, physical devices and manual
  screen-reader use remain unverified.

## Update — 20 October 2026 (performance and resilience phase)

- Catalog products, delivery zones and read-only public settings now use a
  12-second JSON deadline covering both response headers and body parsing.
  A stalled body or a fetch implementation that ignores abort still settles.
  Failed settings retain the existing defaults and do not populate the
  successful-response cache. Existing `fetchWithDeadline` callers are unchanged;
  the new JSON helper owns its signal and is used only for these shared reads.
- Catalog readiness is one primitive external-store snapshot instead of two
  per-consumer state updates. Catalog failures notify all consumers, and an
  explicit retry deduplicates concurrent callers. No polling/retry loop was
  introduced; a timed-out request's late body cannot replace recovered rows.
- Home and search offer an English/Bengali retry without reloading. Search
  retains the query and focus; every subscriber sees the recovered catalog.
  Empty/non-live responses still do not substitute demo products.
- The drawer, main cart and checkout distinguish unresolved saved lines from
  a genuinely empty bag. They retain the stored lines through an unavailable
  catalog, explain the situation and offer recovery before showing current
  products/prices. The drawer's support link closes it before navigation.
- Browser checks exposed a separate hydration race under StrictMode's mount
  effect replay. It was reproduced in a failing unit test (`[]` overwrote the
  saved lines). Persistence now waits for the render containing the hydrated
  state; the regression passes. This is evidence about effect replay, not a
  claim that a production user had already lost a bag.
- Closed drawers no longer calculate recommendations or WhatsApp messages.
  A regression verifies recommendation work is absent until opening. Static
  imports remain: no initial-bundle reduction or production speedup is claimed.
- Targeted regression: **64 files / 259 tests pass**, covering request deadlines,
  catalog hydration/recovery, public settings, cart, checkout, navigation,
  home and product components. Existing React `act()` warnings remain in some
  tests. TypeScript, ESLint, production build and whitespace checks pass.
- Combined browser regression: **27/27 pass** across the five refinement specs,
  including seven new resilience checks. New coverage includes English/Bengali
  320px search/bag recovery, shared-reader recovery, saved lines on cart and
  checkout, restored modal focus, and a deliberately unanswered catalog that
  reaches recovery after its deadline. Two new bag-state Axe scans and narrow
  overflow checks pass; the English/Bengali screenshots were reviewed.
- Browser data are intercepted local fixtures, not database seeds. No order
  was placed, and no authenticated flow or backend policy was changed. The
  production build was verified, but browser checks used the development
  preview: these are not Lighthouse/Core Web Vitals measurements, an initial
  payload comparison, slow-device profiling or a production performance
  benchmark. Physical Android devices, real outages and authenticated portals
  remain unverified; this phase does not complete the entire audit backlog.

## Update — 20 October 2026 (purchase guidance phase)

- Quick Add now names its dialog and card trigger in the selected language,
  using a Bengali product name when supplied. Quantity, close and full-details
  controls are localized; quantities use Bengali digits in Bengali mode.
  Catalog-authored colors, size codes and product details are not translated
  or invented. Both languages retain their existing price formatting.
- A visible live status explains missing size selection, identifies the chosen
  size/color, or explains when every listed size is sold out. The existing
  disabled purchase/size rules remain intact; no new availability inference,
  default variant, quantity ceiling or pricing rule was introduced.
- Quick Add and the product purchase panel use the same presentation-only
  size ordering. A regression verifies the source array and selection defaults
  are unchanged. Purchase quantity controls are named as a group.
- Add to Bag is visually primary; Buy Now is a quiet bordered alternative in
  Quick Add and the main product panel. Purchase-panel CTAs no longer lift or
  add decorative shadows on hover. Both actions retain their existing guarded
  add, shop-conflict and navigation behavior.
- Targeted regression: **41 files / 163 tests pass**, covering product, size
  helpers, cart and checkout. New tests cover missing selection, all-size
  unavailability, Bengali labels, quantity and exact stored variant data.
  Existing React `act()` warnings remain in some tests. TypeScript, ESLint,
  production build and whitespace checks pass.
- Combined browser regression: **31/31 pass** across six refinement specs.
  The four new purchase checks exercise English/Bengali at 320px with available
  and unavailable size fixtures: selection, quantity, disabled sizes/actions,
  preserved variant data in the bag and close-focus restoration. Four new
  modal Axe scans and horizontal-overflow checks pass. English/Bengali
  selected-variant screenshots were reviewed.
- Browser coverage uses intercepted local catalog fixtures on the home card's
  Quick Add path. No live catalog was modified and no real order was placed.
  The server-rendered product detail route and authenticated commerce flows
  were not browser-tested with production data; the main purchase panel is
  covered here by component regressions. The pre-existing fit guidance still
  makes no claim of a verified measurement chart. This bounded pass is not an
  exhaustive product-detail, screen-reader, physical-device or stock audit.

## Update — 20 October 2026 (saved items and wishlist recovery phase)

- Wishlist loading, catalog failure, unlisted references and a genuinely empty
  list are now distinct English/Bengali states. Saved IDs are retained during
  unavailable/partial catalog reads; catalog failures offer the shared registry's
  explicit retry. Unlisted references do not become a false personal-empty
  message, including when someone opens a shared link.
- Shared-list saving had a reproduced failure: parallel toggles conflicted with
  the existing account single-write lock, dropping later items while announcing
  success. A regression first failed with the second item absent. The UI now
  saves sequentially, checks boolean results, catches thrown failures and
  reports incomplete saves. Retry skips already-saved available items. Saving
  is disabled while account data is unready or another save is in progress;
  success is derived from actual wishlist IDs, not a separate success flag.
  Account locks, permissions, storage boundaries and backend APIs are unchanged.
- Browser checks also reproduced a stale shared-list header after “See my
  wishlist”: the URL changed but the UI retained the old shared query. The
  wishlist now uses reactive Next search parameters under a Suspense boundary,
  with query-keyed content and a localized loading fallback. The same browser
  transition now reaches the personal list without a reload.
- Bulk clearing still requires the existing native confirmation. Cancel leaves
  IDs unchanged; accepted clearing is tested, and failed/rejected clears now
  produce feedback rather than an unhandled promise. Shared-list saving merges
  with existing favourites and never replaces the guest list with shared IDs.
- Wishlist introductory copy no longer assumes that every visitor is viewing a
  personal device-only list. Counts use Bengali digits in Bengali mode. Shared
  copy asks shoppers to check options/availability instead of implying every
  listed piece can immediately be bought.
- Wishlist Axe checks identified prohibited labels on generic color-swatch
  spans. Named swatch visuals now have an image role; their child dots remain
  decorative. Four new wishlist-main Axe scans pass without suppressions.
- Targeted regression: **48 files / 199 tests pass**, including wishlist,
  account-wishlist isolation/stability, catalog registry, product, cart and
  checkout tests. Some existing tests still emit React `act()` warnings.
  TypeScript, ESLint, production build and whitespace checks pass. The final
  wording adjustment was followed by a separate passing 13-test wishlist rerun
  and another passing six-test wishlist browser rerun.
- Combined browser regression: **37/37 pass** across seven refinement specs.
  Six new 320px tests cover English/Bengali pending/failed catalog recovery,
  retained IDs, partial availability, canceled/confirmed clearing, shared-save
  merging, shared-to-personal navigation and unlisted shared references. Four
  new main-content accessibility/overflow scans pass. Shared-list screenshots
  in both languages were reviewed.
- Browser catalog responses and guest lists are local fixtures; no database
  records were seeded or real orders placed. Cloud locking/failure behavior is
  covered by mocked regressions and existing account-provider tests, not real
  authenticated browser sessions. Real account synchronization, physical
  devices, manual screen readers and external/native share-sheet behavior
  remain unverified. No deployment was made, and this does not close the full
  audit backlog.

## Update — 20 October 2026 (gallery and zoom accessibility phase)

- Product zoom now uses the shared portal-based Drawer for focus trapping,
  background isolation, scroll locking, Escape handling and opener-focus
  restoration. Its former custom effect reran on every scale change and
  refocused Close; zoom controls now retain focus as the scale changes.
- Existing 1–4× zoom bounds and pointer/pinch/wheel maths are preserved.
  Keyboard +/− reads the current view without reinstalling the listener.
  Arrow keys pan a magnified view; Home and a labelled reset button return
  it to its original position/scale. Boundary zoom buttons are disabled.
- Gallery photo/video controls, badges, zoom instructions and controls now
  follow English/Bengali preference; the gallery counter and zoom percentage
  use Bengali digits in Bengali mode. Source-authored media descriptions
  remain unchanged. Zoom controls remain 44×44px and the header can wrap at
  narrow widths. Reduced-motion users receive effectively immediate image
  transforms, consistent with the app's existing reduced-motion CSS.
- Added three gallery component regressions covering focus retention and
  restoration, isolation, zoom bounds, keyboard pan/reset and Bengali labels.
  Existing image/video/Drive/YouTube facade and mouse magnifier tests remain
  passing. Escape tests now dispatch at document level, matching the shared
  modal's event handling rather than sending directly to `window`.
- Targeted regression: **46 files / 188 tests pass**, covering product, shared
  UI, cart, checkout and wishlist. Some existing tests still emit React
  `act()` warnings. TypeScript, ESLint, production build and whitespace checks
  pass. No production dependency, media source or purchase rule was changed.
- Combined browser run: **39/39 pass** = 37 existing storefront refinement
  checks plus **two isolated gallery-component browser checks**. The new
  English/Bengali 320px checks cover thumbnail selection, focus retention,
  repeated Tab containment, inert background, zoom bounds, keyboard pan and
  reset, reduced-motion duration, 44px controls, overflow, Escape and focus/
  scroll restoration. Two modal Axe scans pass. The Bengali zoom screenshot
  was reviewed for narrow layout and instruction/control visibility.
- `e2e/gallery-accessibility.spec.ts` bundles a test-only component fixture
  with the installed development esbuild dependency. It uses the real gallery,
  modal and application CSS, but replaces `next/image` and supplies two SVG
  test images. The fixture is not an application route or production asset.
  These checks do not verify a server-rendered product detail page, Next image
  optimization, real garment images, remote-video playback, physical pinch/
  multi-touch gestures, screen readers or production performance. No database
  records, real orders, authenticated flows or deployment were involved.

## Update — 20 October 2026 (checkout guidance and recovery phase)

- Checkout progress buttons now focus the destination section heading after
  scrolling, rather than leaving keyboard users on the progress rail. Step
  headings are programmatically focusable without adding normal Tab stops.
  Navigation does not enforce new completion gates or change field validation.
- Progress has a localized accessible name, Bengali step digits and an explicit
  44px minimum button height. The full-address placeholder now follows the
  selected language; requirements and the address validation floor are unchanged.
- Fieldless order failures now focus the actual alert banner. The existing
  banner-ref API is wired to the banner, not its non-focusable wrapper. Field
  failures keep their existing field priority and fix-fields path; network/
  service failures keep the existing same-order retry path.
- The area input describes its inline error via `aria-describedby`. The order
  form exposes busy state while submitting. Programmatic checkout scrolling
  respects reduced-motion preference. Submission guards, idempotency, draft
  state, order payloads, payment, pricing and delivery calculations are untouched.
- Added two presentational regressions for localized progress/current-step
  semantics, jump destinations and focusable headings. The existing network
  retry regression now verifies that failure focus reaches the alert before
  retrying. Targeted regression: **47 files / 190 tests pass** across product,
  shared UI, cart, checkout and wishlist. Some existing React `act()` warnings
  remain. TypeScript, ESLint, production build and whitespace checks pass.
- Combined browser regression: **41/41 pass** = 39 storefront checks plus the
  two previously documented isolated gallery checks. Two new English/Bengali
  320px checkout tests cover progress-heading focus, 44px progress controls,
  existing first-invalid-field focus, linked area errors, busy true/false,
  retained customer/address inputs after an intercepted 503, focused recovery
  and an explicit retry. No order request is sent for locally invalid input.
- New Axe checks cover the progress rail and error banner only, not the entire
  checkout. Both pass, as do narrow document-overflow checks. The English
  failure screenshot was reviewed for recovery visibility and layout.
- All order requests in the browser tests are intercepted and return a failure;
  no real order, payment or database write occurs. Existing unit tests cover
  mocked successful retries. Real backend placement, duplicate-order protection,
  payment settlement, authenticated checkout, physical devices and manual
  screen-reader behavior remain unverified. No deployment was made; this is a
  bounded checkout-guidance pass, not completion of the full audit backlog.

## Update — 20 October 2026 (final consolidation)

- Header bag/wishlist accessible labels and badge digits now follow the selected language. Loading, syncing and unresolved saved-bag labels avoid unverified zero-item announcements. Header scroll work cancels its pending animation frame on unmount.
- Shared links treat native `AbortError` as intentional cancellation: no clipboard write and no failure message. Actual failures can copy with truthful success feedback; blocked copying leaves a localized, accessible instruction and a real WhatsApp fallback. Product sharing also distinguishes cancellation from failure and uses 44px controls.
- Shared error recovery no longer promises that an interrupted order/bag is safe. Root and storefront 404 numbers use readable foreground contrast.
- Added EN/BN shared-control checks at 320px (and the real desktop breakpoint for the desktop wishlist link), simulated share/clipboard failure, scoped header/main Axe, touch size, overflow, and an explicit unknown-page HTTP-404/recovery scan.
- **Final verified set: 44/44 browser checks**, comprising **42 storefront checks + 2 isolated gallery checks**. The harness now uses an intercepted standalone HTML document to avoid pending Next-page language effects changing its locale.
- **Full unit/integration suite: 560 files / 3,803 tests passed**. After the final contrast/harness adjustments, **21 files / 93 focused regressions** also passed. Final lint, typecheck, production build and diff checks passed. Production-only dependency audit: zero vulnerabilities; full audit: 11 unresolved development-tooling findings, including critical severity.
- The broader default browser invocation was attempted, not assumed green: its eight populated-catalog legacy scenarios cannot run successfully without server-readable catalog data. The legacy PDP accessibility scan saw a 404, not a populated product. No legacy test was disabled or weakened to hide this limit.
- See [the completion ledger](ux-completion-2026-10-20.md) for exact failure investigation, reproducible verified-suite command, development-security findings and remaining credential/device/release work. Nothing here establishes deployed authenticated flows, payment correctness, real-order success or production performance.

## Update — 21 October 2026 (admin map report follow-up)

The admin-specific rescan and pending findings are recorded in
[`audit/admin-ux-rescan-2026-10-21.md`](audit/admin-ux-rescan-2026-10-21.md).
The exact user-reported page/screenshot is still needed; the notifications
route does not itself render the dispatch map in current source.

- Fixed initial rider-pin update (red/green unit regression), CDN-dependent
  map CSS, map stacking/clipping, tile/init error recovery and explicit retry,
  resize/unmount cleanup and 44px map zoom controls.
- **41 files / 236 targeted unit/component tests passed**; full repository
  suite was not rerun in this admin pass. Lint/typecheck/build passed.
- **2/2 new browser component harness checks passed** at 320px and 1280px,
  using real Leaflet with locally bundled CSS and intercepted synthetic tiles.
  They verify failed tiles do not leave broken images, retry restores tiles,
  existing pins render immediately, and the sticky notification control wins
  hit-testing while the map is scrolled underneath it.
- This harness is not the authenticated admin shell. No authorization bypass,
  production fixture route, real dispatch mutation or deployment was added.
  The earlier 44-check storefront/gallery result is a separate historical run;
  no new combined-suite total is claimed here.

## Update — 21 October 2026 (admin inbox/session follow-up)

- Admin header now describes the real session-probe state instead of always
  promising live data. Notifications distinguish checking, failure, empty and
  retained-notice states, including an initial fetch whose loading flag remains
  true after failure. Session errors retry the owning probe; inbox errors retry
  the existing inbox fetch. No authentication or API mutation rules changed.
- Header/inbox/shared error actions have 44px targets. Unread badge and bright
  rider-pin text contrast improved without changing marker status colors.
- **43 files / 248 targeted tests passed**. Full repository suite was not rerun.
  Lint, typecheck and production build passed.
- **5/5 combined admin harness browser checks passed**: real shell/inbox UI at
  320/390/1280px with synthetic auth/data/router/image adapters, plus the existing
  real-Leaflet map checks at 320/1280px. Header/main scoped Axe, touch dimensions,
  no horizontal overflow, retained filters/notices and explicit recovery checked.
  A 320px screenshot was reviewed. No authenticated live workflow, actual push
  notification, complete sidebar accessibility or physical-device claim is made.
- Current completion/remaining scope is appended to
  [the admin rescan report](audit/admin-ux-rescan-2026-10-21.md). These five checks
  are not added to historical storefront results to imply a new combined run.

## Update — 21 October 2026 (repository-wide code/regression scan)

- Final whole-repository suite: **563 files / 3,828 tests passed**, after shared
  staff-probe retry/cache fixes, non-overlapping polling, malformed rider-stats
  validation and the Vite 7.3.7 security patch. Intermediate runs are not the
  completion evidence. Two cadence tests now advance timers asynchronously;
  their original request-count assertions remain unchanged.
- **49/49 combined storefront/admin browser checks passed**, plus **5/5 separate
  dashboard contract checks** using the isolated test environment. Dashboard
  customer success wording was aligned to the current Bengali text; the rider
  scenario intentionally returns malformed optional stats to guard against the
  formerly reproduced whole-board crash. No assertions/scenarios were disabled.
- Embedded SQL scripts: dispatch **15 PASS groups**, rider money **35 PASS groups**.
  These are not the full two-session PostgreSQL workflow or deployed RLS tests.
- Final lint/typecheck/build/diff checks passed. Production dependency audit: zero;
  full audit: **11 unresolved development-tooling findings** (down from 12).
- Scope, fixes, reproducible commands and remaining critical-tooling/catalog/
  authenticated/device checks are in
  [the repository scan report](audit/repository-scan-2026-10-21.md).
  Production deployment and real payment/order/GPS acceptance remain unclaimed.

## Update — 21 October 2026 (controlled security toolchain recheck)

- Vitest **4.1.12**, compatible Vite **7.3.7**; no production package versions changed.
- Final new full suite: **563 files / 3,829 tests passed**. Constructable observer
  mocks, void setup hooks and deterministic image-decode error/cleanup checks
  address Vitest 4 migration failures without skipped tests or longer timeouts.
- Fresh browser runs: **5/5 dashboard** and **7/7 selected component checks**
  (3 inbox, 2 map, 2 bilingual gallery). This is not a new 49-check combined run.
- Lint/typecheck/build, clean install, dependency tree and embedded SQL checks
  passed. Full audit **11 → 8**, critical **2 → 0**; production audit **0**.
  Eight dev-only findings remain in Next ESLint glob and Capacitor uuid chains.
- [Security recheck report](audit/security-recheck-2026-10-21.md) records exact
  scope, evidence and remaining work. QA server stopped; normal preview restored.
  No deploy, real signed-in Supabase/payment/GPS or physical-device acceptance.

## Update — 21 October 2026 (delivery maps, money recovery, real SQL workflow)

- Full discovered Vitest suite: **567 files / 3,846 tests passed**. New red/green
  regressions cover checkout map init/tile/callback/geolocation recovery, tracker
  tile retry, media preview recovery, admin money races/loading and rider earnings
  session reset. Existing checkout Leaflet mock now supports events; account
  focus test waits for the effect without removing its focus assertion.
- **53/53 combined browser checks passed**, including four new real-Leaflet
  checkout/tracker cases at 320/1280px in English/Bengali. Separate dashboard
  contract suite **5/5 passed**. Configured SSR catalog acceptance remains untested.
- **Real PostgreSQL 17.10: 10 PASS groups**, including two-session offer/capacity
  races, own-shop order RLS, hardened RPC grants, delivery codes, COD ledger and
  settlement claims. Test fixture now mirrors Supabase default function privileges;
  production grants/migrations were not loosened. Auth service remains stubbed.
- Embedded SQL: dispatch **15**, money **35 PASS groups**. Lint/typecheck/build
  passed; production audit zero, full audit eight dev-tooling entries unresolved.
- After the full/browser runs, a final decorative video-overlay CSS click-through
  adjustment was checked with **9/9 editor/media tests** and another production
  build, not another full/browser run. No assertions/tests were skipped.
- [Implementation/release checklist](audit/resilience-update-2026-10-21.md) records
  remaining security, configured catalog, deployed auth/RLS/payment/GPS and device
  acceptance. Temporary database/QA server stopped; normal preview restored.

## Update — 21 October 2026 (dispatch/roster session recovery continuation)

- New dispatch/roster read regressions: **15/15 passed**; **24/24 targeted tests**
  include unchanged coverage/reason-dialog behavior. Latest-request/session guards,
  sign-out reset, settled loading state and dependency-aware Retry prevent stale
  responses and initial-error skeleton lockup. Board uses one roster snapshot;
  visible-tab delivery/roster polling remains 15/30 seconds.
- Final full suite after all code/test changes: **569 files / 3,861 tests passed**,
  exit 0. Intermediate runs were not completion evidence. Two page mocks moved
  their existing roster/settings fixtures to the updated hook contract.
- Fresh **7/7 dashboard browser checks passed**, adding initial deliveries-503
  and riders-503 recovery through explicit Retry on the real dispatch page.
  Fixtures do not prove real signed-in Supabase acceptance; unauthenticated
  denial checks still run without interception. Prior 53-check browser/SQL runs
  were not repeated or added to these fresh results.
- Lint/typecheck/build/diff passed, production audit zero. No dependency upgrade,
  auth/dispatch/money business-rule change or deployment. Normal preview restored.
- [Dispatch recovery report](audit/dispatch-recovery-2026-10-21.md) records evidence
  and limits, including remaining dev-tooling findings and deployed acceptance.

## 25 October 2026 — Native auth Web Locks acceptance

See [full evidence and reproduction](audit/browser-auth-native-lock-acceptance-2026-10-25.md).

- Actual Chromium **153.0.8010.0**, two same-origin tabs, native LockManager, repository auth-lane source. SDK work controlled; no real credentials.
- Five new `e2e/browser-auth-locks.spec.ts` contracts cover no-overlap, abandoned queued login, logout despite abandoned view, tab-close lock release and rejection recovery.
- Combined account/access, checkout, gallery, shared-control and lock regression: **16 PASS, 54.1 s**. Default-origin CI command locally: **5 PASS, 3.2 s**. New step added after Dashboards in CI; remote job not dispatched.
- Use default **localhost:3100** for these local dev-browser runs. The attempted 127.0.0.1 run had dev HMR handshake/hydration failures, not a verified auth regression; no production host/security config was weakened.
- Browser binary/libraries installed only in temporary/cache paths; no project dependency changes. Screenshots/reports stay under ignored `.cache` paths.
- Real Supabase session/cookie/multi-tab delivery and Android/iOS/native background/device acceptance are not certified by these fixture contracts.

## 25 October 2026 — Actual Supabase SDK cookie/event contracts

[SDK acceptance evidence](audit/browser-sdk-session-acceptance-2026-10-25.md): seven new `e2e/browser-auth-sdk.spec.ts` contracts bundle actual project browser-client/lane and installed SDK; only auth HTTP is fulfilled by fixtures. Native cookies, Web Locks and cross-tab broadcasts are real Chromium behavior. Verified persistence/fresh tab restore, sign-in/out, refresh, queued logout, refused credentials, password update and local logout even on remote error. Combined **23 PASS, 43.2 s**; CI command locally **12 PASS, 6.7 s**. Existing CI browser auth step includes both specs; no remote CI dispatch. No runtime/dependency changes, real accounts or staging/device/revocation clearance implied.

## 25 October 2026 — Complete configured browser regression

[Full regression evidence](audit/full-browser-regression-2026-10-25.md): **94 default + 7 dashboard browser tests PASS** (9.6 min / 21.3 s), no skips. Fresh full types, targeted test/config lint, YAML/diff checks pass; full audit zero. CI now runs `npm run test:dashboards` then `npm run test:e2e`, including both native auth specs without duplication. GitHub Actions not dispatched.

**Managed-server requirement:** stop the normal preview occupying port 3100 before either command. Both configs use explicit `https://verification.invalid` / `verification-only` public env and empty service-role key, and no longer silently reuse a differently configured preview. Use `E2E_BASE_URL` only with an explicitly prepared fixture server; API interception does not change baked-in public env or seed SSR catalog props. The normal Arena preview was restored afterward without fixture env.

The expanded run exposed legacy seeded-catalog/retired-section/checkout-locator assumptions and a false PDP Axe pass on a 404. Browser-only catalog fixtures and current accessible locators now drive purchase checks. Non-empty shop filtering/guest wishlist persistence uses an explicitly named real ShopBrowser component fixture (router/link/image boundaries adapted), not a production test route. Real-route Axe scans assert HTTP 200, and a separate unseeded product URL check asserts its actual 404. Populated SSR PDP/redirect/a11y still needs seeded staging acceptance; no production inventory or rules were changed to pass tests. Intermediate failures and their traces are described in the report, not hidden.
