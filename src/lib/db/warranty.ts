/**
 * Warranty claims (P1 #14) — order-bound, shop-decided.
 *
 * Warranty is a per-product attribute (products.warranty_days, set on
 * accessories in the product editor). A claim proves what the customer
 * actually bought: order number + phone (the track page's ownership proof),
 * the item must be on that order, delivered, inside the product's window
 * from the proven delivery moment — all enforced by ps_warranty_eligible
 * (migration 202609140003). The shop then reviews → approves/rejects with a
 * note; the replacement or refund itself is the shop's offline handling,
 * recorded in the claim's resolution note.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "../orders";

export type WarrantyClaimStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected";

export interface WarrantyClaim {
  id: string;
  productId: string;
  orderNo: string;
  productName: string;
  customerName: string;
  customerPhone: string;
  problem: string;
  status: WarrantyClaimStatus;
  resolution?: string;
  createdAt: number;
  decidedAt?: number;
}

export class WarrantyError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const EPOCH = (v: string | null | undefined): number | undefined =>
  v ? new Date(v).getTime() : undefined;

/** Supabase nested-select row shape (orders(order_no), products(name)). */
export interface WarrantyClaimRow {
  id: string;
  product_id: string;
  customer_name: string;
  customer_phone: string;
  problem: string;
  status: string;
  resolution: string | null;
  created_at: string;
  decided_at: string | null;
  orders: { order_no: string } | null;
  products: { name: string } | null;
}

const mapClaim = (row: WarrantyClaimRow): WarrantyClaim => ({
  id: row.id,
  productId: row.product_id,
  orderNo: row.orders?.order_no ?? "",
  productName: row.products?.name ?? "",
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  problem: row.problem,
  status: row.status as WarrantyClaimStatus,
  resolution: row.resolution ?? undefined,
  createdAt: EPOCH(row.created_at) ?? 0,
  decidedAt: EPOCH(row.decided_at),
});

const asRows = (data: unknown): WarrantyClaimRow[] =>
  (data ?? []) as WarrantyClaimRow[];

const CLAIM_SELECT =
  "id,product_id,created_at,decided_at,problem,status,resolution,customer_name,customer_phone,orders(order_no),products(name)";

/** Admin list: newest first. Optional status / order_no filters. */
export async function listWarrantyClaims(
  db: SupabaseClient,
  opts?: { status?: WarrantyClaimStatus; orderNo?: string },
): Promise<WarrantyClaim[]> {
  let query = db
    .from("warranty_claims")
    .select(CLAIM_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.orderNo) {
    query = query.eq("orders.order_no", opts.orderNo);
  }
  const { data, error } = await query;
  if (error) throw new Error("warranty claim list failed");
  return asRows(data).map(mapClaim);
}

/** Claims for one order (the track page + the admin order detail). */
export async function claimsForOrder(
  db: SupabaseClient,
  orderId: string,
): Promise<WarrantyClaim[]> {
  const { data, error } = await db
    .from("warranty_claims")
    .select(CLAIM_SELECT)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("warranty claims read failed");
  return asRows(data).map(mapClaim);
}

export interface WarrantyClaimInput {
  orderNo: string;
  phone: string;
  productId: string;
  problem: string;
}

/**
 * Customer-side claim. Same ownership proof as tracking: the order number
 * must exist and the phone must match, or the answer is the same vague
 * "not found" — never "wrong phone".
 */
export async function createWarrantyClaim(
  db: SupabaseClient,
  input: WarrantyClaimInput,
): Promise<WarrantyClaim> {
  const orderNo = input.orderNo.trim().toUpperCase();
  const { data, error } = await db
    .from("orders")
    .select("id,customer_phone,status")
    .eq("order_no", orderNo)
    .maybeSingle();
  const row = data as
    | { id: string; customer_phone: string; status: string }
    | null;
  if (error || !row) {
    throw new WarrantyError(
      "No order found — double-check the order ID and the phone number you ordered with.",
      "not-found",
      404,
    );
  }
  if (normalizePhone(row.customer_phone) !== normalizePhone(input.phone)) {
    throw new WarrantyError(
      "No order found — double-check the order ID and the phone number you ordered with.",
      "not-found",
      404,
    );
  }

  const { data: eligible, error: eligError } = await db.rpc(
    "ps_warranty_eligible",
    { p_order_id: row.id, p_product_id: input.productId },
  );
  // The eligibility check is the whole point of order-bound warranty — if
  // it cannot run, no claim is created (never a silent pass).
  if (eligError) {
    throw new WarrantyError(
      "Warranty claims are temporarily unavailable.",
      "unknown",
      503,
    );
  }
  if (eligible !== null) {
    const code = String(eligible).replace(/not eligible: /, "").trim();
    const messages: Record<string, string> = {
      "not-delivered": "This order has not been delivered yet.",
      "not-in-order": "That item is not part of this order.",
      "no-warranty": "This item does not carry a warranty.",
      "no-delivery-record":
        "We cannot confirm the delivery date of this order — contact the shop.",
      "window-expired":
        "The warranty window for this item has ended.",
      "already-claimed":
        "A warranty claim for this item is already in progress or approved.",
    };
    throw new WarrantyError(
      messages[code] ?? "This item is not eligible for a warranty claim.",
      code,
      409,
    );
  }

  const { data: order } = await db
    .from("orders")
    .select("customer_name")
    .eq("id", row.id)
    .maybeSingle();
  const { data: claim, error: claimError } = await db
    .from("warranty_claims")
    .insert({
      order_id: row.id,
      product_id: input.productId,
      customer_name: (order as { customer_name: string } | null)?.customer_name ?? "",
      customer_phone: row.customer_phone,
      problem: input.problem.trim().slice(0, 2000),
      status: "submitted",
    })
    .select(CLAIM_SELECT)
    .single();
  if (claimError || !claim) {
    // uq_warranty_claims_live: a second live claim for the same item raced
    // in between the check and the insert — same honest answer.
    if (claimError?.code === "23505") {
      throw new WarrantyError(
        "A warranty claim for this item is already in progress or approved.",
        "already-claimed",
        409,
      );
    }
    throw new WarrantyError(
      "We could not save the claim — the shop will contact you.",
      "unknown",
      503,
    );
  }
  return mapClaim(claim as unknown as WarrantyClaimRow);
}

/**
 * Shop decision on a claim. 'review' marks it under_review, 'approve' and
 * 'reject' are terminal; reject/approve take a note the customer sees.
 */
export async function performClaimAction(
  db: SupabaseClient,
  claimId: string,
  action: "review" | "approve" | "reject",
  note?: string,
): Promise<void> {
  const status: WarrantyClaimStatus =
    action === "review" ? "under_review" : action === "approve" ? "approved" : "rejected";
  const patch: {
    status: WarrantyClaimStatus;
    resolution?: string;
    decided_at?: string;
  } = { status };
  if (action !== "review") {
    patch.decided_at = new Date().toISOString();
    const trimmed = (note ?? "").trim().slice(0, 500);
    if (trimmed !== "") patch.resolution = trimmed;
  }
  const { error } = await db
    .from("warranty_claims")
    .update(patch)
    .eq("id", claimId);
  if (error) throw new Error(error.message || "claim action failed");
}
