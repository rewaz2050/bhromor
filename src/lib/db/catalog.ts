/**
 * Server-side catalog reads (blueprint §41–44).
 *
 * Returns null when Supabase is not configured so API routes can fall back
 * to the demo seeds honestly (response carries `source: "demo"`).
 * Public reads use the RLS-respecting server client — only published +
 * active rows are visible, enforced by the database, not by trust.
 */

import "server-only";

import { getSupabaseServer } from "../supabase-server";
import { mapCategory, mapProduct, mapZone, type ProductRowBundle } from "./mappers";
import type {
  Category,
  DeliveryZone,
  Product,
} from "../catalog";
import type {
  DbCategory,
  DbMedia,
  DbProduct,
  DbVariant,
  DbZone,
} from "./types";

export interface LiveCatalog {
  products: Product[];
  categories: Category[];
  zones: DeliveryZone[];
}

const toBundle = (
  product: DbProduct,
  variants: DbVariant[],
  media: DbMedia[],
): ProductRowBundle => ({
  product,
  variants: variants.filter((v) => v.product_id === product.id),
  media: media.filter((m) => m.product_id === product.id),
});

/**
 * Published storefront catalog from Supabase.
 * Null = backend not configured OR reachable-but-empty (routes then serve
 * demo seeds and say so; an empty DB must never render an empty shop).
 */
export async function fetchLiveCatalog(): Promise<LiveCatalog | null> {
  const db = await getSupabaseServer();
  if (!db) return null;

  const [productsRes, variantsRes, mediaRes, categoriesRes, zonesRes] =
    await Promise.all([
      db
        .from("products")
        .select("*")
        .eq("status", "published")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      db.from("product_variants").select("*").eq("active", true),
      db.from("product_media").select("*").order("sort_order"),
      db.from("categories").select("*").eq("active", true).order("sort_order"),
      db
        .from("delivery_zones")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
    ]);

  if (
    productsRes.error ||
    variantsRes.error ||
    mediaRes.error ||
    categoriesRes.error ||
    zonesRes.error
  ) {
    throw new Error("catalog read failed");
  }

  const products = ((productsRes.data ?? []) as DbProduct[]).map((p) =>
    mapProduct(toBundle(p, (variantsRes.data ?? []) as DbVariant[], (mediaRes.data ?? []) as DbMedia[])),
  );
  if (products.length === 0) return null;

  return {
    products,
    categories: ((categoriesRes.data ?? []) as DbCategory[]).map(mapCategory),
    zones: ((zonesRes.data ?? []) as DbZone[]).map(mapZone),
  };
}
