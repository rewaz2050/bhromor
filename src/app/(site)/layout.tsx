import type { Metadata } from "next";
import { CartProvider } from "@/components/cart/cart-provider";
import BagDrawer from "@/components/cart/bag-drawer";
import CustomerProvider from "@/components/account/customer-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import LiveCatalogBoot from "@/components/shop/live-catalog-boot";
import FlashStrip from "@/components/promo/flash-strip";
import CampaignStrip from "@/components/promo/campaign-strip";
import RefCapture from "@/components/promo/ref-capture";
import InstallPrompt from "@/components/layout/install-prompt";

/** Public PROSANTI storefront chrome (route group `(site)`). */
export const metadata: Metadata = {
  title: {
    default: "PROSANTI — Rooted in Bangladesh. Designed for Today.",
    template: "%s · PROSANTI",
  },
  description:
    "PROSANTI (প্রশান্তি) — thoughtfully made essentials for everyday Bangladesh. Explore modern clothing and heritage textiles with instant 45–50 minute delivery.",
  keywords: [
    "PROSANTI",
    "প্রশান্তি",
    "premium clothing Bangladesh",
    "instant delivery",
    "45–50 minute delivery",
    "panjabi",
    "three-piece",
  ],
  openGraph: {
    type: "website",
    siteName: "PROSANTI",
    locale: "en_US",
    title: "PROSANTI — Rooted in Bangladesh. Designed for Today.",
    description:
      "Thoughtfully made essentials for everyday Bangladesh.",
    images: [
      {
        url: "/images/editorial/hero-prosanti.jpg",
        width: 1376,
        height: 768,
        alt: "PROSANTI forest-green panjabi campaign",
      },
    ],
  },
};

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Bangla first (UX audit 2026-09-18, P1 #8): the shop serves Sunamganj,
    // so a device that never picked a language reads Bangla; the switcher
    // (header on every width, drawer, bottom sheet) flips to English and the
    // choice is remembered on this device.
    <LanguageProvider initialLang="bn">
      <CartProvider>
        <CustomerProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-forest-800 focus:px-5 focus:py-2.5 focus:text-sm focus:text-ivory-50"
          >
            Skip to content
          </a>
          <Header />
          {/* P0 growth chrome: the flash bar only exists while a drop runs, and
              ?ref= is captured on whatever page a share link lands on. */}
          <FlashStrip />
          <CampaignStrip />
          <RefCapture />
          <main id="main" className="storefront-main flex-1">
            {children}
          </main>
          <Footer />
          {/* Thumb-reach navigation on phones (§67) */}
          <BottomNav />
          <BagDrawer />
          {/* Add-to-home-screen card: from the second visit, never in the
              installed app, quiet for a month after "Not now". */}
          <InstallPrompt />
          <LiveCatalogBoot />
        </CustomerProvider>
      </CartProvider>
    </LanguageProvider>
  );
}
