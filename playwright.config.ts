import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "dashboards.spec.ts",
  fullyParallel: false,
  workers: 1,
  // One retry on CI only. The suite is a single worker against `next dev`, so a
  // page that compiles slowly under runner load can miss a 12 s expectation
  // once; the retry re-runs just that test. Local runs stay strict (0 retries).
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: ".cache/playwright-report" }],
    // CI sets PLAYWRIGHT_JSON_OUTPUT_NAME so the job can annotate the exact
    // failing spec; the HTML report stays for the uploaded artifact.
    ...(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ? ([["json"]] as [string][]) : []),
  ],
  outputDir: ".cache/playwright-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 0.0.0.0 --port 3100",
        url: "http://localhost:3100",
        // Reusing a normal preview can silently disable configured-backend
        // views and invalidate admin recovery fixtures. Opt in to an external,
        // correctly configured server explicitly with E2E_BASE_URL instead.
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://verification.invalid",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "verification-only",
          SUPABASE_SERVICE_ROLE_KEY: "",
        },
      },
});
