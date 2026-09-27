/**
 * POST /api/admin/riders/[id]/reset-password — staff sets a temporary
 * password for the rider's linked login (apply = sign up, 2026-09-26).
 *
 * No e-mail or SMS in this onboarding: the value is generated here, shown
 * once for the admin to pass on by phone, and the rider changes it from
 * their profile. Admin/super-admin only, tightly rate-limited.
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
  "rider-reset-password",
  async ({ db }, _request, routeContext) => {
    const id = await routeId(routeContext);
    const { data: rider } = await db
      .from("riders")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();
    const userId = (rider as { user_id: string | null } | null)?.user_id;
    if (!userId) {
      throw new AdminInputError(
        "This rider has no login yet — link one first.",
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
