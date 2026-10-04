/** GET /api/admin/rider-disputes?status=pending|decided — the dispute queue (item W, staff-only via RLS). */
import { apiJson } from "@/lib/api-response";
import { listDisputesForStaff } from "@/lib/db/rider-disputes";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("rider-disputes", async ({ db }, request) => {
  const status = new URL(request.url).searchParams.get("status") === "decided" ? "decided" : "pending";
  const items = await listDisputesForStaff(db, status);
  return apiJson({ ready: items !== null, items: items ?? [] });
});
