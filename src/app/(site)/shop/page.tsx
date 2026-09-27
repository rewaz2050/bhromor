import { resolveMood } from "@/lib/merchandising";
import type { Metadata } from "next";
import {
  getStorefrontCatalog,
  getStorefrontZones,
} from "@/lib/db/storefront";
import ShopBrowser from "@/components/shop/shop-browser";
import { resolveSort } from "@/lib/shop-sort";
import { parseList, resolvePriceBand } from "@/lib/shop-url";
import CatalogHydrator from "@/components/shop/catalog-hydrator";
import BrandJournal from "@/components/shop/brand-journal";
import ShopHeroHeader from "@/components/shop/shop-hero-header";
import FlashRail from "@/components/promo/flash-rail";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse the PROSANTI catalog — premium panjabi, shirts, three-piece, lungi and gamcha, with transparent pricing and rapid delivery.",
  // The collection card (opengraph-image/route.tsx beside this page — file
  // conventions don't register inside a route group, upstream NEXT-1102).
  openGraph: {
    title: "Shop the PROSANTI collection",
    description:
      "Premium panjabi, shirts, three-piece, lungi and gamcha — at your door in Sunamganj, cash on delivery.",
    images: [
      {
        url: "/shop/opengraph-image",
        width: 1200,
        height: 630,
        alt: "The PROSANTI collection",
      },
    ],
  },
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
    size?: string | string[];
    color?: string | string[];
    stock?: string | string[];
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
  // UX plan §3 (R4) — the rest of the filter state the browser writes back
  // into the URL, so Back / reload / a shared link show the same list.
  const initialSizes = parseList(params.size);
  const initialColors = parseList(params.color);
  const initialInStock = params.stock === "1";

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
          initialPrice={resolvePriceBand(params.price)}
          initialSort={initialSort}
          initialSizes={initialSizes}
          initialColors={initialColors}
          initialInStock={initialInStock}
        />
      </div>
      {/* Visual journal retained on the shop (removed from the short homepage). */}
      <BrandJournal />
    </>
  );
}
