import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "@fontsource/noto-serif-bengali/400.css";
import "@fontsource/noto-serif-bengali/500.css";
import "@fontsource/noto-serif-bengali/600.css";
import "./globals.css";
import SmoothScroll from "@/components/ui/smooth-scroll";
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
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Media lives on other hosts — warm those connections before the
            catalog images are discovered, especially on mobile networks. */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://img.youtube.com" />
      </head>
      <body className="flex min-h-full flex-col bg-ivory-50 text-ink">
        <SmoothScroll />
        {children}
        {/* Meta Pixel / GA4 — nothing is loaded unless the ids are set. */}
        <AnalyticsScripts />
        <AnalyticsRouteTracker />
      </body>
    </html>
  );
}
