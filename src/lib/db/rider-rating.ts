import "server-only";

/**
 * A rider's own ratings (202609250008 `delivery_ratings`), read through the
 * service client scoped to the session rider. Null = table not migrated.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbObject } from "./riders";
import { summarizeRatings, type RatingRow, type RatingSummary } from "../rider-rating";

export const getRiderRatingSummary = async (
  service: SupabaseClient,
  riderId: string,
  now: number = Date.now(),
): Promise<RatingSummary | null> => {
  const { data, error } = await service
    .from("delivery_ratings")
    .select("order_id, stars, created_at")
    .eq("rider_id", riderId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error("rider ratings read failed");
  }
  const rows = (data ?? []) as { order_id: string; stars: number; created_at: string }[];
  const rated: (RatingRow & { orderId: string })[] = rows.map((r) => ({
    orderId: r.order_id,
    stars: Number(r.stars),
    at: Date.parse(r.created_at) || 0,
  }));
  const summary = summarizeRatings(rated, now);
  // Order numbers only for the few low-star rows we will actually show.
  if (summary.low.length > 0) {
    const { data: orders } = await service
      .from("orders")
      .select("id, order_no")
      .in("id", summary.low.map((l) => l.orderId));
    const noById = new Map(((orders ?? []) as { id: string; order_no: string | null }[]).map((o) => [o.id, o.order_no ?? ""]));
    for (const l of summary.low) l.orderNo = noById.get(l.orderId) || undefined;
  }
  return { ...summary, low: summary.low.map(({ stars, at, orderNo }) => ({ stars, at, ...(orderNo ? { orderNo } : {}) })) };
};
