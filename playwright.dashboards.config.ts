import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Isolated browser contracts: fixture responses, no real Supabase credentials. */
export default defineConfig({
  ...base,
  testMatch: 'dashboards.spec.ts',
  testIgnore: [],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- --hostname 0.0.0.0 --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://verification.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'verification-only',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
  },
});
