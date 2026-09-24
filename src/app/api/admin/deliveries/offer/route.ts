/** POST /api/admin/deliveries/offer — staff creates an offer for an order
 * that has no active assignment (auto-dispatch missed or needed a retry).
 * `orderId` may be the public order number (what the board holds) or the
 * row id. */
import { offerOrderForDispatch, resolveOrderRowIds } from "@/lib/db/riders";
import { notifyRiderOfOffer } from "@/lib/rider-push";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson, apiError } from "@/lib/api-response";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "deliveries-offer",
  async ({ db }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const ref =
      typeof (body as Record<string, unknown> | null)?.orderId === "string"
        ? ((body as Record<string, string>).orderId ?? "").trim()
        : "";
    if (!ref || ref.length > 64) return apiError("A valid order id is required.", 422);
    const [orderId] = await resolveOrderRowIds(db, [ref]);
    const id = await offerOrderForDispatch(db, orderId);
    // A hand-made offer must buzz the rider like an automatic one (2026-09-25):
    // without this the board says "assigned" and the rider's phone stays dark.
    const service = getSupabaseService();
    if (service) await notifyRiderOfOffer(service, orderId);
    return apiJson({ id });
  },
  { limit: 20 },
);
