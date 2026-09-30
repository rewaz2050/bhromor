import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alsoBoughtProducts } from "@/lib/db/also-bought";
import { absoluteUrl } from "@/lib/site-url";
import { productPath } from "@/lib/product-url";
import { coverImage } from "@/lib/catalog";
import {
  findShopProduct,
  findStorefrontShop,
  getStorefrontCatalog,
} from "@/lib/db/storefront";
import ProductPageView from "@/components/product/product-page-view";

interface PageProps {
  params: Promise<{ slug: string; product: string }>;
}

export function generateStaticParams() {
  // Live slugs only the database knows — nothing pre-rendered from a demo
  // catalog (the old launch seeds). Each product page renders on demand.
  return [];
}

/**
 * Rendered on demand so pages always carry the live ids/prices.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, product: productSlug } = await params;
  const { products, shops } = await getStorefrontCatalog();
  const shop = findStorefrontShop(shops, slug);
  const product = findShopProduct(products, shops, slug, productSlug);
  // Thrown here as well as in the page: metadata is resolved before the
  // shell streams for crawlers with blocking metadata, so an unknown slug
  // answers a real 404 instead of a 200 with a 404 body (audit L1).
  if (!shop || !product) notFound();
  const cover = coverImage(product);
  const path = productPath(shop.slug, product.slug);
  return {
    title: product.name,
    description: product.shortDescription,
    // C5 — this is THE address of the piece; `/product/<slug>` merely sends
    // visitors here, so search engines are told which one to index.
    alternates: { canonical: absoluteUrl(path) },
    // The branded price card (opengraph-image/route.tsx in this segment —
    // the file convention doesn't register inside a route group, upstream
    // NEXT-1102). Route handlers can't auto-attach, so the page advertises
    // the URL itself.
    openGraph: {
      type: "website",
      title: `${product.name} — PROSANTI`,
      description: product.shortDescription,
      url: absoluteUrl(path),
      images: [
        {
          url: `${path}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: cover.alt || product.name,
        },
      ],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug, product: productSlug } = await params;
  const { products, categories, shops } = await getStorefrontCatalog();
  const shop = findStorefrontShop(shops, slug);
  const product = findShopProduct(products, shops, slug, productSlug);
  if (!shop || !product) notFound();
  // UX plan §4 (R11) — real baskets: what left together with this piece.
  const alsoBought = await alsoBoughtProducts(product.id, products);

  return (
    <ProductPageView
      product={product}
      alsoBought={alsoBought}
      products={products}
      categories={categories}
      shops={shops}
      shop={shop}
    />
  );
}
