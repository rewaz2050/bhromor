/**
 * Public rider intake (phase 3, slice 6).
 *
 * Service-role helper used by the PUBLIC /api/riders/apply route — the anon
 * key has no rider policies on purpose (phones + emails must never leak), so
 * the route only ever confirms receipt. Staff CRUD lives in ./admin.ts
 * behind requireStaff().
 *
 * Auth note: Supabase password login needs an email identifier (phone +
 * password is not a Supabase flow without an SMS provider), so every
 * application collects a contact email that becomes the rider login, exactly
 * like vendors. The rider app signs in with the same email + password the
 * applicant registers with.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseService } from "../supabase-server";
import { toDomainMany } from "./orders";
import { AdminInputError } from "./admin";
import type {
  DbDeliveryAssignment,
  DbOrder,
  DbRider,
  DbRiderSettlement,
} from "./types";
import type { Order } from "../orders";
import {
  sanitizeAvailability,
  type RiderAvailability,
} from "../rider-hours";

export interface RiderJob {
  id: string;
  /** PUBLIC order number (`Order.id`, PS-…) — never the row uuid. */
  orderId: string;
  state: DbDeliveryAssignment["state"];
  offeredAt: number;
  expiresAt: number;
  order: Order;
}

/** A rider pay-in. Shown to the rider so they can reconcile COD vs deposit. */
export interface RiderSettlement {
  id: string;
  amount: number;
  method: string;
  reference: string;
  at: number;
}

/** Admin dispatcher row: assignment + rider + full order (slice 7 board). */
export interface RiderDispatchJob {
  id: string;
  /**
   * PUBLIC order number (`Order.id`, PS-…). Until 2026-09-18 this carried
   * the row uuid: the board linked to `/admin/orders/<uuid>` (404 — the
   * detail page reads by order number) and the live map matched it against
   * `Order.id`, so every pin painted "unassigned" red.
   */
  orderId: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  state: DbDeliveryAssignment["state"];
  offeredAt: number;
  expiresAt: number;
  order: Order;
}

export class RiderInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "RiderInputError";
    this.status = status;
  }
}

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BD_PHONE_RE = /^01\d{9}$/;
const VEHICLES = new Set(["bicycle", "bike", "scooter"]);

