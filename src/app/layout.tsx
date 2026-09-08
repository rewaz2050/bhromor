import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "@fontsource/noto-serif-bengali/400.css";
import "@fontsource/noto-serif-bengali/500.css";
import "@fontsource/noto-serif-bengali/600.css";
import "./globals.css";
import SmoothScroll from "@/components/ui/smooth-scroll";

export const metadata: Metadata = {
  metadataBase: new URL("https://prosanti.store"),
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
      <body className="flex min-h-full flex-col bg-ivory-50 text-ink">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
