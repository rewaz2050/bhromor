/**
 * C1 (2026-09-28) — POST /api/vendor/staff/[id]/password: a fresh one-time
 * password for a staff login that was forgotten.
 *
 * There is no e-mail or SMS in this marketplace, so "I forgot my password" is
 * a phone call to the owner — and this is the other end of that call. The new
 * value is returned ONCE; the person changes it from their own settings
 * afterwards (the password card is on /vendor/settings for every login now).
 */
import { vendorRoute, routeId } from "../../../_lib";
import { getSupabaseService } from "@/lib/supabase-server";
import { AdminInputError } from "@/lib/db/admin";
import { resetVendorStaffPassword } from "@/lib/db/vendor-staff";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const POST = vendorRoute(
  "staff-password",
  async (ctx, _request, routeContext) => {
    const id = await routeId(routeContext);
    if (id === "") {
      return apiJson({ error: "Missing login id." }, 400);
    }
    const service = getSupabaseService();
    if (!service) throw new AdminInputError("Service key is not configured.", 503);
    const result = await resetVendorStaffPassword({
      service,
      db: ctx.db,
      shopId: ctx.shopId,
      role: ctx.role,
      userId: id,
    });
    return apiJson({ password: result.password, staff: result.staff });
  },
  { limit: 5 },
);
