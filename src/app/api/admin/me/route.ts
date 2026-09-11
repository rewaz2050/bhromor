/**
 * GET /api/admin/me — staff session probe.
 * 200 { staff: true, role, email } for signed-in staff; 401 without a
 * session; 403 for signed-in non-staff.
 * The admin UI uses this to confirm the staff session — and the data routes
 * re-verify on every call, so this answer is never trusted for access.
 */

import { requireStaff, StaffAuthError } from "@/lib/staff-auth";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, role } = await requireStaff();
    return apiJson({ staff: true as const, role, email: user.email ?? null });
  } catch (err) {
    if (err instanceof StaffAuthError) {
      return apiJson(
        { staff: false as const, reason: err.message },
        err.status,
      );
    }
    return apiJson({ staff: false as const, reason: "Sign-in check failed." }, 503);
  }
}