/** A rider application → a `pending` row. One account owns one rider. */
export async function applyRider(
  raw: unknown,
  applicantUserId?: string,
): Promise<{ id: string }> {
  const db = getSupabaseService();
  if (!db) throw new Error("rider intake unavailable");
  if (applicantUserId) {
    const { data: existing } = await db
      .from("riders")
      .select("id")
      .eq("user_id", applicantUserId)
      .limit(1);
    if (existing && existing.length > 0) {
      throw new RiderInputError(
        "This account is already a rider — sign in to the rider app instead.",
        409,
      );
    }
  }
  const b = (raw ?? {}) as Record<string, unknown>;
  const name = clean(b.name, 80);
  const phone = clean(b.phone, 20).replace(/[\s-]/g, "");
  const email = clean(b.email ?? b.contactEmail, 120).toLowerCase();
  const vehicle = clean(b.vehicle, 12).toLowerCase();
  const zoneIds = Array.isArray(b.zoneIds)
    ? [
        ...new Set(
          b.zoneIds
            .filter((z): z is string => typeof z === "string")
            .map((z) => z.trim())
            .filter(Boolean),
        ),
      ].slice(0, 12)
    : [];

  if (name.length < 2) throw new RiderInputError("Rider name is too short.");
  if (!BD_PHONE_RE.test(phone)) {
    throw new RiderInputError("A valid Bangladeshi mobile number is required.");
  }
  if (!EMAIL_RE.test(email)) {
    throw new RiderInputError(
      "A valid email is required — it becomes your rider login.",
    );
  }
  if (!VEHICLES.has(vehicle)) {
    throw new RiderInputError("Choose a vehicle: bicycle, bike or scooter.");
  }
  if (zoneIds.length === 0) {
    throw new RiderInputError("Choose at least one delivery zone.");
  }
  const { data: zones } = await db.from("delivery_zones").select("id,active");
  const live = new Set(
    ((zones ?? []) as { id: string; active: boolean }[])
      .filter((z) => z.active)
      .map((z) => z.id),
  );
  if (!zoneIds.every((z) => live.has(z))) {
    throw new RiderInputError("One of the chosen zones is not available.");
  }

  const { data: dupe } = await db
    .from("riders")
    .select("id")
    .or(`phone.eq.${phone},contact_email.eq.${email}`)
    .neq("status", "suspended")
    .limit(1);
  if (dupe && dupe.length > 0) {
    throw new RiderInputError(
      "This phone or email already has a rider application — we'll be in touch.",
      409,
    );
  }

  const { data, error } = await db
    .from("riders")
    .insert({
      user_id: applicantUserId ?? null,
      name,
      phone,
      contact_email: email,
      vehicle,
      zone_ids: zoneIds,
      status: "pending",
      is_online: false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("rider application failed");
  return { id: (data as { id: string }).id };
}

/* ------------------------------------------------------------------ */
/* Live rider dispatch reads/mutations (slice 7–10)                    */
/* ------------------------------------------------------------------ */

const epoch = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
};

export async function listRiderSettlements(
  service: SupabaseClient,
  riderId: string,
): Promise<RiderSettlement[]> {
  const { data, error } = await service
    .from("rider_settlements")
    .select("*")
    .eq("rider_id", riderId)
    .order("settled_at", { ascending: false })
    .limit(25);
  if (error) throw new Error("rider settlements read failed");
  return ((data ?? []) as DbRiderSettlement[]).map((row) => ({
    id: row.id,
    amount: row.amount,
    method: row.method,
    reference: row.reference,
    at: epoch(row.settled_at),
  }));
}

/** Order rows → domain Orders keyed by row id (one batched read). */
const mapOrdersById = async (
  service: SupabaseClient,
  rows: DbOrder[],
): Promise<Map<string, Order>> => {
  const mapped = await toDomainMany(service, rows);
  const out = new Map<string, Order>();
  rows.forEach((row, i) => {
    const order = mapped[i];
    if (order) out.set(row.id, order);
  });
  return out;
};

export async function listRiderJobs(
  service: SupabaseClient,
  riderId: string,
): Promise<RiderJob[]> {
  await expireStaleAssignments(service);
  const { data: assignments, error } = await service
    .from("delivery_assignments")
    .select("*")
    .eq("rider_id", riderId)
    .order("offered_at", { ascending: false });
  if (error) throw new Error("rider jobs read failed");
  const rows = (assignments ?? []) as DbDeliveryAssignment[];
  if (rows.length === 0) return [];

  const orderIds = [...new Set(rows.map((a) => a.order_id))];
  const { data: orderRows, error: orderError } = await service
    .from("orders")
    .select("*")
    .in("id", orderIds);
  if (orderError) throw new Error("rider jobs order read failed");
  // P1.3: one batched mapping for every order on the board, not one per job.
  const orderMap = await mapOrdersById(service, (orderRows ?? []) as DbOrder[]);

  const jobs: RiderJob[] = [];
  for (const assignment of rows) {
    const order = orderMap.get(assignment.order_id);
    if (!order) continue;
    jobs.push({
      id: assignment.id,
      orderId: order.id,
      state: assignment.state,
      offeredAt: epoch(assignment.offered_at),
      expiresAt: epoch(assignment.expires_at),
      order,
    });
  }
  return jobs;
}

/**
 * Staff dispatch board. Reads only — the caller runs
 * `expireStaleAssignments` on the service client first (the RPC is
 * service-only since 202609160004; this list may be read with the staff's
 * RLS-bound client).
 */
export async function listDispatchJobs(
  service: SupabaseClient,
): Promise<RiderDispatchJob[]> {
  const { data: assignments, error } = await service
    .from("delivery_assignments")
    .select("*")
    .order("offered_at", { ascending: false });
  if (error) throw new Error("dispatch board read failed");
  const rows = (assignments ?? []) as DbDeliveryAssignment[];
  if (rows.length === 0) return [];

  const orderIds = [...new Set(rows.map((a) => a.order_id))];
  const riderIds = [...new Set(rows.map((a) => a.rider_id))];
  const [orderResult, riderResult] = await Promise.all([
    service.from("orders").select("*").in("id", orderIds),
    service.from("riders").select("id,name,phone").in("id", riderIds),
  ]);
  if (orderResult.error) throw new Error("dispatch board order read failed");
  if (riderResult.error) throw new Error("dispatch board rider read failed");

  const orderMap = await mapOrdersById(service, (orderResult.data ?? []) as DbOrder[]);
  const riderMap = new Map<string, Pick<DbRider, "id" | "name" | "phone">>();
  for (const r of (riderResult.data ?? []) as Pick<DbRider, "id" | "name" | "phone">[])
    riderMap.set(r.id, r);

  const jobs: RiderDispatchJob[] = [];
  for (const assignment of rows) {
    const order = orderMap.get(assignment.order_id);
    const rider = riderMap.get(assignment.rider_id);
    if (!order || !rider) continue;
    jobs.push({
      id: assignment.id,
      orderId: order.id,
      riderId: assignment.rider_id,
      riderName: rider.name,
      riderPhone: rider.phone,
      state: assignment.state,
      offeredAt: epoch(assignment.offered_at),
      expiresAt: epoch(assignment.expires_at),
      order,
    });
  }
  return jobs;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for an orders.id row key (vs a public PS-… order number). */
export const isOrderRowId = (value: string): boolean => UUID_RE.test(value);

/**
 * Dispatch routes take order references from the admin UI, which only ever
 * holds PUBLIC order numbers (`Order.id` is `order_no`, §70) — the row id
 * never leaves the database. Until 2026-09-18 both dispatch routes demanded
 * a uuid, so "Assign rider" and "Batch assign" answered 422 for every live
 * order. Accepts either form; a reference that matches nothing is a 404, so
 * a typo can never offer a different order.
 */
export async function resolveOrderRowIds(
  db: SupabaseClient,
  refs: readonly string[],
): Promise<string[]> {
  const cleaned = refs.map((r) => r.trim());
  const orderNos = [
    ...new Set(cleaned.filter((r) => !isOrderRowId(r)).map((r) => r.toUpperCase())),
  ];
  const byOrderNo = new Map<string, string>();
  if (orderNos.length > 0) {
    const { data, error } = await db
      .from("orders")
      .select("id, order_no")
      .in("order_no", orderNos);
    if (error) throw new Error("order lookup failed");
    for (const row of (data ?? []) as { id: string; order_no: string | null }[]) {
      if (row.order_no) byOrderNo.set(row.order_no.toUpperCase(), row.id);
    }
  }
  return cleaned.map((r) => {
    if (isOrderRowId(r)) return r;
    const id = byOrderNo.get(r.toUpperCase());
    if (!id) throw new AdminInputError(`Order ${r} not found.`, 404);
    return id;
  });
}

const dispatchRpcError = (message: string): AdminInputError => {
  const msg = message.toLowerCase();
  if (msg.includes("forbidden")) return new AdminInputError(message, 403);
  if (msg.includes("not found")) return new AdminInputError(message, 404);
  if (msg.includes("no eligible rider") || msg.includes("already active"))
    return new AdminInputError(message, 409);
  return new AdminInputError(message, 422);
};

export async function offerOrderForDispatch(
  service: SupabaseClient,
  orderId: string,
): Promise<string> {
  const { data, error } = await service.rpc("ps_offer_order", {
    p_order_id: orderId,
  });
  if (error) throw dispatchRpcError(error.message);
  return data as string;
}

export async function cancelDispatchAssignment(
  service: SupabaseClient,
  assignmentId: string,
): Promise<void> {
  const { error } = await service.rpc("ps_cancel_assignment", {
    p_assignment_id: assignmentId,
  });
  if (error) throw dispatchRpcError(error.message);
}

/** Mark stale offered assignments as expired (no background worker). */
/** Service-only RPC (202609160004): expire timed-out offers and re-offer. */
export async function expireStaleAssignments(
  service: SupabaseClient,
): Promise<void> {
  const { error } = await service.rpc("ps_expire_stale_offers");
  if (error) throw new Error(error.message);
}

/** Admin records a rider pay-in and zeroes their cash-in-hand. */
export async function settleRiderCashByAdmin(
  service: SupabaseClient,
  riderId: string,
  method: string,
  reference: string,
): Promise<void> {
  const { error } = await service.rpc("ps_admin_settle_rider", {
    p_rider_id: riderId,
    p_method: method,
    p_reference: reference,
  });
  if (error) throw dispatchRpcError(error.message);
}

/**
 * Orders that are dispatch-ready but have no active offer. Used by the
 * Admin → Deliveries board so a staff member can assign manually.
 *
 * Counter pickups are excluded (2026-09-18): the customer collects at
 * Traffic Point, so a rider is never needed — before this they sat in
 * "Awaiting dispatch" forever with an "Assign rider" button that would have
 * sent a rider to deliver an order nobody was waiting for at home. Return
 * legs DO need a rider (collect from the customer) and stay listed.
 */
export async function listAwaitingDispatchOrders(
  service: SupabaseClient,
): Promise<Order[]> {
  const { data: orderRows, error } = await service
    .from("orders")
    .select("*")
    .in("status", ["ready-for-pickup", "courier-assigned", "out-for-delivery"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("awaiting orders read failed");
  const rows = ((orderRows ?? []) as DbOrder[]).filter((row) => !row.is_pickup);
  if (rows.length === 0) return [];

  const { data: assignmentRows } = await service
    .from("delivery_assignments")
    .select("order_id")
    .in("state", ["offered", "accepted", "picked_up"]);
  const active = new Set(
    ((assignmentRows ?? []) as { order_id: string }[]).map((a) => a.order_id),
  );
  const waiting = rows.filter((row) => !active.has(row.id));
  const mapped = await toDomainMany(service, waiting);
  return mapped.filter((order): order is Order => order !== null);
}

/** P2 #22 — the rider sets their own shift; dispatch honours it. */
export async function setRiderAvailability(
  service: SupabaseClient,
  riderId: string,
  raw: unknown,
): Promise<RiderAvailability> {
  const { value, error: inputError } = sanitizeAvailability(raw);
  if (inputError) throw new RiderInputError(inputError, 422);
  const { error } = await service
    .from("riders")
    .update({
      avail_from_hour: value.fromHour,
      avail_to_hour: value.toHour === 24 ? 24 : value.toHour,
      avail_days: value.days && value.days.length > 0 ? value.days : null,
    })
    .eq("id", riderId);
  if (error) throw new Error("rider availability update failed");
  return value;
}

export async function setRiderOnline(
  service: SupabaseClient,
  riderId: string,
  isOnline: boolean,
): Promise<boolean> {
  const { error } = await service
    .from("riders")
    .update({ is_online: Boolean(isOnline) })
    .eq("id", riderId);
  if (error) throw new Error("rider online update failed");
  return true;
}

export const acceptRiderAssignment = async (
  db: SupabaseClient,
  assignmentId: string,
): Promise<void> => {
  const { error } = await db.rpc("ps_rider_accept", {
    p_assignment_id: assignmentId,
  });
  if (error) throw new Error(error.message);
};

export const rejectRiderAssignment = async (
  db: SupabaseClient,
  assignmentId: string,
): Promise<void> => {
  const { error } = await db.rpc("ps_rider_reject", {
    p_assignment_id: assignmentId,
  });
  if (error) throw new Error(error.message);
};

export const pickupRiderAssignment = async (
  db: SupabaseClient,
  assignmentId: string,
): Promise<void> => {
  const { error } = await db.rpc("ps_rider_pickup", {
    p_assignment_id: assignmentId,
  });
  if (error) throw new Error(error.message);
};

export const deliverRiderAssignment = async (
  db: SupabaseClient,
  assignmentId: string,
  code: string,
  proofUrl?: string | null,
): Promise<void> => {
  const { error } = await db.rpc("ps_rider_deliver", {
    p_assignment_id: assignmentId,
    p_code: code,
    p_proof_url: proofUrl ?? null,
  });
  if (error) {
    // 'forbidden' here used to be the riders self-update guard rejecting the
    // RPC's own cash/load bookkeeping (fixed in 202609160003) — keep the raw
    // shape in the log so a rider's "Delivered does nothing" is diagnosable.
    console.error(
      "[rider] ps_rider_deliver failed",
      JSON.stringify({ assignmentId, code: error.code ?? null, message: error.message }),
    );
    throw new Error(error.message);
  }
};

export const failedRiderAttempt = async (
  db: SupabaseClient,
  assignmentId: string,
  reason: string,
): Promise<void> => {
  const { error } = await db.rpc("ps_rider_failed_attempt", {
    p_assignment_id: assignmentId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
};

export const settleRiderCash = async (
  db: SupabaseClient,
  method: string,
  reference: string,
): Promise<void> => {
  const { error } = await db.rpc("ps_rider_settle", {
    p_method: method,
    p_reference: reference,
  });
  if (error) throw new Error(error.message);
};
