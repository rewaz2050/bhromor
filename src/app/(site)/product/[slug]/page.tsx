import { completeTheLook } from "@/lib/merchandising";
import { moreInCategory } from "@/lib/home-shelves";
import MoreInCategory from "@/components/product/more-in-category";
import RecentlyViewedRail from "@/components/product/recently-viewed-rail";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { coverImage } from "@/lib/catalog";
import {
  findStorefrontProduct,
  getStorefrontCatalog,
} from "@/lib/db/storefront";
import { formatBdt } from "@/lib/format";
import ProductGallery from "@/components/product/product-gallery";
import PurchasePanel from "@/components/product/purchase-panel";
import CatalogHydrator from "@/components/shop/catalog-hydrator";
import ProductCard from "@/components/product/product-card";
import BundleOffer from "@/components/promo/bundle-offer";
import FlashRail from "@/components/promo/flash-rail";
import PriceAlertRow from "@/components/promo/price-alert-row";
import RestockAlertRow from "@/components/product/restock-alert-row";
import ReviewsSection from "@/components/reviews/reviews-section";
import { IconCheck, IconChevron, IconLeaf } from "@/components/ui/icons";
import { gsmBand, hasFabricInfo } from "@/lib/fabric";
import {
  DELIVERY_ETA,

  INSTANT_DELIVERY_TITLE,
} from "@/lib/delivery";

interface PageProps {
  params: Promise<{ slug: string }>;
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
  const { slug } = await params;
  const { products } = await getStorefrontCatalog();
  const product = findStorefrontProduct(products, slug);
  // Thrown here as well as in the page: metadata is resolved before the
  // shell streams for crawlers with blocking metadata, so an unknown slug
  // answers a real 404 instead of a 200 with a 404 body (audit L1).
  if (!product) notFound();
  const cover = coverImage(product);
  return {
    title: product.name,
    description: product.shortDescription,
    openGraph: {
      type: "website",
      title: `${product.name} — PROSANTI`,
      description: product.shortDescription,
      images: [{ url: cover.src, alt: cover.alt || product.name }],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const { products, categories, shops } = await getStorefrontCatalog();
  const product = findStorefrontProduct(products, slug);
  if (!product) notFound();

  const complements = completeTheLook(product, products);
  // The very last section of the page is the SAME shelf the shopper is on:
  // siblings from this piece's category only (in stock first, never a piece
  // already shown in "complete the look"), with a scoped "See all N in
  // <category>" link when the category holds more than the row shows.
  const more = moreInCategory(product, products, complements);
  const category = categories.find((c) => c.id === product.category) ?? {
    id: product.category,
    name: product.category,
    nameBn: "",
    tagline: "",
    image: "",
    subCategories: [],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.media
      .filter((m) => (m.kind ?? "image") === "image")
      .map((m) => m.src),
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
      {/* P2.1 — seed the client registry from the rows already rendered. */}
      <CatalogHydrator products={products} categories={categories} shops={shops} />
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
          href={`/shop?category=${encodeURIComponent(product.category)}`}
          className="transition-colors hover:text-forest-700"
        >
          {category.name}
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
          {hasFabricInfo(product) ? (
            <details open>
              <summary>Quality &amp; transparency</summary>
              <div className="info-body space-y-3">
                {product.qualityChecked ? (
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-forest-800">
                    <IconCheck className="h-3.5 w-3.5" /> Quality Checked
                  </p>
                ) : null}
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {product.fabricGsm ? (
                    <div className="flex justify-between gap-4 border-b border-line pb-3 text-sm">
                      <dt className="font-medium text-ink">Fabric weight</dt>
                      <dd className="text-right text-ink-soft">
                        {product.fabricGsm} GSM · {gsmBand(product.fabricGsm)}
                      </dd>
                    </div>
                  ) : null}
                  {product.manufacturer ? (
                    <div className="flex justify-between gap-4 border-b border-line pb-3 text-sm">
                      <dt className="font-medium text-ink">Woven by</dt>
                      <dd className="text-right text-ink-soft">{product.manufacturer}</dd>
                    </div>
                  ) : null}
                </dl>
                {product.testReportUrl ? (
                  <p className="text-sm text-ink-soft">
                    Fabric test report on file —{" "}
                    <a
                      href={product.testReportUrl}
                      target="_blank"
                      rel="noopener nofollow"
                      className="font-medium text-forest-700 underline underline-offset-4"
                    >
                      read it here
                    </a>
                    .
                  </p>
                ) : null}
                <p className="text-xs leading-6 text-ink-soft/80">
                  These details are declared by the shop for this piece — we
                  publish what the maker states, never a generic “premium” label.
                </p>
              </div>
            </details>
          ) : null}
          <details>
            <summary>Delivery &amp; returns</summary>
            <div className="info-body">
              <ul className="space-y-3 text-sm leading-7 text-ink-soft">
                <li>· 7-day easy return &amp; exchange on unworn items</li>
                {product.warrantyDays ? (
                  <li>
                    · {product.warrantyDays}-day warranty on this item —{" "}
                    <span className="text-ink">
                      claim it from the track page within {product.warrantyDays} days of delivery
                    </span>
                  </li>
                ) : null}
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
          <PriceAlertRow product={product} />
          <RestockAlertRow product={product} />
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
                60
              </span>{" "}
              টি অর্ডারে ডেলিভারি ফ্রি (প্রতিটি কাস্টমারের জন্য) — শুধু সুনামগঞ্জ
              সিটি (এ জোন)-এ! এ জোনের বাইরে জোন চার্জ প্রযোজ্য।
            </p>
          </div>
        </aside>
      </div>


      {/* P0 #2 — the rail and the one-click set are the same idea: the set is
          offered when the pairing is real, and the pieces stay individually
          purchasable when it is not. */}
      <BundleOffer product={product} />

      {complements.length > 0 && (
        <section
          aria-labelledby="complete-look-heading"
          className="mt-10 px-1"
        >
          <h2
            id="complete-look-heading"
            className="font-display text-2xl text-forest-900"
          >
            Or pick the pieces yourself
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
            {complements.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-10">
        <FlashRail excludeId={product.id} limit={4} />
      </div>
      {/* §30 reviews — live approved reviews + moderated submission form */}
      <ReviewsSection product={product} />
      {/* What this device looked at before this piece (and where the view
          itself is remembered) — above the category shelf, never below. */}
      <RecentlyViewedRail currentId={product.id} />
      {/* Always the LAST thing on the page: the rest of this piece's own
          category, so the shopper who reached the bottom keeps browsing the
          shelf they came for. */}
      <MoreInCategory
        category={category}
        items={more.items}
        hiddenCount={more.hiddenCount}
        total={more.total}
      />
    </div>
  );
}
