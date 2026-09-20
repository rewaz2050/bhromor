import type { MetadataRoute } from "next";

/**
 * Web app manifest — "add to home screen".
 *
 * A shopper who installs the shop opens it like an app (no address bar,
 * its own icon on the phone). No service worker is registered on purpose:
 * prices and stock are live, and a cached shelf would be a stale one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PROSANTI — প্রশান্তি",
    short_name: "PROSANTI",
    description:
      "Thoughtfully made essentials for everyday Bangladesh — instant 45–50 minute delivery in Sunamganj, cash on delivery.",
    start_url: "/?utm_source=pwa&utm_medium=homescreen",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f1e6",
    theme_color: "#0c1913",
    lang: "bn",
    dir: "ltr",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Shop", short_name: "Shop", url: "/shop?utm_source=pwa" },
      { name: "Offers", short_name: "Offers", url: "/shop?filter=sale&utm_source=pwa" },
      { name: "Track order", short_name: "Track", url: "/track?utm_source=pwa" },
    ],
  };
}
