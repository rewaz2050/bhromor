/** POST /api/admin/riders/:id/settle — staff records a rider pay-in and
 * zeroes cash-in-hand (writes a rider_settlements row atomically). */
import { settleRiderCashByAdmin } from "@/lib/db/riders";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "riders-settle",
  async ({ db }, request, context) => {
    const id = await routeId(context as { params?: Promise<{ id?: string }> });
    const body: unknown = await request.json().catch(() => null);
    const b = (body ?? {}) as { method?: unknown; reference?: unknown };
    const method =
      typeof b.method === "string" ? b.method.trim().slice(0, 32) : "cash";
    const reference =
      typeof b.reference === "string" ? b.reference.trim().slice(0, 120) : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return apiError("A valid rider id is required.", 422);
    }
    await settleRiderCashByAdmin(db, id, method, reference);
    return apiJson({ ok: true });
  },
  { limit: 20 },
);
