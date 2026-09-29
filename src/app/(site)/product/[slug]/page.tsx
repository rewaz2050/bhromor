/**
 * The pre-C5 product address (C5).
 *
 * `/product/<slug>` is how every shared link out in the world reaches a piece
 * — WhatsApp forwards, Facebook cards, printed QR codes. It is no longer the
 * piece's address, so it does not render a second copy of the page: it sends
 * the visitor on to `/shops/<shop>/p/<piece>` with Next.js's permanent
 * (308) redirect, which tells search engines where the page moved and keeps
 * one canonical URL instead of two.
 *
 * Two pieces may now share a slug (one per shop), so a slug can answer more
 * than one piece. Guessing which shop the visitor meant would be a lie — the
 * page asks instead.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { productHref } from "@/lib/product-url";
import { alsoBoughtProducts } from "@/lib/db/also-bought";
import {
  findStorefrontProductsBySlug,
  getStorefrontCatalog,
} from "@/lib/db/storefront";
import ProductPageView from "@/components/product/product-page-view";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return [];
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { products } = await getStorefrontCatalog();
  const matches = findStorefrontProductsBySlug(products, slug);
  // A 404 body under a 200 would tell Google the page exists (audit L1).
  if (matches.length === 0) notFound();
  if (matches.length === 1) return { title: matches[0]!.name };
  // Several shops sell a piece by this name — the page itself asks which one;
  // there is nothing here worth indexing.
  return { title: `Which ${slug}?`, robots: { index: false, follow: false } };
}

export default async function LegacyProductPage({ params }: PageProps) {
  const { slug } = await params;
  const { products, categories, shops } = await getStorefrontCatalog();
  const matches = findStorefrontProductsBySlug(products, slug);
  if (matches.length === 0) notFound();

  if (matches.length > 1) {
    // Two shops, one name. Sending the visitor to either would be a guess, so
    // the page names the shops and lets them choose.
    return (
      <div
        className="mx-auto max-w-2xl px-4 py-16 sm:px-6"
        data-testid="product-slug-ambiguous"
      >
        <h1 className="font-display text-2xl text-ink">
          More than one shop sells “{slug}”
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Which one did you mean?
        </p>
        <ul className="mt-6 space-y-2">
          {matches.map((product) => (
            <li key={product.id}>
              <Link
                href={productHref(product, shops)}
                className="block rounded-xl border border-line px-4 py-3 transition-colors hover:border-forest-600"
                data-testid="product-slug-choice"
              >
                <span className="block text-sm text-ink">{product.name}</span>
                <span className="block text-xs text-ink-soft">
                  {productHref(product, shops)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const product = matches[0]!;
  const shop = shops.find((s) => s.id === product.shopId);
  if (shop) permanentRedirect(productHref(product, shops));

  // The piece's own shop is not on the storefront (suspended, say). There is
  // nowhere to send the visitor, and the piece was reachable here before C5 —
  // so it stays reachable here, without a shop crumb it cannot name.
  const alsoBought = await alsoBoughtProducts(product.id, products);
  return (
    <ProductPageView
      product={product}
      alsoBought={alsoBought}
      products={products}
      categories={categories}
      shops={shops}
    />
  );
}
