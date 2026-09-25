import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getStorefrontCatalog, getStorefrontZones } from "@/lib/db/storefront";
import { readHomepageSetting } from "@/lib/db/engagement";
import { getSupabaseAnon } from "@/lib/supabase-server";
import { HOME_DEFAULTS } from "@/lib/home-cms";
import { CACHE_TAG_HOMEPAGE, PUBLIC_CACHE_SECONDS } from "@/lib/public-cache";
import CatalogHydrator from "@/components/shop/catalog-hydrator";
import HomeSettingsHydrator from "@/components/home/home-settings-hydrator";
import HomeClient from "./home-client";

export const metadata: Metadata = {
  title: "PROSANTI — Premium Panjabi, Shirts & More in Sunamganj",
  description:
    "Shop premium panjabi, shirts, three-piece, lungi and gamcha — cash on delivery across Sunamganj with rapid dispatch and easy returns.",
  openGraph: {
    title: "PROSANTI — Wear Bangladesh",
    description:
      "Premium panjabi, shirts and more — at your door in Sunamganj, cash on delivery.",
  },
};

/**
 * ISR: the shelf re-renders at most once a minute, so visitors get HTML
 * with live rows baked in (no /api/products + /api/homepage waterfall on
 * first paint). The client stores hydrate from the same rows pre-paint,
 * so the bag, search and shelf never flash empty-or-default.
 */
export const revalidate = 60;

const getPublishedHomepage = unstable_cache(
  async () => {
    const db = getSupabaseAnon();
    if (!db) return HOME_DEFAULTS;
    try {
      return await readHomepageSetting(db);
    } catch {
      return HOME_DEFAULTS;
    }
  },
  ["homepage-v1"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [CACHE_TAG_HOMEPAGE] },
);

export default async function Home() {
  const [{ products, categories, shops }, { zones }, settings] = await Promise.all([
    getStorefrontCatalog(),
    getStorefrontZones(),
    getPublishedHomepage(),
  ]);
  return (
    <>
      <CatalogHydrator products={products} categories={categories} shops={shops} zones={zones} />
      <HomeSettingsHydrator settings={settings} />
      <HomeClient />
    </>
  );
}
