import { getStorefrontCatalog } from "@/lib/db/storefront";
import { buildMetaFeed } from "@/lib/marketing-feeds";

/**
 * Meta Commerce data feed (Facebook & Instagram shopping). Paste this URL
 * into Commerce Manager → Catalog → Data sources as a scheduled feed;
 * Meta re-fetches it (Google/Meta follow the URL, no auth needed).
 */

export const revalidate = 3600;

export async function GET() {
  const { products, shops } = await getStorefrontCatalog();
  return new Response(buildMetaFeed(products, shops), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
