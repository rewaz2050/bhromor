import { completeTheLook, isDiscoverable } from "@/lib/merchandising";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS, getProductBySlug, productsByCategory } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import ProductGallery from "@/components/product/product-gallery";
import PurchasePanel from "@/components/product/purchase-panel";
import ProductCard from "@/components/product/product-card";
import ReviewsSection from "@/components/reviews/reviews-section";
import { IconChevron, IconLeaf } from "@/components/ui/icons";
import { Eyebrow } from "@/components/ui/primitives";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
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
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const complements = completeTheLook(product, PRODUCTS);
  const related = productsByCategory(product.category)
    .filter((p) => p.id !== product.id)
    .concat(
      PRODUCTS.filter((p) => p.category !== product.category && p.featured),
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

      {/* Tabs */}
      <div className="mt-16 grid gap-8 lg:grid-cols-3">
        <div className="rounded-md bg-paper p-8 ring-1 ring-line lg:col-span-2">
          <h2 className="font-display text-2xl font-medium text-forest-900">
            Product details
          </h2>
          <div className="mt-4 space-y-4">
            {product.description.map((para) => (
              <p key={para.slice(0, 32)} className="leading-8 text-ink-soft">
                {para}
              </p>
            ))}
          </div>
          <dl className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
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

        <aside className="space-y-6">
          <div className="rounded-md bg-forest-900 p-8 text-ivory-100">
            <IconLeaf className="h-6 w-6 text-gold-300" />
            <h2 className="font-display mt-4 text-xl font-medium">
              Delivery estimate
            </h2>
            <p className="mt-3 text-sm leading-7 text-ivory-100/70">
              Select your area at checkout to see the exact charge and arrival
              estimate. Inside the service area, expect{" "}
              <strong className="text-gold-300">45–50 minutes</strong> from
              confirmation.
            </p>
            <p className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-sm text-ivory-100/85">
              Delivery from{" "}
              <span className="font-semibold text-white">
                {formatBdt(5000)}
              </span>{" "}
              in Zone A · orders over{" "}
              <span className="font-semibold text-white">
                {formatBdt(200000)}
              </span>{" "}
              get free delivery.
            </p>
          </div>
          <div className="rounded-md bg-paper p-8 ring-1 ring-line">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-ink">
              Care &amp; returns
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-ink-soft">
              <li>· 7-day easy return &amp; exchange on unworn items</li>
              <li>· Quality checked before dispatch</li>
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
        </aside>
      </div>

      {/* Reviews (§30) */}
      <ReviewsSection product={product} />

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
    </div>
  );
}
