/** POST /api/admin/deliveries/offer — staff creates an offer for an order
 * that has no active assignment (auto-dispatch missed or needed a retry). */
import { offerOrderForDispatch } from "@/lib/db/riders";
import { apiJson, apiError } from "@/lib/api-response";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

const isUuid = (value: string): boolean =>
  /^[0-9a-f-]{36}$/i.test(value);

export const POST = staffRoute(
  "deliveries-offer",
  async ({ db }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const orderId =
      typeof (body as Record<string, unknown> | null)?.orderId === "string"
        ? ((body as Record<string, string>).orderId ?? "").trim()
        : "";
    if (!isUuid(orderId)) return apiError("A valid order id is required.", 422);
    const id = await offerOrderForDispatch(db, orderId);
    return apiJson({ id });
  },
  { limit: 20 },
);
