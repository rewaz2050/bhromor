import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Real Next routes/hooks with intercepted read APIs; no live staff credentials. */
export default defineConfig({
  ...base,
  testMatch: "admin-data-recovery.spec.ts",
  testIgnore: [],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 0.0.0.0 --port 3101",
        url: "http://localhost:3101",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://verification.invalid",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "verification-only",
          SUPABASE_SERVICE_ROLE_KEY: "",
        },
      },
  use: {
    ...base.use,
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3101",
  },
});
