import { resolveMood } from "@/lib/merchandising";
import type { Metadata } from "next";
import {
  getStorefrontCatalog,
  getStorefrontZones,
} from "@/lib/db/storefront";
import ShopBrowser from "@/components/shop/shop-browser";
import ShopHeroHeader from "@/components/shop/shop-hero-header";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse the PROSANTI catalog — premium panjabi, shirts, three-piece, lungi and gamcha, with transparent pricing and rapid delivery.",
};

/**
 * Live rows when the backend serves them, seeds otherwise. Rendered on
 * demand: a statically prerendered seed page would show stale demo ids
 * and prices in live mode.
 */
export const dynamic = "force-dynamic";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[];
    filter?: string | string[];
    q?: string | string[];
    mood?: string | string[];
    price?: string | string[];
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
  const query = typeof params.q === "string" ? params.q : "";
  const onlyNew = params.filter === "new";

  return (
    <>
      <ShopHeroHeader categories={categories} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <ShopBrowser
          products={products}
          categories={categories}
          shops={shops}
          zones={zones}
          initialCategory={category}
          initialNew={onlyNew}
          initialQuery={query}
          initialMood={resolveMood(params.mood)}
          initialPrice={params.price === "under500" ? "under500" : "any"}
        />
      </div>
    </>
  );
}
