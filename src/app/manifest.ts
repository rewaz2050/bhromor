import type { MetadataRoute } from "next";

/**
 * PWA manifest (Batch N).
 *
 * Why a storefront wants "Add to Home Screen" here: the shop is used from
 * phones, often the same phones that keep the shop's WhatsApp open. An icon
 * on the home screen turns "search for the shop again" into one tap, and a
 * standalone window (no browser chrome) makes a repeat purchase feel like an
 * app — without shipping one.
 *
 * Deliberately NO service worker: a storefront that serves a cached page can
 * serve a cached *price* (or a sold-out size as available). Until there is an
 * offline story that is honest about money, the honest answer is the
 * browser's own offline page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PROSANTI — প্রশান্তি",
    short_name: "PROSANTI",
    description:
      "Thoughtfully made essentials for everyday Bangladesh — panjabi, shirts, saree and three-piece, delivered in Sunamganj.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9f2",
    theme_color: "#0c1913",
    lang: "bn",
    dir: "ltr",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
