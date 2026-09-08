import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "@fontsource/noto-serif-bengali/500.css";
import "@fontsource/noto-serif-bengali/600.css";
import "./globals.css";
import { CartProvider } from "@/components/cart/cart-provider";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://prosanti.store"),
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
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-forest-800 focus:px-5 focus:py-2.5 focus:text-sm focus:text-ivory-50"
        >
          Skip to content
        </a>
        <CartProvider>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
