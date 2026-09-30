/**
 * C1 (2026-09-28) — /api/vendor/staff: the shop's roster.
 *
 *   GET  who can open this shop (owner only)
 *   POST open a staff login — the answer carries a one-time password, once
 *
 * Rate limited hard on POST: every call creates a real auth account, and
 * there is no e-mail to confirm it with.
 */
import { vendorRoute } from "../_lib";
import { getSupabaseService } from "@/lib/supabase-server";
import { AdminInputError } from "@/lib/db/admin";
import { createVendorStaff, listVendorStaff } from "@/lib/db/vendor-staff";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = vendorRoute("staff-list", async (ctx) => {
  const staff = await listVendorStaff(ctx.db, ctx.shopId, ctx.role, ctx.user.id);
  return apiJson({ staff, self: ctx.user.id, canManage: ctx.role === "owner" });
});

export const POST = vendorRoute(
  "staff-create",
  async (ctx, request) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new AdminInputError("Send the name and the login to open.", 422);
    }
    const service = getSupabaseService();
    if (!service) throw new AdminInputError("Service key is not configured.", 503);
    const result = await createVendorStaff({
      service,
      db: ctx.db,
      shopId: ctx.shopId,
      role: ctx.role,
      ownerUserId: ctx.user.id,
      raw: body,
    });
    return apiJson({ staff: result.staff, password: result.password }, 201);
  },
  { limit: 5 },
);
