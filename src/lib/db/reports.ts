/**
 * Server-side sales reporting (P2 #4).
 *
 * The Reports page's "Top products" is computed client-side from the staff
 * order queue — capped at 100 orders, and it cannot see the refunded-return
 * correction. This module reads the same source the storefront shows —
 * v_product_sales (P2 #1) — so the shop owner can verify the exact ranking
 * and "N sold" figures customers see, plus the revenue those units made.
 *
 * Eligibility mirrors the view exactly: non-cancelled orders count, and a
 * return order's units subtract only once the shop has completed it
 * (return_status = 'refunded').
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bdt } from "../format";

export interface BestSellerRow {
  productId: string;
  name: string;
  slug: string;
  /** All-time eligible units — the storefront's "N sold" figure. */
  units: number;
  /** Same eligibility, orders created in the last 30 days. */
  last30Units: number;
  /** Revenue on eligible, non-return units (return rows price at 0). */
  revenue: Bdt;
  /** Distinct non-cancelled, non-return orders that contain the product. */
  orderCount: number;
}

type ViewRow = { product_id: string; units_sold: number };
type ProductRow = { id: string; name: string; slug: string };
type OrderItemRow = {
  product_id: string;
  qty: number;
  unit_price: number;
  orders?:
    | {
        id: string;
        status: string;
        is_return: boolean | null;
        return_parent_id: string | null;
        return_status: string | null;
        created_at: string;
      }
    | {
        id: string;
        status: string;
        is_return: boolean | null;
        return_parent_id: string | null;
        return_status: string | null;
        created_at: string;
      }[]
    | null;
};

const orderOf = (row: OrderItemRow) => {
  const o = row.orders;
  if (!o) return null;
  const first = Array.isArray(o) ? o[0] : o;
  return first ?? null;
};

/** A line counts against sales exactly when the view would. */
const eligibleSign = (o: NonNullable<ReturnType<typeof orderOf>>): 1 | -1 | 0 => {
  if (o.status === "cancelled") return 0;
  if (o.is_return === true) return o.return_status === "refunded" ? -1 : 0;
  return 1;
};

export async function bestSellers(
  db: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<BestSellerRow[]> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 10));
  const { data: view, error } = await db
    .from("v_product_sales")
    .select("product_id, units_sold")
    .order("units_sold", { ascending: false })
    .limit(limit);
  if (error) return [];
  const rows = (view ?? []) as ViewRow[];
  const ids = rows.map((r) => r.product_id).filter(Boolean);
  if (ids.length === 0) return [];

  const [productsRes, itemsRes] = await Promise.all([
    db.from("products").select("id,name,slug").in("id", ids),
    db
      .from("order_items")
      .select("product_id,qty,unit_price,orders(id,status,is_return,return_parent_id,return_status,created_at)")
      .in("product_id", ids),
  ]);
  if (productsRes.error) return [];
  // A failed line read means the money columns are unknown — an empty list
  // is the honest answer, never a table of zeroed revenue.
  if (itemsRes.error) return [];

  const productById = new Map(
    ((productsRes.data ?? []) as ProductRow[]).map((p) => [p.id, p]),
  );
  const now = Date.now();
  const cutoff = now - 30 * 86_400_000;

  const byProduct = new Map<
    string,
    { units: number; last30Units: number; revenue: Bdt; orders: Set<string> }
  >();
  const ensure = (id: string) => {
    let row = byProduct.get(id);
    if (!row) {
      row = { units: 0, last30Units: 0, revenue: 0, orders: new Set() };
      byProduct.set(id, row);
    }
    return row;
  };
  // Seed from the view so a product whose lines are all returned still
  // appears with an honest (possibly 0) figure, in the view's rank order.
  for (const r of rows) ensure(r.product_id);
  for (const item of (itemsRes.data ?? []) as OrderItemRow[]) {
    const o = orderOf(item);
    if (!o) continue;
    const sign = eligibleSign(o);
    if (sign === 0) continue;
    const row = ensure(item.product_id);
    const created = Date.parse(o.created_at);
    if (sign === 1 && o.is_return !== true) row.orders.add(o.id);
    row.units += sign * item.qty;
    if (Number.isFinite(created) && created >= cutoff) row.last30Units += sign * item.qty;
    row.revenue += sign * item.unit_price * item.qty;
  }

  return rows
    .map((r) => {
      const p = productById.get(r.product_id);
      if (!p) return null; // product removed out from under the view
      const agg = byProduct.get(r.product_id)!;
      return {
        productId: r.product_id,
        name: p.name,
        slug: p.slug,
        units: r.units_sold,
        last30Units: Math.max(0, agg.last30Units),
        revenue: Math.max(0, agg.revenue),
        orderCount: agg.orders.size,
      };
    })
    .filter((r): r is BestSellerRow => r !== null);
}

/* ------------------------------------------------------------------ */
/* First-party funnel (UX plan §0)                                     */
/* ------------------------------------------------------------------ */

import { parseFunnelReport, type FunnelReport } from "../funnel-events";

/** Thrown when migration 202609260004 (ps_funnel_report) is not installed. */
export class FunnelReportMissingError extends Error {
  constructor() {
    super("ps_funnel_report is not installed — run migration 202609260004_storefront_events.sql");
    this.name = "FunnelReportMissingError";
  }
}

/**
 * One call to ps_funnel_report(p_days) → the typed report the Reports page
 * prints. The SQL does all the counting (distinct sessions per step, real
 * orders from `orders`), so this is cheap even with a few hundred thousand
 * event rows.
 */
export async function funnelReport(db: SupabaseClient, days: 7 | 28): Promise<FunnelReport> {
  const { data, error } = await db.rpc("ps_funnel_report", { p_days: days });
  if (error) {
    const code = (error as { code?: string }).code ?? "";
    const message = (error as { message?: string }).message ?? "";
    if (
      code === "PGRST202" ||
      code === "42883" ||
      code === "42P01" ||
      /function .*ps_funnel_report.* does not exist/i.test(message) ||
      /relation .*storefront_events.* does not exist/i.test(message)
    ) {
      throw new FunnelReportMissingError();
    }
    throw new Error(message || "funnel report failed");
  }
  return parseFunnelReport(data, days);
}
