import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "./globals.css";

export const metadata: Metadata = {
  title: "PROSANTI",
  description:
    "PROSANTI — an e-commerce storefront. Thoughtfully curated products, beautifully presented.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
