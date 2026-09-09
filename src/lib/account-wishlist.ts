import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTS, type Product } from "./catalog";

export const SAVED_ITEMS_TABLE = "storefront_saved_items";

/**
 * Slugs bridge the mock p1/p2 IDs and the live UUID catalogue. Callers pass
 * the serving product list (live rows when cut over); seeds stay default.
 */
export const wishlistSlugs = (ids: string[], products: Product[] = PRODUCTS) => [
  ...new Set(products.filter((p) => ids.includes(p.id)).map((p) => p.slug)),
];
export const wishlistIds = (
  rows: { product_slug: string }[],
  products: Product[] = PRODUCTS,
) =>
  products
    .filter((p) => rows.some((r) => r.product_slug === p.slug))
    .map((p) => p.id);

export async function readAccountWishlist(
  client: SupabaseClient,
  userId: string,
  products: Product[] = PRODUCTS,
): Promise<string[]> {
  const { data, error } = await client
    .from(SAVED_ITEMS_TABLE)
    .select("product_slug")
    .eq("customer_id", userId);
  if (error) throw error;
  return wishlistIds(data ?? [], products);
}

export async function saveAccountItems(
  client: SupabaseClient,
  userId: string,
  ids: string[],
  products: Product[] = PRODUCTS,
) {
  const rows = wishlistSlugs(ids, products).map((product_slug) => ({
    customer_id: userId,
    product_slug,
  }));
  if (!rows.length) return;
  const { error } = await client
    .from(SAVED_ITEMS_TABLE)
    .upsert(rows, {
      onConflict: "customer_id,product_slug",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

export async function removeAccountItems(
  client: SupabaseClient,
  userId: string,
  id?: string,
  products: Product[] = PRODUCTS,
) {
  let query = client.from(SAVED_ITEMS_TABLE).delete().eq("customer_id", userId);
  if (id) {
    const slug = wishlistSlugs([id], products)[0];
    if (!slug) throw new Error("Unknown product");
    query = query.eq("product_slug", slug);
  }
  const { error } = await query;
  if (error) throw error;
}
