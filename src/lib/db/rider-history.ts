import "server-only";

/**
 * Rider trip history (Phase C): finished jobs (delivered or finally failed),
 * newest first, cursor-paged — the live feed (`listRiderJobs`) only ever holds
 * the latest 60 assignments. Self-scoped by rider id (service client + the
 * authenticated rider's id from the route context).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_PAGE, type RiderHistoryItem } from "../rider-history";

interface AssignmentRow {
  id: string;
  order_id: string;
  state: string;
  offered_at: string;
  delivered_at?: string | null;
  failed_reason?: string | null;
}

interface OrderRow {
  id: string;
  order_no: string | null;
  shop_id: string | null;
  area: string | null;
  total: number | string | null;
  payment: "cod" | "bkash" | "nagad" | null;
  is_return?: boolean | null;
}

const EARNED_KINDS = ["tip", "delivery_fee", "cod_handling", "incentive"];

export const listRiderHistory = async (
  service: SupabaseClient,
  riderId: string,
  opts: { before?: string | null; limit?: number } = {},
): Promise<{ items: RiderHistoryItem[]; nextCursor: string | null }> => {
  const limit = Math.min(60, Math.max(1, opts.limit ?? HISTORY_PAGE));
  let query = service
    .from("delivery_assignments")
    .select("*")
    .eq("rider_id", riderId)
    .in("state", ["delivered", "failed"])
    .order("offered_at", { ascending: false })
    .limit(limit + 1);
  if (opts.before) query = query.lt("offered_at", opts.before);
  const { data, error } = await query;
  if (error) throw new Error("rider history read failed");
  const all = (data ?? []) as AssignmentRow[];
  const rows = all.slice(0, limit);
  const nextCursor = all.length > limit ? (rows[rows.length - 1]?.offered_at ?? null) : null;
  if (rows.length === 0) return { items: [], nextCursor: null };

  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const [{ data: orderData, error: orderError }, { data: earnData, error: earnError }] = await Promise.all([
    service.from("orders").select("id,order_no,shop_id,area,total,payment,is_return").in("id", orderIds),
    service
      .from("rider_earnings")
      .select("order_id,amount,kind")
      .eq("rider_id", riderId)
      .in("order_id", orderIds)
      .in("kind", EARNED_KINDS),
  ]);
  if (orderError) throw new Error("rider history order read failed");
  // rider_earnings arrives with 202609300002; before it the history simply shows no amounts.
  const earnings = earnError ? [] : ((earnData ?? []) as { order_id: string; amount: number | string }[]);
  const earnedByOrder = new Map<string, number>();
  for (const e of earnings) earnedByOrder.set(e.order_id, (earnedByOrder.get(e.order_id) ?? 0) + Number(e.amount));

  const orders = new Map(((orderData ?? []) as OrderRow[]).map((o) => [o.id, o]));
  const shopIds = [...new Set([...orders.values()].flatMap((o) => (o.shop_id ? [o.shop_id] : [])))];
  const shopNames = new Map<string, string>();
  if (shopIds.length) {
    const { data: shopData } = await service.from("shops").select("id,name").in("id", shopIds);
    for (const s of (shopData ?? []) as { id: string; name: string }[]) shopNames.set(s.id, s.name);
  }

  const items: RiderHistoryItem[] = [];
  for (const row of rows) {
    const order = orders.get(row.order_id);
    if (!order) continue;
    const delivered = row.state === "delivered";
    const payment = order.payment ?? "cod";
    const isReturn = order.is_return === true;
    items.push({
      id: row.id,
      orderNo: order.order_no ?? row.order_id.slice(0, 8),
      outcome: delivered ? "delivered" : "failed",
      at: Date.parse((delivered ? row.delivered_at : null) ?? row.offered_at) || 0,
      cursor: row.offered_at,
      shopName: (order.shop_id && shopNames.get(order.shop_id)) || "",
      area: order.area ?? "",
      isReturn,
      payment,
      cash: delivered && payment === "cod" && !isReturn ? Number(order.total ?? 0) : 0,
      earned: earnedByOrder.get(row.order_id) ?? 0,
      ...(!delivered && row.failed_reason ? { failedReason: row.failed_reason } : {}),
    });
  }
  return { items, nextCursor };
};

/** Dhaka midnight (UTC+6, no DST) of the day containing `now`, as an ISO string. */
export const dhakaMidnightIso = (now: number = Date.now()): string => {
  const shifted = new Date(now + 6 * 3_600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 6 * 3_600_000).toISOString();
};

/**
 * Today's scoreboard (Dhaka day): deliveries completed and what they earned.
 * Decoration on top of real work — any failure (or a database where the
 * columns/tables are not migrated yet) simply omits the figure, never errors.
 */
export const getRiderToday = async (
  service: SupabaseClient,
  riderId: string,
  now: number = Date.now(),
): Promise<{ todayDeliveries?: number; todayEarned?: number }> => {
  const since = dhakaMidnightIso(now);
  const [deliveries, earnings] = await Promise.all([
    service
      .from("delivery_assignments")
      .select("id", { count: "exact", head: true })
      .eq("rider_id", riderId)
      .eq("state", "delivered")
      .gte("delivered_at", since),
    service
      .from("rider_earnings")
      .select("amount")
      .eq("rider_id", riderId)
      .in("kind", EARNED_KINDS)
      .gte("created_at", since),
  ]);
  const out: { todayDeliveries?: number; todayEarned?: number } = {};
  if (!deliveries.error && typeof deliveries.count === "number") out.todayDeliveries = deliveries.count;
  if (!earnings.error) {
    out.todayEarned = ((earnings.data ?? []) as { amount: number | string }[]).reduce((n, r) => n + Number(r.amount), 0);
  }
  return out;
};
