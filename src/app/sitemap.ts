import type { MetadataRoute } from "next";
import { productHref } from "@/lib/product-url";
import { getStorefrontCatalog } from "@/lib/db/storefront";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Public storefront sitemap. Private surfaces (account, cart, checkout,
 * admin, vendor and rider tools) are intentionally excluded; account is
 * also marked noindex in its own metadata.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, shops } = await getStorefrontCatalog();

  const staticRoutes = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/shop", priority: 0.9, changeFrequency: "weekly" },
    { path: "/shops", priority: 0.7, changeFrequency: "weekly" },
    { path: "/live", priority: 0.7, changeFrequency: "daily" },
    { path: "/track", priority: 0.5, changeFrequency: "monthly" },
    { path: "/about", priority: 0.5, changeFrequency: "monthly" },
    { path: "/story", priority: 0.5, changeFrequency: "monthly" },
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
      url: absoluteUrl(productHref(product, shops)),
      // F-18: per-product timestamp so Google's crawl reflects real edits
      // rather than claiming every product changed on every build.
      lastModified: product.updatedAt
        ? new Date(product.updatedAt)
        : product.createdAt
          ? new Date(product.createdAt)
          : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
