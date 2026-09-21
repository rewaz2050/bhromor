/**
 * POST /api/orders — place a cash-on-delivery order (live only).
 *
 * Validates the payload against server-loaded prices/zones/coupons, reserves
 * stock, writes orders + snapshots + history, and returns the stored order
 * (with its trigger-assigned order_no). With an unseeded catalog it seeds the
 * launch catalog in place and places a real order; if the database refuses,
 * the customer gets an honest 503 — never a fake success.
 *
 * Rate-limited per IP; validation failures are 422 with field errors.
 */

import { validateOrderPayload } from "@/lib/order-validation";
import { isPlusMember } from "@/lib/db/membership";
import {
  OrderPlacementError,
  countOrdersForPhone,
  loadOrderSnapshot,
  placeLiveOrder,
} from "@/lib/db/orders";
import { samePhone } from "@/lib/orders";
import { notifyStaff, readOpsSettings } from "@/lib/db/engagement";
import { sanitizeSettings } from "@/lib/settings-store";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { loadSmartCardTarget, resolveCustomer } from "@/lib/customer-auth";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 20;

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = checkRateLimit(`orders:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }

  if (!isServiceRoleConfigured()) {
    return apiError("Online ordering is not set up yet.", 503);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Invalid order data.", 400);
  }

  try {
    // The catalog is whatever the shop has PUBLISHED — nothing else. An
    // empty store answers an honest 503; we never seed demo rows into a
    // real database to make an order "work".
    // P1.4: the read is scoped by what THIS payload can need — the buyer's
    // phone (first-order proof) and the referral code, if any was typed.
    const snapshot = await loadOrderSnapshotSafely({
      scope: "checkout",
      phone: isRecord(payload) && typeof payload.phone === "string" ? payload.phone : undefined,
      referralCode:
        isRecord(payload) && typeof payload.referral_code === "string"
          ? payload.referral_code
          : undefined,
    });
    if (!snapshot || snapshot.products.length === 0) {
      return apiError(
        "Online ordering is not set up yet — this shop has no published products.",
        503,
      );
    }

    const payloadForValidation = payload;

    // P2 #17 — PROSANTI+ waiver, looked up from the memberships table by the
    // phone ON THIS PAYLOAD (not a session, not a client claim). The
    // place-order RPC asks the same question again independently — the value
    // here only makes the quoted total honest before payment.
    const phoneRaw = isRecord(payload) ? (payload as { phone?: unknown }).phone : undefined;
    const plusActive =
      typeof phoneRaw === "string" && phoneRaw.trim() !== ""
        ? await isPlusMember(getSupabaseService()!, phoneRaw).catch(() => false)
        : false;

    // The owner's surcharge toggles + amounts and the courier floor ride the
    // same snapshot — server pricing honours exactly what the admin set.
    const opsDb = getSupabaseService();
    const opsSettings = opsDb
      ? await readOpsSettings(opsDb)
          .then(sanitizeSettings)
          .catch(() => null)
      : null;
    const validation = validateOrderPayload(payloadForValidation, {
      ...snapshot,
      plusActive,
      settings: opsSettings ?? undefined,
    });
    if (!validation.ok) {
      return apiError("Please fix the highlighted fields.", 422, {
        errors: validation.errors,
      });
    }
    const order = await placeLiveOrder(validation.draft, snapshot);
    if (!order) {
      return apiError("Could not place the order — please try again.", 503);
    }
    const staffDb = getSupabaseService();
    if (staffDb) {
      // → Admin notification (live inbox): full address ladder + money.
      const d = validation.draft;
      const details = [
        d.customer.name,
        `${d.customer.para} · ${d.customer.upazila} · ${d.customer.district}`,
        `${(order.total / 100).toLocaleString("en-IN")} taka COD`,
      ];
      if (d.isPickup) details.push("Store Pickup");
      else if (plusActive) details.push("PROSANTI+ — delivery + surcharges free");
      else if (order.deliveryCharge === 0) details.push("ফ্রি ডেলিভারি");
      if ((d.tipAmount ?? 0) > 0) details.push(`টিপ ৳${(d.tipAmount ?? 0) / 100}`);
      await notifyStaff(staffDb, {
        kind: "order",
        title: `নতুন অর্ডার ${order.id} — কনফার্মেশন দরকার`,
        body: details.join(" · "),
        href: `/admin/orders/${order.id}`,
      });
    }
    // Smart Card: stamps ride on the signed-in account; when the card fills,
    // the admin is told to prepare the (admin-controlled) prize.
    const cardCustomer = await resolveCustomer(request);
    let smartCard: { stamps: number; target: number; justCompleted: boolean } | undefined;
    if (cardCustomer && samePhone(cardCustomer.phone, order.customer?.phone ?? "")) {
      const cfg = await loadSmartCardTarget();
      const target = Math.max(1, cfg.target);
      const count = await countOrdersForPhone(
        staffDb as NonNullable<ReturnType<typeof getSupabaseService>>,
        cardCustomer.phone,
      );
      const stamps = count > 0 && count % target === 0 ? target : count % target;
      const justCompleted = count > 0 && count % target === 0;
      smartCard = { stamps, target, justCompleted };
      if (justCompleted && staffDb) {
        await notifyStaff(staffDb, {
          kind: "order",
          title: `🎁 স্মার্ট কার্ড পূর্ণ — ${cardCustomer.name}`,
          body: `${target}টি স্ট্যাম্প সম্পূর্ণ (${cardCustomer.phone}) — পুরস্কার প্রস্তুত করুন: ${cfg.rewardTitle}`,
          href: "/admin/settings",
        });
      }
    }
    return apiJson({ order, smartCard }, 201);
  } catch (err) {
    if (err instanceof OrderPlacementError) {
      return apiError(err.message, err.status, { field: err.field });
    }
    return apiError("Could not place the order — please try again.", 503);
  }
}

/** Snapshot read that never throws — a failing read degrades to 503. */
async function loadOrderSnapshotSafely(
  hints: Parameters<typeof loadOrderSnapshot>[0],
): Promise<Awaited<ReturnType<typeof loadOrderSnapshot>> | null> {
  try {
    return await loadOrderSnapshot(hints);
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
