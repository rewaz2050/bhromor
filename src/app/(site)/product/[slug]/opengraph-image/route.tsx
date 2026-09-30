import { ImageResponse } from "next/og";
import {
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  OG_TAGLINE,
  ogDescriptionFor,
  ogFitTitle,
  ogHostname,
  ogTaka,
} from "@/lib/og-card";
import { ogImageSource } from "@/lib/og-media";
import { siteBaseUrl } from "@/lib/site-url";
import {
  findStorefrontProductsBySlug,
  getStorefrontCatalog,
} from "@/lib/db/storefront";
import { coverImage } from "@/lib/catalog";
import OgCardFrame from "@/components/og/og-card-frame";

/**
 * Share preview for a pre-C5 product link. A unique old slug keeps its piece's
 * branded preview; if two shops now share that name, avoid showing an arbitrary
 * shop's piece as the preview — the legacy page itself asks which shop.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { products } = await getStorefrontCatalog();
  const matches = findStorefrontProductsBySlug(products, slug);
  const product = matches.length === 1 ? matches[0]! : undefined;

  const title = ogFitTitle(product?.name ?? "PROSANTI");
  const cover = product ? coverImage(product) : null;
  const photo = cover ? await ogImageSource(cover.src) : null;

  return new ImageResponse(
    (
      <OgCardFrame
        title={title.text}
        titleSize={title.size}
        description={
          product ? ogDescriptionFor(product.shortDescription, 74) : undefined
        }
        price={product ? ogTaka(product.price) : null}
        compareAt={product?.compareAtPrice ? ogTaka(product.compareAtPrice) : null}
        tagline={OG_TAGLINE}
        host={ogHostname(siteBaseUrl())}
        image={photo ? { src: photo, alt: cover?.alt || product?.name || "" } : null}
      />
    ),
    { width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT },
  );
}
