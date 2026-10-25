# Android/native readiness — 25 October 2026

## Decision and scope

The user selected **Android device/emulator acceptance** after the complete local browser regression. This batch checks what can actually run in this sandbox, fixes a reproduced native-build configuration defect and prepares an executable device handoff. It does **not** certify a native build, physical GPS, background service, camera or push delivery.

## Reproduced and fixed: blank workflow URL

`Android APK` has an optional `site_url` input, documented as **blank = production**. Its sync step passes `MOBILE_SITE_URL: ${{ inputs.site_url }}`. The previous config used nullish fallback (`??`), which preserves an empty string. `new URL("")` consequently throws before sync.

Actual pre-fix command:

```bash
MOBILE_SITE_URL='' npx cap sync android
```

Result: **exit 1**, `Parsing capacitor.config.ts failed` / `TypeError: Invalid URL`.

The minimal fix treats omitted, empty and whitespace-only overrides alike, and trims a nonblank override. The documented default remains `https://bhromor-zeta.vercel.app`; the app ID, HTTPS/cleartext policy, allowNavigation hostname, offline path and legacy GPS bridge are unchanged. Malformed nonblank overrides still fail rather than silently targeting production. No authentication, pricing, eligibility or GPS timing rule changed.

Seven new tests in `src/lib/__tests__/capacitor-config.test.ts` cover these cases and fixed shell policies.

## Fresh execution evidence

| Check | Result |
| --- | --- |
| Pre-fix blank-input CLI | Reproduced failure, exit 1 |
| Post-fix blank-input actual Capacitor sync | **PASS** |
| Padded preview override actual sync | **PASS**; generated URL trimmed to `https://native-acceptance.invalid` |
| Generated JSON config assertions | **PASS**; URL/host/cleartext/legacy bridge/app ID |
| Actual GPS plugin discovery | **PASS**; `@capgo/background-geolocation@8.4.11` |
| Copied offline `index.html` equals source | **PASS** |
| Focused config/toolchain/native location/rider location/health/throttle tests | **6 files / 66 PASS, 4.80 s** |
| Full TypeScript check | PASS |
| Targeted config/new-test ESLint | PASS |
| Diff check | PASS; no tracked Android project diff |
| Dependency audit | **0 vulnerabilities** |
| APK build | **BLOCKED**, not compiled |
| Device/emulator acceptance | **BLOCKED**, no connected runtime |

The 66 tests include real config imports and installed toolchain dependency checks, but the native GPS adapter/hook unit tests use controlled platform/plugin callbacks. They are not sensor/device tests. React `act(...)` diagnostics appeared in the existing rider-location test output; assertions passed, but this is not described as warning-free output.

Sync was finally restored to the documented default URL, not the reserved preview fixture URL. Generated native JSON/assets are gitignored and no tracked Android project diff was produced. Sync only writes local project assets; it does not deploy, log into or mutate the target website.

The previous **94 default + 7 dashboard browser PASS** and **602 files / 4,499** unit/build/money baseline are historical, not rerun or relabeled fresh in this native-only batch. The seven new config tests do not imply a fresh full-unit total.

Normal web preview remains available on **3100**, `/rider/login` HTTP **200**. No fixture environment was applied to that server.

## Actual build blocker

Executed in `android/`:

```bash
./gradlew assembleDebug --no-daemon --stacktrace
```

Actual result, **exit 1 before compilation**:

```text
ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
```

`java`, `adb` and `sdkmanager` were not found on PATH. No configured `ANDROID_HOME` directory, `/dev/kvm` or `/dev/bus/usb` was found. This is an unavailable build/device environment, **not** evidence that the Java source or Gradle build is defective. Required Gradle/Google/Maven toolchain download access is also unavailable in this sandbox's network environment; no unsupported download or bypass was attempted.

Source requirements, not executed build proof:

- Capacitor Android 8.5.3 declares Java source/target **21**.
- App compile/target SDK **36**, minimum **24**.
- Wrapper **Gradle 8.14.3**, Android Gradle plugin **8.13.0**.
- Existing cloud workflow already provisions Temurin **21** and runs `cap sync` before `assembleDebug`.
- Manifest declares location/background/foreground-service-location, notification, network and wake-lock permissions. This is not merged-manifest, runtime-permission or foreground-service acceptance.

## Build on an equipped Android host

Use an approved **staging HTTPS URL** and test accounts/dataset for operational acceptance. Do not paste passwords, tokens, precise rider traces or keystore material into chat, logs or the repository. Do not test real money/order mutations without separately approved scope.

