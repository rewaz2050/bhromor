# S01 development dependency closure — 25 October 2026

## Outcome and scope

This batch addresses the previously open **development dependency findings**. It does not silently declare cross-tab authentication coordination or physical staging/device acceptance complete.

Fresh audit before changes: **4 entries: 1 high, 3 moderate**, production audit zero. Earlier reports' eight entries are historical snapshots, not the observed count for this run. Package entries are not independent proven exploits.

Changes are limited to manifests/lockfile, a toolchain compatibility test and documentation. Application routes, business/financial/auth policies and native platform files are unchanged.

## Remediation

1. Compatible transitive update **zod 4.5.4 → 4.6.7** under the existing dependency range. Clears the reported oversized constrained-collection memory-exhaustion advisory, `GHSA-mrhx-c7xc-m3w5` (affected `<4.6.6`). No new direct application dependency.
2. Explicit scoped override **`xcode → uuid: 11.1.1`**. Installed Capacitor CLI **8.5.3** (also current registry latest during inspection) requires xcode `^3.0.1`; xcode 3.0.1 requires uuid `^7.0.3`. `npm audit` suggested a backwards Capacitor migration; that was not used. Upstream xcode 4 removes uuid, but forcing that unvalidated major tool migration was not used either.

### Why this override is intentionally narrow

This is an out-of-range transitive major override, **not** an ordinary upstream-compatible patch. It is recorded rather than hidden behind `npm audit fix --force`.

Source inspection of installed `xcode/lib/pbxProject.js` shows its uuid use is CommonJS `require('uuid').v4()`, followed by removing hyphens, truncating to 24 uppercase characters and checking uniqueness. uuid 11.1.1 retains the CommonJS require export and v4 contract. Later ESM-only uuid migration was deliberately avoided.

The advisory `GHSA-w5hq-g745-h8pq` reports missing buffer bounds checks in older v3/v5/v6 APIs. This is not proof xcode's v4-only usage was an exploitable application path. Replacing the dependency removes the reported vulnerable package from the installed tooling tree without claiming a deployed exploit was present.

**Removal plan:** when Capacitor adopts a patched supported xcode/uuid chain, remove this override, clean-install, rerun the compatibility tests/CLI checks and full verification. Future native/CI updates must keep these tests; do not broaden the override to all uuid consumers or update blindly to an ESM-only release.

## Permanent compatibility evidence

`src/lib/__tests__/capacitor-toolchain.test.ts`: **three new tests**, resolving xcode from the actual installed Capacitor CLI dependency path:

- Patched uuid version and CommonJS v4 import.
- 128 generated unique 24-character uppercase hexadecimal xcode project IDs.
- Actual xcode project parser → generated group addition → writer → reparse, retaining the new group's ID/name.

The first synthetic project fixture lacked the parser's required trailing newline and section markers; fixture corrected before final passing evidence. Those initial failures are not claimed as defects in either dependency version.

`npm ci --ignore-scripts` was rerun successfully. After reinstall, tests pass and `npx cap --version` remains **8.5.3**. `npx cap ls android` successfully reads configuration and discovers **@capgo/background-geolocation 8.4.11**. This is CLI/config/parser acceptance, not Android/iOS build or device certification.

Lockfile inventory against the start-of-turn copy changed only two installed package versions: uuid and zod. Next **16.4.2**, React **19.2.8**, Capacitor **8.5.3** and plugin versions are retained.

## Verification

| Check | Result |
| --- | --- |
| Clean reproducible install | PASS, `npm ci --ignore-scripts` |
| Toolchain compatibility | **1 file / 3 tests PASS**, after clean install |
| Capacitor CLI / Android plugin discovery | PASS, **8.5.3 / background-geolocation 8.4.11** |
| Full application suite | **601 files / 4,488 tests PASS, 585.56 s**, exit 0 |
| Full lint / TypeScript / production build | **PASS**, Next **16.4.2** |
| Full dependency audit (including dev) | **0 vulnerabilities**, exit 0 |
| Production audit | **0 vulnerabilities**, exit 0 |
| Existing money SQL regression | **35 PASS groups**, exit 0 |
| `git diff --check` | **PASS** |
| Preview 3100 | Existing server retained; `/rider/login` **HTTP 200** |

## Remaining work, separated honestly

- **S01:** **closed for the current installed dependency tree: final full audit confirms zero**. This is time-specific advisory evidence, not permanent freedom from vulnerabilities.
- **Auth implementation outside participating rider calls:** customer/vendor/staff/recovery SDK consumers and a cross-tab mutation mutex are not implemented by this dependency batch. The O43 same-client rider queue and SDK-event reconciliation remain as documented. These are distinct code/protocol scope, not falsely reclassified as device-only checks.
- **Operational gates:** configured authenticated staging, real cookie revocation/multi-tab account changes, RLS/payment/concurrency, Android background GPS/camera/push and native builds still require actual environments/devices. No certification is invented.
- No commit, push, merge or deployment performed.

## Logs

Workspace: `/home/user/remaining-{audit-before,audit-after,audit-final}.json`, `remaining-update.log`, `remaining-override-install.log`, `remaining-clean-install.log`, `remaining-toolchain-tests.log`, `remaining-capacitor-plugins.log`, and `remaining-{full-suite,lint,types,build,full-audit,production-audit,money}-final.log`.

Prior status: [O43 release ledger](rider-auth-completion-2026-10-25.md), [consolidation](final-build-consolidation-2026-10-22.md).

## Follow-up browser-auth implementation

[Browser auth coordination](browser-auth-coordination-2026-10-25.md) now supplies the previously separate vendor/staff/password SDK participation and supported-browser cross-tab Web Lock implementation. Full **602 files / 4,499 PASS**; full and production audits remain zero. Operational acceptance and unsupported-browser fallback limits remain explicit; S01 remediation/override policy unchanged.
