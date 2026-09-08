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

For an existing preview:
```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

An environment with a separately installed Chromium may set `CHROMIUM_EXECUTABLE_PATH`. The configuration otherwise uses Playwright's standard browser. HTML report, screenshots and failure traces are under `.cache/playwright-*` and intentionally excluded from Git.

## Limits
- Automated accessibility checks do not establish complete WCAG conformance or replace screen-reader/manual usability testing.
- Chromium responsive/touch emulation is not physical iOS Safari or Android-device testing. Firefox, WebKit, real devices and slow-network testing remain unverified.
- This suite does not send OTP emails, test deployed Supabase RLS, submit orders, charge payments, or verify production social/review/sales sources. See `customer-accounts.md` for required backend checks.
- Screenshots are inspection artifacts, not stored visual-diff baselines; future pixel changes are not automatically compared to a golden image.
