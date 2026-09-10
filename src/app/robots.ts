import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/account",
          "/account/",
          "/cart",
          "/cart/",
          "/checkout",
          "/checkout/",
          "/rider",
          "/rider/",
          "/vendor",
          "/vendor/",
          "/api",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteBaseUrl()}/sitemap.xml`,
    host: siteBaseUrl(),
  };
}
