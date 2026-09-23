import { getStorefrontCatalog } from "@/lib/db/storefront";
import { buildGoogleFeed } from "@/lib/marketing-feeds";
import { siteBaseUrl } from "@/lib/site-url";

/**
 * Google Merchant Center data feed (free listings). Paste this URL into
 * Merchant Center → Products → Feeds as a scheduled fetch; Google pulls it
 * daily. RSS 2.0 with the http://base.google.com/ns/1.0 namespace.
 */

export const revalidate = 3600;

export async function GET() {
  const { products } = await getStorefrontCatalog();
  return new Response(buildGoogleFeed(products, siteBaseUrl()), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
