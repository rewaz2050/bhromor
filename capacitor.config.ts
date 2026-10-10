import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor — the rider's Android app.
 *
 * Why the app LOADS THE SITE instead of bundling it: this is a server-rendered
 * Next.js app. It has API routes under `/api/*`, middleware, server components
 * and a service-role Supabase key — none of which can be `next export`ed into a
 * static folder a phone could ship. So the native shell is a WebView pointed at
 * the deployed storefront, with the Capacitor bridge (and therefore native
 * background GPS) available to it. One codebase, one deploy: a fix on Vercel
 * reaches every rider's phone at once, no Play Store update needed.
 *
 * The URL is the production deployment recorded in `docs/vercel.md`. Override
 * with MOBILE_SITE_URL for a preview build:
 *     MOBILE_SITE_URL=https://my-preview.vercel.app npx cap sync android
 */
const SITE_URL = process.env.MOBILE_SITE_URL ?? "https://bhromor-zeta.vercel.app";

const config: CapacitorConfig = {
  appId: "store.prosanti.rider",
  appName: "PROSANTI রাইডার",
  /**
   * Only used when the site cannot be reached — `mobile-web/index.html` is a
   * plain offline notice, never a second copy of the shop.
   */
  webDir: "mobile-web",
  server: {
    url: SITE_URL,
    // HTTPS only: the shell never loads a plain-HTTP page.
    cleartext: false,
    androidScheme: "https",
    // The site is same-origin for the app; nothing else may be navigated to.
    allowNavigation: [new URL(SITE_URL).hostname],
  },
  android: {
    /**
     * REQUIRED by @capgo/background-geolocation. Without it Android switches
     * the WebView to the modern message bridge and location updates HALT about
     * five minutes into the background — the exact failure this app exists to
     * avoid. Verified against Capacitor 8.5.3's own type declarations
     * (`useLegacyBridge?: boolean`, since 4.5.0).
     */
    useLegacyBridge: true,
  },
};

export default config;
