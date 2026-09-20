import { resolveMood } from "@/lib/merchandising";
import type { Metadata } from "next";
import {
  getStorefrontCatalog,
  getStorefrontZones,
} from "@/lib/db/storefront";
import ShopBrowser from "@/components/shop/shop-browser";
import { resolveSort } from "@/lib/shop-sort";
import CatalogHydrator from "@/components/shop/catalog-hydrator";
import BrandJournal from "@/components/shop/brand-journal";
import ShopHeroHeader from "@/components/shop/shop-hero-header";
import FlashRail from "@/components/promo/flash-rail";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse the PROSANTI catalog — premium panjabi, shirts, three-piece, lungi and gamcha, with transparent pricing and rapid delivery.",
};

/**
 * Live rows. Rendered on demand so pages always carry live ids and prices.
 */
export const dynamic = "force-dynamic";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[];
    sub?: string | string[];
    filter?: string | string[];
    q?: string | string[];
    mood?: string | string[];
    price?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const [{ products, categories, shops }, { zones }] = await Promise.all([
    getStorefrontCatalog(),
    getStorefrontZones(),
  ]);
  // Categories are data-driven (§5) — validating against three hard-coded ids
  // meant any category added later silently fell back to "all".
  const category = categories.some((c) => c.id === params.category)
    ? (params.category as string)
    : ("all" as const);
  // `?sub=Panjabi` — one garment type inside the category; ignored without a
  // category or when no piece in that category carries the type.
  const sub =
    category !== "all" && typeof params.sub === "string"
      ? (products.find((p) => p.category === category && p.subCategory === params.sub)?.subCategory ?? "")
      : "";
  const query = typeof params.q === "string" ? params.q : "";
  const onlyNew = params.filter === "new";
  // Homepage "See all N offers" deep-links here — pieces with a struck-through price.
  const onlySale = params.filter === "sale";
  // Batch J — the homepage rails deep-link here ("See all best sellers").
  const initialSort = resolveSort(params.sort);

  return (
    <>
      {/* P2.1 — the rows this page rendered seed the client registry, so the
          bag/search/quick-add resolve products without a second fetch. */}
      <CatalogHydrator products={products} categories={categories} shops={shops} zones={zones} />
      <ShopHeroHeader categories={categories} />
      {/* Renders nothing unless a drop window is actually open. */}
      <FlashRail limit={4} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <ShopBrowser
          products={products}
          categories={categories}
          shops={shops}
          zones={zones}
          initialCategory={category}
          initialSub={sub}
          initialNew={onlyNew}
          initialSale={onlySale}
          initialQuery={query}
          initialMood={resolveMood(params.mood)}
          initialPrice={params.price === "under500" ? "under500" : "any"}
          initialSort={initialSort}
        />
      </div>
      {/* Visual journal retained on the shop (removed from the short homepage). */}
      <BrandJournal />
    </>
  );
}
