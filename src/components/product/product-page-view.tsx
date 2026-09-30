/**
 * The product page itself (C5).
 *
 * Lives here — not inside a route — because a piece has two addresses: the
 * shop-scoped one (`/shops/<shop>/p/<piece>`, the canonical) and the pre-C5
 * `/product/<slug>`, which still has to answer for links already out in the
 * world and for a piece whose shop is not on the storefront (a suspended
 * shop's product is still browsable, it just cannot be ordered).
 *
 * Sync on purpose: the co-purchase rail is a live read the ROUTES await (a
 * page may be async, a component under test may not), so both addresses hand
 * the pieces in and this file only lays the page out.
 */

import Link from "next/link";
import { completeTheLook } from "@/lib/merchandising";
import { moreInCategory } from "@/lib/home-shelves";
import type { Category, Product, Shop } from "@/lib/catalog";
import MoreInCategory from "@/components/product/more-in-category";
import AlsoBoughtRail from "@/components/product/also-bought-rail";
import PairItWithRail from "@/components/product/pair-it-with-rail";
import DeliveryAside from "@/components/product/delivery-aside";
import RecentlyViewedRail from "@/components/product/recently-viewed-rail";
import ProductViewTracker from "@/components/analytics/product-view-tracker";
import ProductGallery from "@/components/product/product-gallery";
import PurchasePanel from "@/components/product/purchase-panel";
import StickyBuyBar from "@/components/product/sticky-buy-bar";
import CatalogHydrator from "@/components/shop/catalog-hydrator";
import BundleOffer from "@/components/promo/bundle-offer";
import FlashRail from "@/components/promo/flash-rail";
import PriceAlertRow from "@/components/promo/price-alert-row";
import RestockAlertRow from "@/components/product/restock-alert-row";
import ProductInfo from "@/components/product/product-info";
import ReviewsSection from "@/components/reviews/reviews-section";
import { IconChevron } from "@/components/ui/icons";

interface ProductPageViewProps {
  product: Product;
  products: Product[];
  categories: Category[];
  shops: Shop[];
  /** UX plan §4 (R11) — real baskets: what left together with this piece. */
  alsoBought: Product[];
  /** Absent when the piece's own shop is not on the storefront (C5 fallback). */
  shop?: Shop;
}

export default function ProductPageView({
  product,
  products,
  categories,
  shops,
  alsoBought,
  shop,
}: ProductPageViewProps) {
  const complements = completeTheLook(product, products);
  const alsoBoughtItems = alsoBought;
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
    brand: { "@type": "Brand", name: shop?.name ?? "PROSANTI" },
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
      <ProductViewTracker product={product} />
      {/* Breadcrumb — C5: whose shop this piece is, then the shelf it sits on. */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-ink-soft"
      >
        <Link href="/" className="transition-colors hover:text-forest-700">
          Home
        </Link>
        {shop && (
          <>
            <IconChevron className="h-3.5 w-3.5 -rotate-90 text-ink-soft/60" />
            <Link
              href={`/shops/${shop.slug}`}
              className="transition-colors hover:text-forest-700"
            >
              {shop.name}
            </Link>
          </>
        )}
        <IconChevron className="h-3.5 w-3.5 -rotate-90 text-ink-soft/60" />
        <Link
          href={`/shop?category=${encodeURIComponent(product.category)}`}
          className="transition-colors hover:text-forest-700"
        >
          {category.name}
        </Link>
        {product.subCategory.trim() !== "" && (
          <>
            <IconChevron className="h-3.5 w-3.5 -rotate-90 text-ink-soft/60" />
            <Link
              href={`/shop?category=${encodeURIComponent(product.category)}&sub=${encodeURIComponent(product.subCategory)}`}
              className="transition-colors hover:text-forest-700"
            >
              {product.subCategory}
            </Link>
          </>
        )}
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
        {/* Phones: the compact dock that appears once this panel scrolls away. */}
        <StickyBuyBar product={product} />
      </div>

      {/* UX plan §4 (R11) — the AOV lever sits RIGHT under the buy panel:
          the one-tap set when the pairing is real (P0 #2), then the
          complement pieces as a short "Pair it with" row. */}
      <BundleOffer product={product} />
      <PairItWithRail items={complements} />

      {/* Product information — accordion so the page stays short on mobile
          (UX plan §4, R10: bilingual, first section open, fit block honest). */}
      <div className="mt-14 grid gap-8 lg:grid-cols-3 lg:gap-12">
        <ProductInfo product={product} />

        <aside className="space-y-6">
          <PriceAlertRow product={product} />
          <RestockAlertRow product={product} />
          {/* UX plan §4 (R11) — the real zone ladder (and this device's own
              zone), bilingual; no invented free-delivery rule. */}
          <DeliveryAside />
        </aside>
      </div>

      {/* UX plan §4 (R11) — co-purchases from real orders; absent until they exist. */}
      <AlsoBoughtRail items={alsoBoughtItems} />

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
