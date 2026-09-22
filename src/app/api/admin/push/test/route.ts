/**
 * POST /api/admin/push/test — fire a test Web Push at every registered
 * staff device. Lets the owner confirm the phone pipeline works right
 * after enabling it, without placing a real order.
 */

import { pushStaffNotice } from "@/lib/push";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "push-test",
  async ({ db }) => {
    await pushStaffNotice(db, {
      kind: "system",
      title: "PROSANTI test notification",
      body: "Phone delivery is live — orders will arrive here.",
      href: "/admin",
    });
    return apiJson({ ok: true as const });
  },
  { limit: 4, windowMs: 60_000 },
);
