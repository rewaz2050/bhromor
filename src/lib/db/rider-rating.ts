import "server-only";

/**
 * A rider's own ratings (202609250008 `delivery_ratings`), read through the
 * service client scoped to the session rider. Null = table not migrated.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbObject } from "./riders";
import type { RiderFeedbackRow } from "../delivery-feedback";
import { summarizeRatings, type RatingRow, type RatingSummary } from "../rider-rating";

export const getRiderRatingSummary = async (
  service: SupabaseClient,
  riderId: string,
  now: number = Date.now(),
): Promise<RatingSummary | null> => {
  type Row = {
    order_id: string;
    stars: number;
    created_at: string;
    tags?: string[] | null;
    comment?: string | null;
    hidden_from_rider?: boolean | null;
    feedback_at?: string | null;
  };
  const read = (cols: string) =>
    service
      .from("delivery_ratings")
      .select(cols)
      .eq("rider_id", riderId)
      .order("created_at", { ascending: false })
      .limit(500);
  // The feedback columns (202610020009) may not exist yet: fall back to stars only.
  let result = await read("order_id, stars, created_at, tags, comment, hidden_from_rider, feedback_at");
  if (result.error && isMissingDbObject(result.error)) result = await read("order_id, stars, created_at");
  const { data, error } = result;
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error("rider ratings read failed");
  }
  const rows = (data ?? []) as unknown as Row[];
  const rated: (RatingRow & { orderId: string })[] = rows.map((r) => ({
    orderId: r.order_id,
    stars: Number(r.stars),
    at: Date.parse(r.created_at) || 0,
  }));
  const summary = summarizeRatings(rated, now);
  // What the rider may read: feedback that exists and staff have not hidden.
  const visible = rows
    .filter((r) => r.feedback_at && r.hidden_from_rider !== true && ((r.tags ?? []).length > 0 || (r.comment ?? "") !== ""))
    .slice(0, 5);
  // Order numbers only for the few rows we will actually show.
  const lowIds = [...summary.low.map((l) => l.orderId), ...visible.map((r) => r.order_id)];
  const noById = new Map<string, string>();
  if (lowIds.length > 0) {
    const { data: orders } = await service
      .from("orders")
      .select("id, order_no")
      .in("id", [...new Set(lowIds)]);
    for (const o of (orders ?? []) as { id: string; order_no: string | null }[]) noById.set(o.id, o.order_no ?? "");
    for (const l of summary.low) l.orderNo = noById.get(l.orderId) || undefined;
  }
  const feedback: RiderFeedbackRow[] = visible.map((r) => ({
    stars: Number(r.stars),
    at: Date.parse(r.created_at) || 0,
    ...(noById.get(r.order_id) ? { orderNo: noById.get(r.order_id) } : {}),
    tags: r.tags ?? [],
    comment: r.comment ?? "",
  }));
  return {
    ...summary,
    low: summary.low.map(({ stars, at, orderNo }) => ({ stars, at, ...(orderNo ? { orderNo } : {}) })),
    feedback,
  };
};
