/**
 * POST /api/warranty — customer starts a warranty claim (P1 #14).
 * GET  /api/warranty?id=PS-…&phone=01… — that order's claims (status view).
 *
 * POST body: { id: "PS-…", phone: "01…", productId: "<uuid>", problem: "…" }
 *
 * Warranty is order-bound: the item must be on this order, the order
 * delivered, and inside the product's warranty window from the proven
 * delivery moment (ps_warranty_eligible). One live claim per order+item.
 * The shop reviews and decides; the customer follows the status from the
 * track page.
 */

import { getSupabaseService } from "@/lib/supabase-server";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { apiError, apiJson } from "@/lib/api-response";
import {
  claimsForOrder,
  createWarrantyClaim,
  WarrantyError,
} from "@/lib/db/warranty";
import { notifyStaff } from "@/lib/db/engagement";
import { normalizePhone } from "@/lib/orders";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Customer status view — same ownership proof as /api/track. */
export async function GET(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`warranty-get:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }
  if (!isServiceRoleConfigured()) {
    return apiJson({ claims: [] });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim().toUpperCase().slice(0, 32);
  const phone = (url.searchParams.get("phone") ?? "").trim().slice(0, 24);
  if (id === "" || phone === "") {
    return apiError("Order ID and phone number are required.", 400);
  }
  const db = getSupabaseService();
  if (!db) return apiJson({ claims: [] });
  try {
    const { data, error } = await db
      .from("orders")
      .select("id,customer_phone")
      .eq("order_no", id)
      .maybeSingle();
    const row = data as { id: string; customer_phone: string } | null;
    if (error || !row) return apiJson({ claims: [] });
    if (normalizePhone(row.customer_phone) !== normalizePhone(phone)) {
      // Same deliberate vagueness as /api/track.
      return apiJson({ claims: [] });
    }
    const claims = await claimsForOrder(db, row.id);
    return apiJson({ claims });
  } catch {
    return apiJson({ claims: [] });
  }
}

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`warranty:${ip}`, 10, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Warranty claims are temporarily unavailable.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request.", 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim().toUpperCase().slice(0, 32) : "";
  const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 24) : "";
  const productId = typeof b.productId === "string" ? b.productId.trim().slice(0, 64) : "";
  const problem = typeof b.problem === "string" ? b.problem.trim() : "";

  if (id === "" || phone === "") {
    return apiError("Order ID and phone number are required.", 400);
  }
  if (!UUID_RE.test(productId)) {
    return apiError("Pick the item this is about.", 422);
  }
  if (problem.length < 5 || problem.length > 500) {
    return apiError(
      "Describe the problem in a sentence or two.",
      422,
    );
  }

  const db = getSupabaseService();
  if (!db) return apiError("Warranty claims are temporarily unavailable.", 503);

  try {
    const claim = await createWarrantyClaim(db, {
      orderNo: id,
      phone,
      productId,
      problem,
    });
    await notifyStaff(db, {
      kind: "order",
      title: "Warranty claim submitted",
      body: `${claim.productName} on order ${claim.orderNo} — “${claim.problem.slice(0, 80)}”`,
      href: `/admin/orders/${claim.orderNo}`,
    });
    return apiJson({ claim: { id: claim.id, status: claim.status } }, 201);
  } catch (err) {
    if (err instanceof WarrantyError) {
      return apiError(err.message, err.status, { code: err.reason });
    }
    return apiError("Warranty claims are temporarily unavailable.", 503);
  }
}
