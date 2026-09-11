import { completeTheLook, isDiscoverable } from "@/lib/merchandising";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS } from "@/lib/catalog";
import {
  findStorefrontProduct,
  getStorefrontCatalog,
} from "@/lib/db/storefront";
import { formatBdt } from "@/lib/format";
import ProductGallery from "@/components/product/product-gallery";
import PurchasePanel from "@/components/product/purchase-panel";
import ProductCard from "@/components/product/product-card";
import ReviewsSection from "@/components/reviews/reviews-section";
import { IconChevron, IconLeaf } from "@/components/ui/icons";
import {
  DELIVERY_ETA,
  FIRST_FREE_DELIVERY_LIMIT,
  INSTANT_DELIVERY_TITLE,
} from "@/lib/delivery";
import { Eyebrow } from "@/components/ui/primitives";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

/**
 * Rendered on demand for the same reason as /shop: seed-prerendered pages
 * would show stale demo ids/prices once the backend goes live.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { products } = await getStorefrontCatalog();
  const product = findStorefrontProduct(products, slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.shortDescription,
    openGraph: {
      type: "website",
      title: `${product.name} — PROSANTI`,
      description: product.shortDescription,
      images: [{ url: product.media[0].src, alt: product.media[0].alt }],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const { products } = await getStorefrontCatalog();
  const product = findStorefrontProduct(products, slug);
  if (!product) notFound();

  const complements = completeTheLook(product, products);
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .concat(
      products.filter((p) => p.category !== product.category && p.featured),
    )
    .filter(
      (p) => isDiscoverable(p) && !complements.some((item) => item.id === p.id),
    )
    .slice(0, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.media.map((m) => m.src),
    description: product.shortDescription,
    sku: product.sku,
    offers: {
      "@type": "Offer",
      priceCurrency: "BDT",
      price: (product.price / 100).toFixed(0),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-ink-soft"
      >
        <Link href="/" className="transition-colors hover:text-forest-700">
          Home
        </Link>
        <IconChevron className="h-3.5 w-3.5 -rotate-90 text-ink-soft/60" />
        <Link
          href={`/shop?category=${product.category}`}
          className="capitalize transition-colors hover:text-forest-700"
        >
          {product.category}
        </Link>
        <IconChevron className="h-3.5 w-3.5 -rotate-90 text-ink-soft/60" />
        <span aria-current="page" className="truncate text-ink">
          {product.name}
        </span>
      </nav>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <ProductGallery product={product} />
        <PurchasePanel product={product} />
      </div>

      {/* Product information — accordion so the page stays short on mobile */}
      <div className="mt-14 grid gap-8 lg:grid-cols-3 lg:gap-12">
        <div className="info-accordion lg:col-span-2">
          <details open>
            <summary>Product details</summary>
            <div className="info-body space-y-4">
              {product.description.map((para) => (
                <p key={para.slice(0, 32)} className="leading-8 text-ink-soft">
                  {para}
                </p>
              ))}
            </div>
          </details>
          <details>
            <summary>Fabric &amp; care</summary>
            <div className="info-body">
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {product.details.map((d) => (
                  <div
                    key={d.label}
                    className="flex justify-between gap-4 border-b border-line pb-3 text-sm"
                  >
                    <dt className="font-medium text-ink">{d.label}</dt>
                    <dd className="text-right text-ink-soft">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
          <details>
            <summary>Delivery &amp; returns</summary>
            <div className="info-body">
              <ul className="space-y-3 text-sm leading-7 text-ink-soft">
                <li>· 7-day easy return &amp; exchange on unworn items</li>
                <li>· Quality checked before every dispatch</li>
                <li>· Cash on delivery across Sunamganj Sadar</li>
                <li>
                  · Questions?{" "}
                  <Link
                    href="/contact"
                    className="font-medium text-forest-700 underline underline-offset-4"
                  >
                    Contact support
                  </Link>
                </li>
              </ul>
            </div>
          </details>
        </div>

        <aside className="space-y-6">
          <div className="assurance-pill rounded-md bg-forest-900 p-8 text-ivory-100">
            <IconLeaf className="h-6 w-6 text-gold-300" />
            <h2 className="font-display mt-4 text-xl font-medium">
              {INSTANT_DELIVERY_TITLE}
            </h2>
            <p className="mt-3 text-sm leading-7 text-ivory-100/70">
              Inside Sunamganj Sadar your order arrives in{" "}
              <strong className="text-gold-300">{DELIVERY_ETA}</strong> from
              confirmation. Select your para at checkout to see the exact
              charge and arrival estimate.
            </p>
            <p className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-sm text-ivory-100/85">
              Delivery from{" "}
              <span className="font-semibold text-white">
                {formatBdt(3000)}
              </span>{" "}
              in Zone A (Sunamganj City) ·{" "}
              <span className="font-semibold text-gold-300">
                {FIRST_FREE_DELIVERY_LIMIT}
              </span>{" "}
              টি অর্ডারে ডেলিভারি ফ্রি (প্রতিটি কাস্টমারের জন্য) — শুধু সুনামগঞ্জ
              সিটি (এ জোন)-এ! এ জোনের বাইরে জোন চার্জ প্রযোজ্য।
            </p>
          </div>
        </aside>
      </div>


      {complements.length > 0 && (
        <section
          aria-labelledby="complete-look-heading"
          className="mt-20 border-y border-line bg-ivory-100/60 p-6 sm:p-10"
        >
          <Eyebrow>Better together</Eyebrow>
          <h2
            id="complete-look-heading"
            className="mt-3 font-display text-3xl text-forest-900 sm:text-4xl"
          >
            Complete the look
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-7 text-ink-soft">
            A thoughtful pairing for your {product.subCategory.toLowerCase()}.
            Choose each piece in the size and colour that feels right.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
            {complements.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
      {/* Related */}
      {related.length > 0 && (
        <section className="mt-20">
          <Eyebrow>Keep exploring</Eyebrow>
          <h2 className="font-display mt-3 text-3xl font-medium tracking-tight text-forest-900">
            You may also like
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
      {/* §30 reviews — live approved reviews + moderated submission form */}
      <ReviewsSection product={product} />
    </div>
  );
}
