# Real browser SDK session acceptance — 25 October 2026

## Scope

This follow-up narrows the prior **SDK cookie/event integration** gap without using real accounts. Tests run in actual Chromium with the installed **@supabase/ssr 0.12.7 / supabase-js & auth-js 2.116.0 SDK**, the repository's unchanged `getSupabaseBrowser` configuration and shared auth lane. HTTP auth responses are intercepted fixtures on the reserved host `https://sdk-acceptance.invalid`.

This is real SDK/browser integration with a synthetic auth backend, **not** real Supabase server, JWT-signature verification, account authorization, remote revocation or production/staging acceptance. Fixture passwords, anon marker and token strings are explicitly artificial; no real secret/account was requested or used.

## Seven permanent contracts

`e2e/browser-auth-sdk.spec.ts`:

1. SDK login writes the SSR session cookies; a newly opened tab restores the session from shared cookies.
2. Already-open tabs receive the actual SDK `SIGNED_IN` / `SIGNED_OUT` broadcasts; successful fixture logout clears cookies and the other tab's session.
3. Explicit SDK refresh updates the cookie session and broadcasts `TOKEN_REFRESHED` to the other tab.
4. With a real SDK login response held pending in one tab, the other tab's queued logout waits on the native Web Lock. After login settles, logout dispatches and removes the session. Endpoint call order is asserted, not inferred from elapsed time.
5. SDK credential refusal returns an auth error and creates no session cookies. The lane's `accepted` field means the operation is current/executed, **not** that credentials or rider eligibility were accepted.
6. Real SDK `updateUser({password})` uses the lane and broadcasts `USER_UPDATED`; no actual password is changed outside fixtures.
7. A controlled remote logout failure still clears the SDK's local session/cookies and emits `SIGNED_OUT`, while returning the remote error. **Local signed-out state is not a remote revocation certificate.**

The seventh fixture initially expected the SDK to preserve local cookies on remote failure. Execution contradicted that assumption. Inspection of installed GoTrueClient `_signOut` confirmed explicit local-session removal on non-ignored errors. The test was corrected to preserve the observed SDK behavior, not an application change or a fabricated production bug. Initial expanded run: six passed, one failed assertion; corrected final evidence is below.

## Harness and isolation

- The test bundles the actual project browser client/auth-lane and installed SDK, using the esbuild already installed by the direct Vite dev toolchain. It does not copy the SDK implementation, fetch a browser SDK from a CDN, add a runtime package or deploy a test route.
- Build-time fixture env definitions are only in the in-memory harness bundle. Application environment/config files and credentials are untouched.
- Playwright fulfills same-origin harness HTML and all fixture auth requests, including CORS preflight. Unexpected auth endpoints fail the fixture rather than silently reaching a real backend.
- Separate browser tabs/contexts use native cookie storage, BroadcastChannel behavior and Web Locks. LockManager, SDK methods and cookie helpers are not replaced with mocks.
- The synthetic JWT-shaped values are not valid signed Supabase tokens and are never treated as proof a server would authorize anything.

## Verification

| Check | Result |
| --- | --- |
| Initial five SDK contracts | **5 PASS, 3.7 s** |
| Final combined SDK/lock/account/checkout/gallery/shared-control suite | **23 PASS, 43.2 s**, exit 0 |
| CI browser-auth command locally | **12 PASS, 6.7 s**, exit 0 |
| New spec ESLint | PASS |
| Full TypeScript check | PASS |
| CI YAML / diff check | PASS |
| Full dependency audit | **0 vulnerabilities** |
| Preview 3100 | Running; `/rider/login` **HTTP 200** |

Only tests, workflow wiring and documentation change in this batch. Application runtime source/dependencies are unchanged. Prior **602 files / 4,499** unit-suite, production build and 35 money SQL groups remain historical evidence, not claimed freshly rerun here.

## CI and reproduction

The existing browser job now runs both auth contract specs after dashboards:

```bash
npx playwright test e2e/browser-auth-locks.spec.ts e2e/browser-auth-sdk.spec.ts
```

The job already installs Chromium. No seeded database or authentication secrets required. GitHub Actions was not dispatched from this session.

On this prepared sandbox, the browser/libraries are external cache artifacts from the previous acceptance batch:

```bash
LD_LIBRARY_PATH=/home/user/.cache/bhromor-browser/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
E2E_BASE_URL=http://localhost:3100 \
npx playwright test e2e/browser-auth-sdk.spec.ts e2e/browser-auth-locks.spec.ts \
  e2e/account-access.spec.ts e2e/shared-controls.spec.ts \
  e2e/checkout-guidance.spec.ts e2e/gallery-accessibility.spec.ts
```

## What still requires a real environment

- Supabase server acceptance of real credentials, session switching, refresh-token rotation/revocation, JWT validation and deployed cookie/middleware behavior.
- Actual rider/vendor/staff eligibility/approval/RLS and cross-device financial/payment/dispatch acceptance.
- Browser engines without Web Locks, Android WebView/native builds, background location, camera, push and physical permissions.
- Browser/tab crash is not cancellation or rollback of remote requests already dispatched. The fixture tests do not change queue timeout/fallback policies.

No new runtime feature/defect is inferred merely from a missing real environment. No commit, push, merge or deployment.

## Evidence

Workspace-only `/home/user/sdk-browser-{initial,final,lint,types,regression-final,ci-command,audit}.log`. Screenshots/traces use ignored `.cache/playwright-*` paths.

Earlier: [native lock acceptance](browser-auth-native-lock-acceptance-2026-10-25.md), [browser coordination](browser-auth-coordination-2026-10-25.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Subsequent complete browser regression

[Full configured-suite evidence](full-browser-regression-2026-10-25.md): **94 default + 7 dashboard PASS**. The entire default suite (including these SDK contracts) replaces the subset-only CI step. Managed servers now explicitly use the invalid-host fixture environment and reject silent preview reuse. Legacy storefront fixture/locator/false-404 accessibility coverage was corrected without runtime changes. Real SDK/server/RLS/native-device gates remain distinct.
