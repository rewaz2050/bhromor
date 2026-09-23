import { ImageResponse } from "next/og";
import {
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  OG_TAGLINE,
  ogDescriptionFor,
  ogFitTitle,
  ogGridPicks,
  ogHostname,
} from "@/lib/og-card";
import { ogImageSource } from "@/lib/og-media";
import { siteBaseUrl } from "@/lib/site-url";
import { getStorefrontCatalog } from "@/lib/db/storefront";
import OgCardFrame from "@/components/og/og-card-frame";

/**
 * Share preview for shop links (any /shop filter resolves here — category,
 * offers, search): up to three real covers from the live catalog and the
 * real piece count. Empty catalog → the branded text card still paints.
 *
 * A `route.tsx` handler rather than the opengraph-image file convention:
 * inside a route group the file convention never registers (upstream
 * NEXT-1102), the handler at the same URL does.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const { products } = await getStorefrontCatalog();
  const picks = ogGridPicks(products);
  const grid = (
    await Promise.all(
      picks.map(async (pick) => {
        const src = await ogImageSource(pick.src);
        return src ? { src, alt: pick.alt } : null;
      }),
    )
  ).filter((g): g is { src: string; alt: string } => g !== null);

  const title = ogFitTitle("The collection");
  const count = products.length;

  return new ImageResponse(
    (
      <OgCardFrame
        title={title.text}
        titleSize={title.size}
        description={ogDescriptionFor(
          count > 0
            ? `${count} pieces in the collection · new drops weekly`
            : "Panjabi · Three-piece · Lungi · Gamcha",
        )}
        tagline={OG_TAGLINE}
        host={ogHostname(siteBaseUrl())}
        grid={grid}
      />
    ),
    { width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT },
  );
}
