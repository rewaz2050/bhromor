
import { vendorRoute } from "../_lib";

import {
  createVendorPromo,
  promoBoard,
  setVendorPromoActive,
} from "@/lib/db/vendor-promos";

import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * B3 (2026-09-28) — the shop's own promo codes.
 *
 * GET   → its codes + the platform caps + what those codes have cost so far.
 * POST  → create one (validated against the caps, then the database guard).
 * PATCH → pause or resume one.
 *
 * Everything runs on the vendor's RLS client, so `coupons vendor *` and
 * `ps_guard_vendor_promo` (202609280003) are the authority — this route can be
 * bypassed by a direct Supabase call and the rules still hold.
 */
export const GET = vendorRoute("promos", async (ctx) => {
  const board = await promoBoard(ctx.db, ctx.shopId);
  return apiJson(board);
});

export const POST = vendorRoute(
  "promo-create",
  async (ctx, request) => {
    const body = await request.json().catch(() => null);
    const board = await promoBoard(ctx.db, ctx.shopId);
    const promo = await createVendorPromo(ctx.db, {
      shopId: ctx.shopId,
      raw: body,
      by: ctx.user.email ?? null,
      limits: board.limits,
    });
    return apiJson({ promo }, 201);
  },
  { limit: 20 },
);

export const PATCH = vendorRoute(
  "promo-toggle",
  async (ctx, request) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const b = body ?? {};
    const promo = await setVendorPromoActive(ctx.db, {
      shopId: ctx.shopId,
      id: typeof b.id === "string" ? b.id.trim().slice(0, 64) : "",
      active: b.active === true,
    });
    return apiJson({ promo });
  },
  { limit: 40 },
);
