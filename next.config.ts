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
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ...(process.env.VERCEL
    ? [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["*.e2b.app"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    // Product/category media hosts: Cloudinary uploads, Google Drive
    // direct links, and YouTube thumbnails (§13–15, §48–51).
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "drive.google" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
};

export default nextConfig;
