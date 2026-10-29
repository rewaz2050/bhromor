# Full configured browser regression — 25 October 2026

## Why this follow-up

The preceding batch passed 23 selected browser contracts, not the whole configured Playwright suite. This batch expands local acceptance to every default spec plus the separately configured dashboard suite. Application runtime source, financial/auth/eligibility logic and project dependencies are unchanged.

## Verified setup and test defects

### 1. Silent reuse of an unconfigured preview

The first expanded attempt reused the normal localhost:3100 preview, which had no Supabase env configuration. Admin recovery traces displayed the actual **backend not configured** screen instead of fixture-backed data views. That attempt was explicitly stopped, not claimed successful.

The default managed test server now uses the same explicit `https://verification.invalid` / `verification-only` public configuration as the existing dashboard test server, with an empty service-role key. Both configs reject silent reuse of an existing preview. A server's public env is compiled into its client bundles; Playwright cannot retrofit it merely by intercepting API calls.

For managed runs, stop the normal preview on port 3100 first. `E2E_BASE_URL` remains an explicit opt-in for an externally prepared server with the fixture configuration. These are **local fixture tests, not safe substitutes for authenticated staging acceptance**. No real configuration/secret file was added.

### 2. Legacy storefront assumptions

With the correct environment, the initial complete run finished **85 PASS / 8 FAIL (10.2 min)**. All eight failures were in the older storefront spec:

- It expected seeded catalog rows from an unavailable server.
- It searched for the retired `Featured.` section.
- Its old checkout locators expected direct para chips, an always-visible house field and an amount-free submit label.
- A nominal product-page Axe scan passed on a **404 page**, without checking HTTP status. This was false coverage, not proof of PDP accessibility.

Corrections preserve meaningful assertions without manufacturing production inventory or changing UI to satisfy obsolete tests:

- Browser-only catalog/zone responses serve the real homepage, drawer and checkout interactions; order POSTs are intercepted even though the successful purchase path does not submit.
- The touch-context quick-add test starts from the actual homepage's explicit whole-shelf card, avoiding duplicate merchandising-rail controls. It still checks selected size/quantity, bag, checkout inputs, overflow and whole-page/dialog Axe results.
- Non-empty shop filtering/wishlist persistence runs in an explicitly named **ShopBrowser component fixture**, with real ShopBrowser, catalog hydration, guest wishlist store and CartProvider. Only Next navigation/link/image boundaries are adapted. Reload persistence and empty-result→clear→full-count assertions remain. This is not SSR, routing or real-backend acceptance.
- Responsive real-route screenshots cover home, shop and delivery at 320/390/768/1024/1440 px. Reduced motion checks use the actual whole shelf.
- Real-route accessibility scans require HTTP **200**. Delivery replaces the invalid seeded-product assumption; an additional explicit assertion verifies the unseeded legacy product URL returns **404**, not a fabricated product. **Actual populated SSR PDP rendering/redirect/a11y acceptance remains a seeded-environment gate**, not silently declared covered.

Focused development runs exposed fixture-construction/locator mistakes (required ShopBrowser initial props, multiple rail controls, retired para chip locator). Typecheck and actual browser traces drove the corrections. Their failures are not application regressions; final results below are from the final files.

## Final evidence

**101 browser contracts passed across the two configured suites; no skips or retry-to-pass result.** Both completed from the final test sources. This does not expand fixture evidence into real-backend/device certification.

| Check | Result |
| --- | --- |
| Entire default Playwright suite | **94 PASS / 9.6 min**, exit 0 |
| Separate dashboard suite | **7 PASS / 21.3 s**, exit 0 |
| Focused final touch purchase flow | **1 PASS / 21.1 s** |
| Focused non-empty ShopBrowser wishlist/filter fixture | **1 PASS / 9.5 s** (preceding focused run) |
| Full TypeScript check on final test sources | PASS |
| Targeted ESLint: configs/spec/component fixture | PASS |
| CI YAML and ordered dashboard/full-suite wiring | PASS |
| Fresh full dependency audit | **0 vulnerabilities** |
| `git diff --check` | PASS |
| Normal preview restored | Running on **0.0.0.0:3100**, ordinary env, HTTP 200 |

Prior full **602 files / 4,499** unit results, build and money SQL groups remain historical. No new full-unit/build/money run is claimed for this test-infrastructure-only batch.

## CI and repeatability

The browser CI job now runs:

```bash
npm run test:dashboards
npm run test:e2e
```

The second command includes native auth-lock and actual SDK specs, so the earlier subset-only step is replaced rather than duplicated. Both commands use their own fresh managed dev server and retain the existing single Chromium worker, timeouts and failure-report artifact handling. GitHub Actions was **not dispatched**; these exact scripts were executed locally with the external cached Chromium executable/libraries:

```bash
LD_LIBRARY_PATH=/home/user/.cache/bhromor-browser/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:dashboards

LD_LIBRARY_PATH=/home/user/.cache/bhromor-browser/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:e2e
```

The CI browser-install step supplies Chromium normally. Sandbox cache paths are not repository dependencies. Images, traces and reports remain under ignored `.cache/playwright-*`, not Git.

Expected negative-path/fixture noise includes unavailable `.invalid` catalog server reads, deliberately failed API requests, dev CSP eval diagnostics and image-loading hints. No security header or server auth guard was weakened to suppress them. Browser pass is not a production-performance or blanket WCAG certification.

## Remaining real-environment gates

1. **Configured staging:** use an approved staging dataset and account roles, not production customer/order records. Supply secrets through the environment/platform, never chat or repository files. No actual account was created/modified here.
2. **Real Supabase:** verify login, cookie/middleware behavior, session switching and refresh-token rotation/revocation against the real server. Local cookie removal is not proof of remote revocation; access-token expiry/revocation follows the server's policy, not an assumed instantaneous JWT invalidation.
3. **Authorization:** verify approved/unapproved actor eligibility, role probes and RLS using the project's intended permissions. Browser fixtures cannot certify DB authorization or money movement.
4. **Populated SSR catalog:** verify actual product canonical redirects, stock/price display and full PDP accessibility against seeded live-shaped rows. Browser catalog interception cannot seed SSR props.
5. **Physical/native:** Android/iOS/WebView, background location, camera, push, permission-denial recovery and device accessibility require device/build infrastructure. This sandbox has an Android project, but `java`/`adb` were not found on PATH and no configured `ANDROID_HOME` directory was detected. No native build or device certification is claimed.

No new production bug is invented from missing infrastructure. No commit/push/merge/deploy.

## Related evidence

- [Real SDK session contracts](browser-sdk-session-acceptance-2026-10-25.md)
- [Native lock contracts](browser-auth-native-lock-acceptance-2026-10-25.md)
- [Build consolidation](final-build-consolidation-2026-10-22.md)

Workspace-only logs: `/home/user/full-browser-{regression,configured,storefront,storefront-focused,storefront-focused-final,purchase-final,dashboards-final,regression-final,types-final,lint,audit}.log`.
