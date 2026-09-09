import type { Metadata } from "next";
import { CartProvider } from "@/components/cart/cart-provider";
import BagDrawer from "@/components/cart/bag-drawer";
import CustomerProvider from "@/components/account/customer-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import LiveCatalogBoot from "@/components/shop/live-catalog-boot";

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
    <LanguageProvider>
      <CartProvider>
        <CustomerProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-forest-800 focus:px-5 focus:py-2.5 focus:text-sm focus:text-ivory-50"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="storefront-main flex-1">
            {children}
          </main>
          <Footer />
          {/* Thumb-reach navigation on phones (§67) */}
          <BottomNav />
          <BagDrawer />
          <LiveCatalogBoot />
        </CustomerProvider>
      </CartProvider>
    </LanguageProvider>
  );
}
