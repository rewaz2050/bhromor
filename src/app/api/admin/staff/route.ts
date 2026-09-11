/**
 * Admin → Staff (admin control center).
 * GET → staff list with roles. POST { email, role } → grant/update.
 * DELETE { email } → revoke. Admin/super_admin only — managers never
 * hand out access. Staff accounts are real.
 */
import {
  grantStaffRole,
  listStaff,
  revokeStaffRole,
} from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

const ROLES = { roles: ["admin", "super_admin"] as const, limit: 20 };

export const GET = staffRoute(
  "staff-list",
  async () => {
    const staff = await listStaff();
    return apiJson({ staff });
  },
  { ...ROLES },
);

export const POST = staffRoute(
  "staff-grant",
  async ({ user, role }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const member = await grantStaffRole({ id: user.id, role }, body);
    return apiJson({ member });
  },
  { ...ROLES },
);

export const DELETE = staffRoute(
  "staff-revoke",
  async ({ user, role }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const revoked = await revokeStaffRole({ id: user.id, role }, body);
    return apiJson({ revoked });
  },
  { ...ROLES },
);
