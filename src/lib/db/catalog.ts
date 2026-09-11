/**
 * Server-side catalog reads (blueprint §41–44).
 *
 * Returns null when Supabase is not configured or the catalog is empty.
 * Public reads use the RLS-respecting server client — only published +
 * active rows are visible, enforced by the database, not by trust.
 */

import "server-only";

import { getSupabaseServer } from "../supabase-server";
import { mapCategory, mapProduct, mapShop, mapZone, type ProductRowBundle } from "./mappers";
import type {
  Category,
  DeliveryZone,
  Product,
  Shop,
} from "../catalog";
import { toPublicShop } from "../shop-utils";
import type {
  DbCategory,
  DbMedia,
  DbProduct,
  DbShop,
  DbVariant,
  DbZone,
} from "./types";

export interface LiveCatalog {
  products: Product[];
  categories: Category[];
  zones: DeliveryZone[];
  /** Active shops (staff-only fields stripped) for zone-scoped discovery. */
  shops: Shop[];
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
 * Null = backend not configured OR reachable-but-empty.
 */
export async function fetchLiveCatalog(): Promise<LiveCatalog | null> {
  const db = await getSupabaseServer();
  if (!db) return null;

  const [productsRes, variantsRes, mediaRes, categoriesRes, zonesRes, shopsRes] =
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
      // Public read policy exposes active shops only; the strip below is
      // defence-in-depth so contact emails can never leak.
      db.from("shops").select("*").eq("status", "active").order("name"),
    ]);

  if (
    productsRes.error ||
    variantsRes.error ||
    mediaRes.error ||
    categoriesRes.error ||
    zonesRes.error ||
    shopsRes.error
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
    shops: ((shopsRes.data ?? []) as DbShop[]).map(mapShop).map(toPublicShop),
  };
}
