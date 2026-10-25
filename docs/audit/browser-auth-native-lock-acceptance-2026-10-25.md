# Native browser auth-lock acceptance — 25 October 2026

## What was executed

Actual **Chromium 153.0.8010.0**, Playwright, two independent tabs in one browser context, native `navigator.locks`. The tests execute the repository's current `src/lib/rider-auth-lane.ts`, transpiled with the existing TypeScript dependency and injected into same-origin fixture documents. **LockManager is not mocked.** SDK operations remain controlled functions: no real account, token, password change or authentication endpoint is exercised by these lock fixtures.

`e2e/browser-auth-locks.spec.ts` adds five permanent browser contracts:

1. Two tabs cannot overlap their participating SDK functions while the native lock is held. The test observes the real browser's pending lock queue before asserting no second dispatch; no timing-only sleep assertion.
2. An abandoned queued login acquires then skips SDK dispatch.
3. Explicit queued logout still dispatches after its originating view is marked abandoned.
4. Closing the holding tab releases the browser lock and allows the waiting tab to proceed. This is **not** cancellation of HTTP already dispatched by the closed tab.
5. Controlled SDK rejection releases the native lock and does not poison the local queue.

Same-origin documents are fulfilled by Playwright request interception; no test-only production route, global SDK mock endpoint or application code is added. The fixture tests the lane and browser primitive, not a fully authenticated product flow.

## Results

| Check | Observed result |
| --- | --- |
| Initial native lock-only suite | **5 PASS, 2.6 s** |
| Combined lock/account contracts | **9 PASS, 16.7 s** |
| Final browser regression | **16 PASS, 54.1 s**, exit 0 |
| CI step command locally (default localhost origin) | **5 PASS, 3.2 s** |
| CI YAML syntax/step validation | PASS |
| New spec targeted ESLint | PASS |
| Full TypeScript check | PASS |
| `git diff --check` | PASS |
| Fresh full dependency audit | **0 vulnerabilities** |
| Preview | Running on **3100** |

Final run files: `account-access.spec.ts`, `browser-auth-locks.spec.ts`, `checkout-guidance.spec.ts`, `gallery-accessibility.spec.ts`, `shared-controls.spec.ts`.

Existing contracts additionally cover 320px English/Bangla customer access, guest rider/vendor validation without credential submission, password show/hide, failure recovery, checkout navigation/form retention, gallery/modal/zoom keyboard focus, localized counters/share recovery and honest 404 behavior. Their configured axe checks pass in those exercised states. Not a site-wide WCAG or manual assistive-technology certificate. Existing screenshots are captured under ignored `.cache/playwright-results`; no new manual visual-review claim.

**No application runtime source or project dependency changed in this batch.** The prior final application suite **602 files / 4,499 PASS**, build and money SQL 35 PASS groups are historical baseline evidence from the browser-coordination report; they were not rerun or relabeled as fresh results here. This batch's additions are browser tests, CI wiring and documentation.

## Environment setup and investigated failures

The sandbox initially had no browser. A temporary `@sparticuz/chromium@153.0.0` package was installed under `/home/user/.cache/bhromor-browser`, outside the repository. The binary and bundled AL2023 NSS/NSPR libraries were extracted into temporary/cache paths. Initial launch reported missing `libnspr4.so`; adding the bundled library path resolved launch. No browser runtime package was added to `package.json` or the project lockfile. These cache/binary files are not Git deliverables and may need recreation in a fresh sandbox.

Playwright's ordinary headless launch was used; **no disable-web-security/single-process flags** from the serverless package were applied. Repository execution supports the standard Playwright Chromium install as usual.

The new spec initially used `import.meta.url`; Playwright's CommonJS transform rejected that. The fixture now resolves its source from the repository working directory, matching existing configuration conventions.

An initial account run using `http://127.0.0.1:3100` produced **four failures**: dev HMR WebSocket handshake errors prevented normal hydration and rider/vendor probes. Browser diagnosis showed no completed login form, not verified auth/business malfunction. Using the repository-configured default **`http://localhost:3100`** on the same server restored HMR/hydration and the contracts passed. No app security/host configuration was weakened or production code changed to hide the failure.

## CI and reproduction

The existing browser job in `.github/workflows/ci.yml` now runs the native auth-lock spec after the dashboard suite. It already installs Chromium/system libraries. No secrets, new job credentials or seeded database required. **GitHub CI itself was not dispatched or claimed passing.**

Standard configured machine:

```bash
npm ci
npx playwright install --with-deps chromium
npx playwright test e2e/browser-auth-locks.spec.ts
```

With an existing sandbox preview/browser:

```bash
LD_LIBRARY_PATH=/home/user/.cache/bhromor-browser/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
E2E_BASE_URL=http://localhost:3100 \
npx playwright test e2e/browser-auth-locks.spec.ts e2e/account-access.spec.ts \
  e2e/shared-controls.spec.ts e2e/checkout-guidance.spec.ts e2e/gallery-accessibility.spec.ts
```

## Remaining operational acceptance

- **Native Web Lock two-tab behavior is now locally exercised, not only a unit adapter contract.** This narrows the corresponding earlier limit.
- Real Supabase session switching, SDK broadcast/cookie delivery, remote logout/revocation and deployed server/RLS/approval still require configured authenticated staging accounts. No real credentials were requested or fabricated.
- Actual Android/iOS builds, WebView feature availability, background GPS, permissions, camera, push, payment and cross-device financial acceptance remain untested here.
- Browsers lacking Web Locks still use local queue fallback; one Chromium run does not certify those other browser engines or remove that limitation.
- Browser crash/tab-close lock release is not server rollback or a cross-device transaction protocol.
- No commit, push, merge or deploy.

## Evidence logs

Workspace-only `/home/user/browser-acceptance-{locks,account,final,regression,lint,types,audit}.log`. The failing first account log is retained separately from the final passing run.

Earlier implementation/limits: [browser auth coordination](browser-auth-coordination-2026-10-25.md), [S01 closure](development-security-closure-2026-10-25.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Subsequent real SDK browser integration

[SDK session acceptance](browser-sdk-session-acceptance-2026-10-25.md) now executes installed Supabase SSR/browser SDK with actual cookies and cross-tab event delivery, using synthetic auth HTTP responses. Seven new contracts include persistence, sign-in/out broadcasts, refresh, real SDK queued logout, credential refusal, password update and the observed local-cookie clearing on remote logout failure. Combined **23 browser PASS / 43.2 s**, local CI command **12 PASS / 6.7 s**; types/lint/YAML/diff pass and full audit zero. This narrows the SDK-integration fixture gap, not real Supabase server/revocation/RLS/device certification.
