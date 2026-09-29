import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product } from "./catalog";

export const SAVED_ITEMS_TABLE = "storefront_saved_items";

/** A stored row: pre-C5 rows carry the slug only, newer rows the piece too. */
export interface SavedItemRow {
  product_slug: string;
  product_id?: string | null;
}

/**
 * C5 — a slug is no longer enough to name a saved piece. Two shops may both
 * sell "cotton-panjabi", so a row that only remembers the name would light up
 * the other shop's piece as well. The row now carries the product id, which is
 * what identifies a piece everywhere else (reviews, price watches, orders).
 *
 * Slug-only rows still resolve by name: every one of them was written when a
 * slug named exactly one piece.
 */

/** Ids of the pieces a customer saved, oldest first, unknown rows dropped. */
export const wishlistIds = (
  rows: SavedItemRow[],
  products: Product[],
): string[] => {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const row of rows) {
    if (row.product_id) {
      // New row: if the piece left the serving catalog, drop it — never fall
      // back by name, because a different shop may own that same name now.
      if (byId.has(row.product_id) && !out.includes(row.product_id)) {
        out.push(row.product_id);
      }
      continue;
    }
    // Legacy row only: the slug was unique when this row was written.
    const match = products.find((p) => p.slug === row.product_slug);
    if (match && !out.includes(match.id)) out.push(match.id);
  }
  return out;
};

/** The rows to store for these product ids (unknown ids are skipped). */
export const savedItemRows = (
  ids: string[],
  products: Product[],
  customerId: string,
): { customer_id: string; product_slug: string; product_id: string }[] => {
  const out: { customer_id: string; product_slug: string; product_id: string }[] = [];
  for (const product of products) {
    if (!ids.includes(product.id)) continue;
    if (out.some((r) => r.product_id === product.id)) continue;
    out.push({
      customer_id: customerId,
      product_slug: product.slug,
      product_id: product.id,
    });
  }
  return out;
};

/** Kept for the slug-only callers (and for tests written before C5). */
export const wishlistSlugs = (ids: string[], products: Product[]) => [
  ...new Set(products.filter((p) => ids.includes(p.id)).map((p) => p.slug)),
];

export async function readAccountWishlist(
  client: SupabaseClient,
  userId: string,
  products: Product[],
): Promise<string[]> {
  const { data, error } = await client
    .from(SAVED_ITEMS_TABLE)
    .select("product_slug, product_id")
    .eq("customer_id", userId);
  if (error) throw error;
  return wishlistIds((data ?? []) as SavedItemRow[], products);
}

export async function saveAccountItems(
  client: SupabaseClient,
  userId: string,
  ids: string[],
  products: Product[],
) {
  const rows = savedItemRows(ids, products, userId);
  if (!rows.length) return;
  const { error } = await client
    .from(SAVED_ITEMS_TABLE)
    .upsert(rows, {
      onConflict: "customer_id,product_id",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

export async function removeAccountItems(
  client: SupabaseClient,
  userId: string,
  id: string | undefined,
  products: Product[],
) {
  let query = client.from(SAVED_ITEMS_TABLE).delete().eq("customer_id", userId);
  if (id) {
    const product = products.find((p) => p.id === id);
    if (!product) throw new Error("Unknown product");
    // The id when the row carries one, the name when it is an older row —
    // one delete has to clear both.
    query = query.or(
      `product_id.eq.${product.id},product_slug.eq.${product.slug}`,
    );
  }
  const { error } = await query;
  if (error) throw error;
}
