import "server-only";

/**
 * Delivery feedback persistence (item X, 202610020009). Everything uses the
 * service client — `delivery_ratings` is RLS-closed so customers stay
 * anonymous to riders — so every caller must have proven who is asking
 * (phone-verified customer, session rider, or staff) before calling in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbObject } from "./riders";
import type { FeedbackInput, StaffFeedbackRow } from "../delivery-feedback";

export type SaveFeedbackResult =
  | { status: "saved"; riderId: string; stars: number }
  | { status: "already" }
  | { status: "no-rating" }
  | { status: "unavailable" };

/** Feedback can be given ONCE per rated order (the update only matches while `feedback_at` is null). */
export const saveDeliveryFeedback = async (
  service: SupabaseClient,
  orderId: string,
  input: FeedbackInput,
  now: number = Date.now(),
): Promise<SaveFeedbackResult> => {
  const { data, error } = await service
    .from("delivery_ratings")
    .update({ tags: input.tags, comment: input.comment === "" ? null : input.comment, feedback_at: new Date(now).toISOString() })
    .eq("order_id", orderId)
    .is("feedback_at", null)
    .select("rider_id, stars");
  if (error) {
    if (isMissingDbObject(error)) return { status: "unavailable" };
    throw new Error("delivery feedback write failed");
  }
  const row = ((data ?? []) as { rider_id: string; stars: number }[])[0];
  if (row) return { status: "saved", riderId: row.rider_id, stars: Number(row.stars) };

  const { data: existing, error: readError } = await service
    .from("delivery_ratings")
    .select("order_id")
    .eq("order_id", orderId)
    .limit(1);
  if (readError) throw new Error("delivery feedback read failed");
  return ((existing ?? []) as unknown[]).length > 0 ? { status: "already" } : { status: "no-rating" };
};

interface FeedbackDbRow {
  order_id: string;
  rider_id: string;
  stars: number;
  tags: string[] | null;
  comment: string | null;
  hidden_from_rider: boolean | null;
  feedback_at: string | null;
  created_at: string;
}

/**
 * Newest ratings first, for the staff board. `null` when the migration has
 * not run (the page then says what to do).
 */
export const listFeedbackForStaff = async (
  service: SupabaseClient,
  opts: { maxStars?: number; onlyWithFeedback?: boolean; limit?: number } = {},
): Promise<StaffFeedbackRow[] | null> => {
  let query = service
    .from("delivery_ratings")
    .select("order_id, rider_id, stars, tags, comment, hidden_from_rider, feedback_at, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, opts.limit ?? 100)));
  if (opts.maxStars && opts.maxStars < 5) query = query.lte("stars", opts.maxStars);
  if (opts.onlyWithFeedback) query = query.not("feedback_at", "is", null);
  const { data, error } = await query;
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error("delivery feedback list failed");
  }
  const rows = (data ?? []) as FeedbackDbRow[];
  if (rows.length === 0) return [];

  const [{ data: riders }, { data: orders }] = await Promise.all([
    service.from("riders").select("id, name").in("id", [...new Set(rows.map((r) => r.rider_id))]),
    service.from("orders").select("id, order_no").in("id", [...new Set(rows.map((r) => r.order_id))]),
  ]);
  const riderName = new Map(((riders ?? []) as { id: string; name: string | null }[]).map((r) => [r.id, r.name ?? ""]));
  const orderNo = new Map(((orders ?? []) as { id: string; order_no: string | null }[]).map((o) => [o.id, o.order_no ?? ""]));

  return rows.map((r) => ({
    orderId: r.order_id,
    orderNo: orderNo.get(r.order_id) ?? "",
    riderId: r.rider_id,
    riderName: riderName.get(r.rider_id) ?? "",
    stars: Number(r.stars),
    tags: Array.isArray(r.tags) ? r.tags : [],
    comment: r.comment ?? "",
    hidden: r.hidden_from_rider === true,
    at: Date.parse(r.created_at) || 0,
    hasFeedback: r.feedback_at != null,
  }));
};

/** Staff: keep a comment from the rider (or bring it back). False when no such rating. */
export const setFeedbackHidden = async (
  service: SupabaseClient,
  orderId: string,
  hidden: boolean,
): Promise<boolean> => {
  const { data, error } = await service
    .from("delivery_ratings")
    .update({ hidden_from_rider: hidden })
    .eq("order_id", orderId)
    .select("order_id");
  if (error) {
    if (isMissingDbObject(error)) return false;
    throw new Error("delivery feedback update failed");
  }
  return ((data ?? []) as unknown[]).length > 0;
};
