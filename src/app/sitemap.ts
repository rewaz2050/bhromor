import type { MetadataRoute } from "next";
import { getStorefrontCatalog } from "@/lib/db/storefront";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Public storefront sitemap. Private surfaces (account, cart, checkout,
 * admin, vendor and rider tools) are intentionally excluded; account is
 * also marked noindex in its own metadata.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products } = await getStorefrontCatalog();

  const staticRoutes = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/shop", priority: 0.9, changeFrequency: "weekly" },
    { path: "/shops", priority: 0.7, changeFrequency: "weekly" },
    { path: "/track", priority: 0.5, changeFrequency: "monthly" },
    { path: "/about", priority: 0.5, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
    { path: "/delivery", priority: 0.5, changeFrequency: "monthly" },
    { path: "/returns", priority: 0.5, changeFrequency: "monthly" },
    { path: "/faq", priority: 0.5, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  ] as const;

  return [
    ...staticRoutes.map((route) => ({
      url: absoluteUrl(route.path),
      lastModified: new Date(),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...products.map((product) => ({
      url: absoluteUrl(`/product/${product.slug}`),
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
