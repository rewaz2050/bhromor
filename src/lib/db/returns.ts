/**
 * Exchange / return pickups (P1 #13) — the rider reverse-logistics leg.
 *
 * All rules live in the database (ps_return_eligible /
 * ps_create_return_request / ps_return_action, migration
 * 202609140002_return_pickups.sql): 7 days from the proven 'delivered'
 * history entry, one live return per parent, zero-charge reverse order,
 * approve → 'ready-for-pickup' so the normal dispatch leg carries it.
 * This module only maps those rules to typed app errors.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "../orders";

export type ReturnReasonCode =
  | "not-found"
  | "not-delivered"
  | "window-expired"
  | "already-requested"
  | "no-delivery-record"
  | "unknown";

/** App-facing eligibility outcome for a customer request. */
export type ReturnEligibility =
  | { ok: true }
  | { ok: false; reason: ReturnReasonCode };

export interface ReturnRequestInput {
  orderNo: string;
  phone: string;
  reason: string;
  details: string;
}

export class ReturnRequestError extends Error {
  constructor(
    message: string,
    public readonly reason: ReturnReasonCode,
    public readonly status: number,
  ) {
    super(message);
  }
}

const reasonToEligibility = (raw: string | null): ReturnEligibility => {
  if (!raw) return { ok: false, reason: "unknown" };
  const code = raw.replace(/not eligible: /, "").trim();
  if (
    code === "not-delivered" ||
    code === "window-expired" ||
    code === "already-requested" ||
    code === "no-delivery-record"
  ) {
    return { ok: false, reason: code };
  }
  return { ok: false, reason: "unknown" };
};

/**
 * Create the customer's return/exchange request. The order number + phone
 * pairing is the same ownership proof the track page uses — a mismatched
 * phone answers "not-found", never "wrong phone".
 *
 * Returns the NEW return order (the pickup leg) on success.
 */
export async function createReturnRequest(
  db: SupabaseClient,
  input: ReturnRequestInput,
): Promise<{ orderId: string; orderNo: string }> {
  const orderNo = input.orderNo.trim().toUpperCase();
  const { data, error } = await db
    .from("orders")
    .select("id,order_no,customer_phone,status,is_return")
    .eq("order_no", orderNo)
    .maybeSingle();
  const row = data as
    | {
        id: string;
        order_no: string;
        customer_phone: string;
        status: string;
        is_return?: boolean;
      }
    | null;
  if (error || !row) {
    throw new ReturnRequestError(
      "No order found — double-check the order ID and the phone number you ordered with.",
      "not-found",
      404,
    );
  }
  if (normalizePhone(row.customer_phone) !== normalizePhone(input.phone)) {
    // Same deliberate vagueness as /api/track.
    throw new ReturnRequestError(
      "No order found — double-check the order ID and the phone number you ordered with.",
      "not-found",
      404,
    );
  }
  if (row.is_return) {
    throw new ReturnRequestError(
      "This order is itself a return pickup — there is nothing more to return.",
      "not-delivered",
      409,
    );
  }

  // Server is the single source of truth for the 7-day window.
  const { data: eligible, error: eligError } = await db.rpc("ps_return_eligible", {
    p_order_id: row.id,
  });
  const eligibility =
    eligError || eligible === null
      ? { ok: true as const }
      : reasonToEligibility(String(eligible));
  if (!eligibility.ok) {
    const messages: Record<string, string> = {
      "not-delivered": "This order has not been delivered yet.",
      "window-expired":
        "The 7-day exchange window for this order has ended.",
      "already-requested":
        "A return or exchange for this order is already in progress.",
      "no-delivery-record":
        "We cannot confirm the delivery date of this order — contact the shop.",
      unknown: "This order is not eligible for a return right now.",
    };
    throw new ReturnRequestError(
      messages[eligibility.reason] ??
        "This order is not eligible for a return right now.",
      eligibility.reason,
      409,
    );
  }

  const { data: newId, error: createError } = await db.rpc(
    "ps_create_return_request",
    {
      p_order_id: row.id,
      p_reason: input.reason.trim().slice(0, 120),
      p_details: input.details.trim().slice(0, 380),
    },
  );
  if (createError || !newId) {
    // ps_place_order re-validates the products; a delisted item fails here
    // and the shop handles that one manually.
    throw new ReturnRequestError(
      "We could not set up the pickup — the shop will contact you. Please use the contact page if it does not happen.",
      "unknown",
      503,
    );
  }
  const { data: created } = await db
    .from("orders")
    .select("order_no")
    .eq("id", newId)
    .maybeSingle();
  return {
    orderId: String(newId),
    orderNo: (created as { order_no: string } | null)?.order_no ?? "",
  };
}

/**
 * Shop decision on a requested return. Actions and their guarded effects
 * live in ps_return_action (approve → ready-for-pickup for dispatch,
 * reject → cancelled, complete → refunded).
 */
export async function performReturnAction(
  db: SupabaseClient,
  orderNo: string,
  action: "approve" | "reject" | "complete",
  note?: string,
): Promise<void> {
  const { data, error } = await db
    .from("orders")
    .select("id")
    .eq("order_no", orderNo.trim().toUpperCase())
    .maybeSingle();
  const row = data as { id: string } | null;
  if (error || !row) throw new Error("order not found");
  const { error: actionError } = await db.rpc("ps_return_action", {
    p_order_id: row.id,
    p_action: action,
    p_note: (note ?? "").trim().slice(0, 200),
  });
  if (actionError) {
    throw new Error(
      actionError.message.replace(/^.*raise exception /, "") ||
        "return action failed",
    );
  }
}
