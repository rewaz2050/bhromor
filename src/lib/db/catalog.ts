/**
 * Server-side catalog reads (blueprint §41–44).
 *
 * Returns null when Supabase is not configured or the catalog is empty.
 * Public reads use the anon RLS client — only published + active rows are
 * visible, enforced by the database, not by trust.
 */

import "server-only";

import { unstable_cache } from "next/cache";
import { getSupabaseAnon } from "../supabase-server";
import { mapCategory, mapProduct, mapShop, mapZone, type ProductRowBundle } from "./mappers";
import {
  CACHE_TAG_CATALOG,
  CACHE_TAG_SHOPS,
  CACHE_TAG_ZONES,
  PUBLIC_CACHE_SECONDS,
} from "../public-cache";
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
 *
 * Perf (audit 2026-09-17 P1.2): the seven-query read is wrapped in the Next
 * data cache for `PUBLIC_CACHE_SECONDS`, tagged so admin/vendor catalog
 * writes (`revalidateCatalogCaches`) rebuild it on the next request. The
 * storefront pages (`/`, `/shop`, `/product/[slug]`, `/api/products`) all
 * share ONE cached copy instead of each re-reading the whole catalog.
 *
 * The read goes through the cookie-less anon client, so the cache entry is
 * exactly what an anonymous visitor may see (published + active only) no
 * matter who warmed it — and `cookies()` is never touched inside the cache
 * scope (Next forbids dynamic sources there).
 */
export async function fetchLiveCatalog(): Promise<LiveCatalog | null> {
  try {
    return await cachedLiveCatalog();
  } catch (err) {
    // No incremental cache in this context (tests, CLI) → read directly. A
    // real read failure is re-thrown by readLiveCatalog itself.
    if (isCacheInfraError(err)) return readLiveCatalog();
    throw err;
  }
}

const isCacheInfraError = (err: unknown): boolean =>
  err instanceof Error && /incrementalCache|static generation store/i.test(err.message);

const cachedLiveCatalog = unstable_cache(
  async () => readLiveCatalog(),
  ["live-catalog-v1"],
  {
    revalidate: PUBLIC_CACHE_SECONDS,
    tags: [CACHE_TAG_CATALOG, CACHE_TAG_ZONES, CACHE_TAG_SHOPS],
  },
);

/** The uncached read — one round of seven parallel queries. */
export async function readLiveCatalog(): Promise<LiveCatalog | null> {
  const db = getSupabaseAnon();
  if (!db) return null;

  const [productsRes, variantsRes, mediaRes, categoriesRes, zonesRes, shopsRes, salesRes] =
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
      // P2 #1 — real sales per product (v_product_sales). A hiccup here must
      // not kill the catalog: sales are a badge, not the store.
      db.from("v_product_sales").select("product_id, units_sold"),
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

  const unitsSoldByProduct = new Map<string, number>(
    ((salesRes.data ?? []) as { product_id: string; units_sold: number }[]).map(
      (r) => [r.product_id, r.units_sold],
    ),
  );
  const products = ((productsRes.data ?? []) as DbProduct[]).map((p) => {
    const mapped = mapProduct(toBundle(p, (variantsRes.data ?? []) as DbVariant[], (mediaRes.data ?? []) as DbMedia[]));
    const units = unitsSoldByProduct.get(p.id);
    return units === undefined ? mapped : { ...mapped, unitsSold: units };
  });
  if (products.length === 0) return null;

  return {
    products,
    categories: ((categoriesRes.data ?? []) as DbCategory[]).map(mapCategory),
    zones: ((zonesRes.data ?? []) as DbZone[]).map(mapZone),
    shops: ((shopsRes.data ?? []) as DbShop[]).map(mapShop).map(toPublicShop),
  };
}
