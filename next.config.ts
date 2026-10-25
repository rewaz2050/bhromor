import type { NextConfig } from "next";

/**
 * Baseline response headers (audit L2). Deliberately NOT a full
 * Content-Security-Policy: the storefront inlines Next's hydration scripts
 * and embeds Cloudinary media, OpenStreetMap tiles and YouTube players, so a
 * script-src/img-src policy needs its own tested rollout. What is here is
 * safe for every page today:
 *   - nosniff / referrer policy / permissions policy on all routes;
 *   - frame-ancestors 'self' (clickjacking guard for the admin/rider apps)
 *     only on Vercel — the sandbox live preview renders the site inside an
 *     iframe, and a blanket deny would blank it.
 * HSTS is added by Vercel automatically; we repeat it so self-hosted
 * deployments get it too.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Checkout pins the address and the rider app streams its position;
    // the delivery-proof photo goes through <input capture> (not getUserMedia).
    value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Security 2026-10-19 (E5.1): CSP step 2 — REPORT-ONLY retained for 7-day soak,
  // now with stricter img-src (removed *.googleusercontent.com wildcard —
  // exact host only) and report-uri directive. Flip key to enforced
  // Content-Security-Policy after soak + add per-request nonces.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // Next hydration inlines scripts; report-only collects what else is needed.
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://i.ytimg.com https://img.youtube.com https://*.tile.openstreetmap.org",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.cloudinary.com https://www.google-analytics.com https://analytics.google.com https://*.facebook.net https://*.facebook.com",
      "media-src 'self' blob: https://res.cloudinary.com",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "report-uri /api/csp-report",
    ].join("; "),
  },
  ...(process.env.VERCEL
    ? [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ]
    : [
        // Non-Vercel hosts: keep the clickjacking guard (L1). Only the
        // explicitly opted-in local Arena dev preview may be embedded.
        ...(process.env.NODE_ENV === "development" && process.env.ARENA_PREVIEW === "1"
          ? []
          : [{ key: "X-Frame-Options", value: "SAMEORIGIN" }]),
      ]),
  // Round 3 (2026-10-14): process-isolation headers on everything.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

/**
 * Staff surfaces (/admin/* incl. the ops gate): the same CSP, now ENFORCED.
 * Staff traffic is small and can report a breakage; the storefront stays
 * report-only until the policy is proven there too (2026-10-14, L1 step 2).
 */
const staffCspHeaders = [
  {
    key: "Content-Security-Policy",
    // Round 4: analytics (GTM/Pixel/GA) moved to the storefront layout, so
    // the staff surfaces allow NO external script hosts at all — a stored
    // XSS here can neither load a payload from the network nor phone home.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://i.ytimg.com https://img.youtube.com https://*.tile.openstreetmap.org",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.cloudinary.com",
      "media-src 'self' blob: https://res.cloudinary.com",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** Personal/PII JSON: never cache it in a shared or browser cache. */
const noStoreHeaders = [{ key: "Cache-Control", value: "no-store" }];
const noStoreRoutes = [
  "/api/account/:path*",
  "/api/admin/:path*",
  "/api/track/:path*",
  "/api/rider/:path*",
  "/api/vendor/:path*",
  "/api/ops/:path*",
];

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["*.e2b.app"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/admin/:path*", headers: staffCspHeaders },
      ...noStoreRoutes.map((source) => ({ source, headers: noStoreHeaders })),
    ];
  },

  images: {
    // Product/category media hosts: Cloudinary uploads, Google Drive
    // direct links, and YouTube thumbnails (§13–15, §48–51).
    // Security 2026-10-14 (L4): the `*.googleusercontent.com` wildcard and
    // the `drive.google` typo are gone — exact hosts only.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
    // Speed (2026-09-21): modern formats and a long optimizer cache — a
    // product photo is encoded once, then served from the CDN for a month
    // instead of being re-encoded every week.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2_678_400, // 31 days
    // Audit E4.2: prefer inline SVG placeholders to avoid extra fetches
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Audit P2-08: bundle analyzer — set ANALYZE=1 to generate report
  ...(process.env.ANALYZE === "1" ? { webpack: undefined } : {}),
};

export default nextConfig;
