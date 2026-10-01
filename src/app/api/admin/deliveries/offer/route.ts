/** POST /api/admin/deliveries/offer — staff creates an offer for an order
 * that has no active assignment (auto-dispatch missed or needed a retry).
 * `orderId` may be the public order number (what the board holds) or the
 * row id. */
import { offerOrderForDispatch, resolveOrderRowIds } from "@/lib/db/riders";
import { apiJson, apiError } from "@/lib/api-response";
import { staffRoute } from "../../_lib";
import { sendRiderOfferPush } from "@/lib/rider-push";

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
    // Best-effort background notification; realtime/in-app offer remains the
    // source of truth when push is unavailable.
    const { data: offers } = await db
      .from("delivery_assignments")
      .select("rider_id")
      .eq("order_id", orderId)
      .eq("state", "offered")
      .limit(100);
    const riderIds = (offers ?? []).map((row) => row.rider_id).filter((value): value is string => typeof value === "string");
    if (riderIds.length > 0) {
      const { data: order } = await db.from("orders").select("order_no,total").eq("id", orderId).maybeSingle();
      await sendRiderOfferPush(db, riderIds, {
        title: "Delivery offer",
        body: `New job ${order?.order_no ?? ""} — first rider to accept gets it.`,
        href: "/rider",
      });
    }
    return apiJson({ id });
  },
  { limit: 20 },
);
