import type { Metadata } from "next";
import { CartProvider } from "@/components/cart/cart-provider";
import BagDrawer from "@/components/cart/bag-drawer";
import BottomNav from "@/components/layout/bottom-nav";
import CustomerProvider from "@/components/account/customer-provider";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

/** Public PROSANTI storefront chrome (route group `(site)`). */
export const metadata: Metadata = {
  title: {
    default: "PROSANTI — Premium Commerce & Rapid Delivery",
    template: "%s · PROSANTI",
  },
  description:
    "PROSANTI (প্রশান্তি) — premium commerce with rapid local delivery. Discover considered products, order easily, and track your order until it reaches your door. Cash on delivery available.",
  keywords: [
    "PROSANTI",
    "প্রশান্তি",
    "premium clothing Bangladesh",
    "rapid delivery",
    "panjabi",
    "three-piece",
  ],
  openGraph: {
    type: "website",
    siteName: "PROSANTI",
    locale: "en_US",
    title: "PROSANTI — Premium Commerce & Rapid Delivery",
    description:
      "Discover considered products, order easily, and track delivery to your door.",
    images: [
      {
        url: "/brand/logo-lockup.png",
        width: 1024,
        height: 883,
        alt: "PROSANTI — প্রশান্তি",
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
        <div className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden" />
        <BottomNav />
        <BagDrawer />
      </CustomerProvider>
    </CartProvider>
  );
}
