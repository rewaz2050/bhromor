/**
 * "এটার সাথে অন্যরা কিনেছেন" (UX plan §4, R11) — order co-occurrence.
 *
 * The pieces that most often sat in the SAME order as this one, ranked by
 * how many distinct non-cancelled orders paired them (ties by units). Real
 * baskets only — no seed, no "people also viewed" guesswork — so the rail
 * simply does not exist until a piece has been bought with others.
 *
 * Three small service-role reads, memoised per product for an hour in this
 * server instance: a product page is rendered on demand and must not pay
 * for the join every time. Any error → no rail (never a broken page).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product } from "@/lib/catalog";
import { isDiscoverable } from "@/lib/merchandising";
import { getSupabaseService } from "@/lib/supabase-server";

export const ALSO_BOUGHT_TTL_MS = 60 * 60 * 1000;
const MAX_SOURCE_ROWS = 400;
const MAX_CACHE = 500;

export interface AlsoBoughtEntry {
  productId: string;
  /** Distinct orders that held both pieces. */
  orders: number;
  /** Units of the paired piece across those orders. */
  units: number;
}

const cache = new Map<string, { at: number; entries: AlsoBoughtEntry[] }>();

export const __resetAlsoBought = (): void => cache.clear();

/** Pure ranking — exported for tests and reuse. */
export const rankCoPurchases = (
  productId: string,
  rows: readonly { order_id: string; product_id: string; qty: number | null }[],
  validOrderIds: ReadonlySet<string>,
  limit: number,
): AlsoBoughtEntry[] => {
  const seen = new Map<string, { orders: Set<string>; units: number }>();
  for (const row of rows) {
    if (row.product_id === productId || !validOrderIds.has(row.order_id)) continue;
    const entry = seen.get(row.product_id) ?? { orders: new Set<string>(), units: 0 };
    entry.orders.add(row.order_id);
    entry.units += Math.max(1, Math.floor(Number(row.qty) || 1));
    seen.set(row.product_id, entry);
  }
  return [...seen.entries()]
    .map(([id, e]) => ({ productId: id, orders: e.orders.size, units: e.units }))
    .sort((a, b) => b.orders - a.orders || b.units - a.units || a.productId.localeCompare(b.productId))
    .slice(0, limit);
};

export async function alsoBought(
  db: SupabaseClient,
  productId: string,
  limit = 8,
  now: number = Date.now(),
): Promise<AlsoBoughtEntry[]> {
  const hit = cache.get(productId);
  if (hit && now - hit.at < ALSO_BOUGHT_TTL_MS) return hit.entries.slice(0, limit);
  let entries: AlsoBoughtEntry[] = [];
  try {
    const { data: mine, error: mineError } = await db
      .from("order_items")
      .select("order_id")
      .eq("product_id", productId)
      .limit(MAX_SOURCE_ROWS);
    if (mineError) return [];
    const orderIds = [...new Set(((mine ?? []) as { order_id: string }[]).map((r) => r.order_id))];
    if (orderIds.length === 0) {
      remember(productId, [], now);
      return [];
    }
    const [{ data: orders, error: ordersError }, { data: items, error: itemsError }] = await Promise.all([
      db.from("orders").select("id, status").in("id", orderIds),
      db.from("order_items").select("order_id, product_id, qty").in("order_id", orderIds),
    ]);
    if (ordersError || itemsError) return [];
    const valid = new Set(
      ((orders ?? []) as { id: string; status: string }[])
        .filter((o) => o.status !== "cancelled")
        .map((o) => o.id),
    );
    entries = rankCoPurchases(
      productId,
      (items ?? []) as { order_id: string; product_id: string; qty: number | null }[],
      valid,
      Math.max(limit, 8),
    );
  } catch {
    return [];
  }
  remember(productId, entries, now);
  return entries.slice(0, limit);
}

const remember = (productId: string, entries: AlsoBoughtEntry[], at: number): void => {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(productId, { at, entries });
};

/**
 * The product page's view: co-purchased pieces that are still on the shelf
 * (published, in stock), in co-purchase order, at most four. No service
 * role / any error → none (the rail then simply does not render).
 */
export async function alsoBoughtProducts(
  productId: string,
  products: readonly Product[],
  limit = 4,
): Promise<Product[]> {
  const db = getSupabaseService();
  if (!db) return [];
  try {
    const entries = await alsoBought(db, productId, Math.max(8, limit * 2));
    const byId = new Map(products.map((p) => [p.id, p]));
    return entries
      .map((e) => byId.get(e.productId))
      .filter((p): p is Product => !!p && p.id !== productId && isDiscoverable(p) && p.inStock)
      .slice(0, limit);
  } catch {
    return [];
  }
}
