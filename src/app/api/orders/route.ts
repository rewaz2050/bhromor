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

import { validateSplitOrder } from "@/lib/order-split";
import { isPlusMember } from "@/lib/db/membership";
import {
  OrderPlacementError,
  countStampsForPhone,
  loadOrderSnapshot,
  placeLiveMultiOrder,
} from "@/lib/db/orders";
import { samePhone } from "@/lib/orders";
import { notifyStaff, readOpsSettings } from "@/lib/db/engagement";
import { notifyCustomerOrderPlaced } from "@/lib/customer-push";
import { sanitizeSettings } from "@/lib/settings-store";
import { isServiceRoleConfigured } from "@/lib/env";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { checkDurableRateLimit } from "@/lib/rate-limit-durable";
import { getSupabaseService } from "@/lib/supabase-server";
import { loadSmartCardTarget, resolveCustomer } from "@/lib/customer-auth";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 20;

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = await checkDurableRateLimit(`orders:${ip}`, LIMIT, WINDOW_MS);
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
    // C2 — one tap may cover several shops. The payload is split BEFORE
    // validation so every shop's order is priced, stock-checked and
    // zone-checked on its own; the batch RPC then places them atomically.
    const validation = validateSplitOrder(payloadForValidation, {
      ...snapshot,
      plusActive,
      settings: opsSettings ?? undefined,
    });
    if (!validation.ok) {
      return apiError("Please fix the highlighted fields.", 422, {
        errors: validation.errors,
      });
    }
    const orders = await placeLiveMultiOrder(validation.drafts, snapshot);
    if (!orders || orders.length === 0) {
      return apiError("Could not place the order — please try again.", 503);
    }
    const order = orders[0];
    const staffDb = getSupabaseService();
    if (staffDb) {
      // → Admin notification (live inbox): full address ladder + money.
      // C2 — one note PER PARCEL: two shops on one tap must look like two
      // deliveries in the inbox, not one order with a surprise inside.
      for (const [index, placed] of orders.entries()) {
        // The drafts and the placed rows line up one-for-one; the floor keeps
        // the note honest even if a read-back ever dropped one.
        const d = validation.drafts[Math.min(index, validation.drafts.length - 1)];
        const details = [
          d.customer.name,
          `${d.customer.para} · ${d.customer.upazila} · ${d.customer.district}`,
          `${(placed.total / 100).toLocaleString("en-IN")} taka COD`,
          ...(orders.length > 1 ? [`${index + 1}/${orders.length} — এক চেকআউট`] : []),
        ];
        if (d.isPickup) details.push("Store Pickup");
        else if (plusActive) details.push("PROSANTI+ — delivery + surcharges free");
        else if (placed.freeDeliveryBy === "shop") details.push("ফ্রি ডেলিভারি (দোকানের অফার)");
        else if (placed.freeDeliveryBy === "platform")
          details.push("ফ্রি ডেলিভারি (PROSANTI অফার)");
        else if (placed.deliveryCharge === 0) details.push("ফ্রি ডেলিভারি");
        if ((d.tipAmount ?? 0) > 0) details.push(`টিপ ৳${(d.tipAmount ?? 0) / 100}`);
        await notifyStaff(staffDb, {
          kind: "order",
          title: `নতুন অর্ডার ${placed.id} — কনফার্মেশন দরকার`,
          body: details.join(" · "),
          href: `/admin/orders/${placed.id}`,
        });
      }
      // 2026-09-24: if this phone already opted in on /track, the shopper gets
      // "অর্ডার পেয়েছি" with a filled-in tracker link — the receipt screen is
      // often already closed by the time they wonder how it is going.
      await notifyCustomerOrderPlaced(staffDb, {
        phone: order.customer?.phone,
        orderNo: order.id,
        total: orders.reduce((sum, o) => sum + o.total, 0),
        ...(orders.length > 1 ? { orderCount: orders.length } : {}),
      });
    }
    // Smart Card: stamps ride on the signed-in account; when the card fills,
    // the admin is told to prepare the (admin-controlled) prize.
    const cardCustomer = await resolveCustomer(request);
    let smartCard: { stamps: number; target: number; justCompleted: boolean } | undefined;
    if (cardCustomer && samePhone(cardCustomer.phone, order.customer?.phone ?? "")) {
      const cfg = await loadSmartCardTarget();
      const target = Math.max(1, cfg.target);
      const { total: count } = await countStampsForPhone(
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
    // C2 — `orders` is the truth (one row per shop); `order` stays as the
    // first of them so any older reader of this response keeps working.
    return apiJson({ orders, order, smartCard }, 201);
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
