import type { Metadata } from "next";
import { getStorefrontCatalog, getStorefrontZones } from "@/lib/db/storefront";
import CatalogHydrator from "@/components/shop/catalog-hydrator";
import OffersHub from "@/components/offers/offers-hub";

export const metadata: Metadata = {
  title: "Offers",
  description:
    "Every PROSANTI saving in one place — marked-down pieces, the running drop, the public code and the set of the week. Cash on delivery in Sunamganj.",
};

/** Live rows: prices and compare-at prices must be today's, never a build's. */
export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const [{ products, categories, shops }, { zones }] = await Promise.all([
    getStorefrontCatalog(),
    getStorefrontZones(),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <CatalogHydrator products={products} categories={categories} shops={shops} zones={zones} />
      <OffersHub pool={products} />
    </div>
  );
}
