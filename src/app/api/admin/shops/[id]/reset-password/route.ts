/**
 * POST /api/admin/shops/[id]/reset-password — staff sets a temporary
 * password for the shop's linked vendor login (apply = sign up, 2026-09-26).
 *
 * The onboarding has no e-mail or SMS step, so "I forgot my password" is
 * handled by staff: the new value is generated here, returned ONCE for the
 * admin to pass on by phone, and the vendor changes it in Shop settings.
 * Admin/super-admin only, tightly rate-limited, and only for a shop that
 * actually has a login.
 */
import { staffRoute, routeId } from "../../../_lib";
import { getSupabaseService } from "@/lib/supabase-server";
import { AdminInputError } from "@/lib/db/admin";
import {
  generateTemporaryPassword,
  setApplicantPassword,
} from "@/lib/db/applicant-account";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "shop-reset-password",
  async ({ db }, _request, routeContext) => {
    const id = await routeId(routeContext);
    const { data: link } = await db
      .from("vendor_users")
      .select("user_id")
      .eq("shop_id", id)
      .eq("role", "owner")
      .limit(1);
    const userId = (link as { user_id: string }[] | null)?.[0]?.user_id;
    if (!userId) {
      throw new AdminInputError(
        "This shop has no vendor login yet — link one first.",
        404,
      );
    }
    const service = getSupabaseService();
    if (!service) throw new AdminInputError("Service key is not configured.", 503);
    const password = generateTemporaryPassword();
    await setApplicantPassword(service, userId, password);
    return apiJson({ password });
  },
  { limit: 10, roles: ["admin", "super_admin"] },
);
