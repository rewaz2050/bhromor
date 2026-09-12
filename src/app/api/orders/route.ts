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
import {
  OrderPlacementError,
  countOrdersForPhone,
  loadOrderSnapshot,
  placeLiveOrder,
} from "@/lib/db/orders";
import { ensureLaunchCatalog, remapSeedItemIds } from "@/lib/db/auto-seed";
import { samePhone } from "@/lib/orders";
import { notifyStaff } from "@/lib/db/engagement";
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

  // True between "the catalog was empty" and "we just seeded it" — the
  // window in which any failure degrades to an honest 503 instead of
  // dead-ending the customer.
  let seededNow = false;
  try {
    // ── Self-heal: configured-but-empty catalog (never seeded) ──────────
    // Upsert the launch catalog once and keep the customer's order flowing
    // as a REAL database order (docs/go-live.md). If the database itself
    // refuses (missing schema, outage), answer an honest 503 so the
    // storefront's browser-local flow completes the order instead of the
    // old dead-end "call us to order" 503.
    let snapshot = await loadOrderSnapshotSafely();
    if (!snapshot || snapshot.products.length === 0) {
      seededNow = await seedLaunchCatalog();
      snapshot = seededNow ? await loadOrderSnapshotSafely() : null;
      if (!snapshot || snapshot.products.length === 0) {
        return apiError("Online ordering is not set up yet.", 503);
      }
    }

    // Carts built against the launch seeds carry ids like `p1`; live rows are
    // uuids. Bridge them through slug once, right after auto-seeding.
    let payloadForValidation = payload;
    if (seededNow && isRecord(payload)) {
      const remapped = remapSeedItemIdsForPayload(payload, snapshot.products);
      if (remapped) payloadForValidation = remapped;
    }

    const validation = validateOrderPayload(payloadForValidation, snapshot);
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
    if (seededNow) return apiError("Could not place the order — please try again.", 503);
    if (err instanceof OrderPlacementError) {
      return apiError(err.message, err.status, { field: err.field });
    }
    return apiError("Could not place the order — please try again.", 503);
  }
}

/** Snapshot read that never throws — a failing read degrades to 503. */
async function loadOrderSnapshotSafely(): Promise<Awaited<
  ReturnType<typeof loadOrderSnapshot>
> | null> {
  try {
    return await loadOrderSnapshot();
  } catch {
    return null;
  }
}

/** Upserts the launch catalog into an empty store; false if the DB refuses. */
async function seedLaunchCatalog(): Promise<boolean> {
  const db = getSupabaseService();
  if (!db) return false;
  try {
    return await ensureLaunchCatalog(db);
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Rewrite `items[].productId` seed ids (p1…) to live row ids via slug.
 * Returns a shallow-copied payload when something changed, else null.
 */
function remapSeedItemIdsForPayload(
  payload: Record<string, unknown>,
  liveProducts: { id: string; slug: string }[],
): Record<string, unknown> | null {
  const items = payload.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const rows = items as { productId?: unknown }[];
  if (rows.some((it) => it === null || typeof it !== "object")) return null;
  const remapped = remapSeedItemIds(rows, liveProducts);
  if (remapped === rows) return null;
  return { ...payload, items: remapped };
}
