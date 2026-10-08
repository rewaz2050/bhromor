import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
// The variable face, imported for its URL: the <link rel="preload"> below
// asks for it before the CSS that names it is even parsed, so the Latin text
// paints in Inter instead of appearing in a fallback and swapping.
import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2";
import "@fontsource-variable/playfair-display";
// Noto Serif Bengali lives in (site)/layout: only the storefront uses
// font-bengali — the rider/vendor/admin apps must not pay for 3 weights.
import "./globals.css";
import AnalyticsScripts from "@/components/analytics/analytics-scripts";
import AnalyticsRouteTracker from "@/components/analytics/analytics-route-tracker";
import { siteBaseUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  // Canonical/OG/sitemap origin. NEXT_PUBLIC_SITE_URL → Vercel production
  // domain → https://prosanti.store; the live store is served from
  // proshanti.rahatahmed.site, so a hard-coded origin put the wrong host in
  // every og:url and canonical tag (audit M8).
  metadataBase: new URL(siteBaseUrl()),
  // Installable (add to home screen): manifest + iOS web-app hints. The
  // apple touch icon is src/app/apple-icon.png (Next links it automatically).
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PROSANTI",
    statusBarStyle: "default",
  },
  applicationName: "PROSANTI",
  // Rich WhatsApp/Facebook/X previews for bare links (home, /shop, product
  // pages each answer an opengraph-image card).
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c1913",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `lang` is corrected before first paint by the storefront's inline
    // script (src/app/(site)/layout.tsx) so Bangla typography rules apply
    // from the very first frame; suppress the attribute-mismatch warning.
    // data-scroll-behavior="smooth": globals.css sets `scroll-behavior:
    // smooth` on <html> for in-page anchors; Next 16 only suppresses that
    // during route transitions when this attribute is present — without it
    // every product tap from the bottom of a listing glided the new page up
    // from wherever the old one was (scroll audit 2026-09-27).
    <html
      lang="en"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* Media lives on other hosts — warm those connections before the
            catalog images are discovered, especially on mobile networks. */}
        {/* Self-hosted, same origin — one request, no DNS, no TLS, and it
            lands before the first paint instead of after it. */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href={interWoff2}
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://img.youtube.com" />
      </head>
      <body className="flex min-h-full flex-col bg-ivory-50 text-ink">
        {children}
        {/* Meta Pixel / GA4 — nothing is loaded unless the ids are set. */}
        <AnalyticsScripts />
        <AnalyticsRouteTracker />
      </body>
    </html>
  );
}