Prerequisites: Node 22, JDK 21, licensed Android SDK/platform 36 and compatible build tools, working Gradle/Google/Maven dependency access, Android platform-tools and a device or emulator. Normal debug builds require no release keystore.

```bash
npm ci
# Replace with the approved HTTPS staging deployment; do not use a fixture URL.
MOBILE_SITE_URL=https://YOUR-STAGING-HOST npx cap sync android
cd android
./gradlew assembleDebug --no-daemon --stacktrace
adb devices -l
# Choose an authorized device explicitly; do not uninstall/clear user data.
adb -s DEVICE_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
adb -s DEVICE_SERIAL shell am start -n store.prosanti.rider/.MainActivity
```

Check generated `android/app/src/main/assets/capacitor.config.json` before building: it must name the intended staging URL, with `cleartext: false` and `useLegacyBridge: true`. App ID is `store.prosanti.rider`. Do not blindly install over a rider's production app/session; use an authorized test device. `install -r` is not approval to replace a production installation.

Alternatively, the existing **Android APK** Actions workflow can build a debug artifact after the current working branch is explicitly authorized for publishing. **No commit, push, workflow dispatch or artifact build was performed here**. A workflow run against old remote sources would not verify this dirty checkout. Debug APK creation is not deployment or device acceptance, and is not a signed Play Store release.

## Device acceptance record — still unexecuted

Record APK/source revision, target URL, device model, Android/WebView versions and test actor role. For each row, collect sanitized observations rather than assuming manifest declarations prove success.

| Gate | Procedure / pass evidence | Status |
| --- | --- | --- |
| Launch/bridge | Open staging app; verify correct URL and native BackgroundGeolocation bridge/plugin, not a browser fallback mistaken for native | NOT RUN |
| Session | Use authorized rider credentials in app UI; relaunch, log out and switch accounts; server role checks remain authoritative | NOT RUN |
| Permission denial | Deny location/notification permissions; honest UI/recovery, no false background-tracking confirmation | NOT RUN |
| Permission grant | Follow the OS foreground/background permission/settings flow, then go online; verify service notification and server-received fresh location | NOT RUN |
| Screen off/background | With consent, test safe physical movement exceeding the configured distance filter; observe server timestamps/positions beyond five minutes while screen is locked. Never operate the phone while riding/driving | NOT RUN |
| Offline/online stop | Go offline and log out; verify watcher/service cleanup and no continued actor-scoped updates; reconnect without stale-account writes | NOT RUN |
| GPS/network interruption | Disable/re-enable location/network; verify stale/error indicators, retained state and recovery without duplicate trackers | NOT RUN |
| Camera/file capture | Approved test parcel/photo only; accept/cancel/deny capture and verify recovery, no production proof upload | NOT RUN |
| Process/device lifecycle | Background, process termination and restart; verify actual OS behavior and truthful UI, not an assumed force-stop restart guarantee | NOT RUN |
| Accessibility | Physical TalkBack, font scaling and keyboard/system navigation on target WebView | NOT RUN |
| Notification support | Tracking foreground notification is separate from order push. Current shell uses no native FCM push plugin; verify honest Web Push unsupported messaging/Chrome alternative, not invented native push delivery | NOT RUN |

Current native push is a documented platform/integration gap, not solved by declaring `POST_NOTIFICATIONS`. A native FCM delivery implementation needs an explicitly scoped Firebase project/token/server integration; none was added or assumed here.

## Files and logs

Changed: `capacitor.config.ts`, seven new config tests, native docs/report. Existing unrelated work preserved.

Workspace logs: `/home/user/native-{empty-url-before,sync-default,sync-preview,sync-default-final,build-attempt,focused-tests,lint,types,audit}.log`.

Related: [Android setup](../android-app.md), [full browser regression](full-browser-regression-2026-10-25.md).

## Subsequent authorized cloud-build attempt

The user subsequently authorized current-branch publishing and debug APK build with the existing target URL. Implementation commit **d94f656** was pushed only to `arena/bcb37d54-bhromor`; fresh full lint/types passed. The Actions dispatch request returned **403 Resource not accessible by integration**; the branch's dispatch-run query returned zero. **No APK build/artifact or device PASS**. Connection Actions permission repair or manual branch-selected workflow execution is required. See [cloud attempt evidence](android-cloud-build-attempt-2026-10-25.md) for exact scope, commands and safe manual instructions. No merge/deployment/production account/order/payment action was performed.
