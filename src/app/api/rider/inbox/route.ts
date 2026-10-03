import { apiJson } from "@/lib/api-response";
import { getRiderInbox, markRiderInboxRead } from "@/lib/db/rider-inbox";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/rider/inbox — office announcements for this rider (broadcast + personal) with the unread count. */
export const GET = riderRoute("inbox", async (ctx) => apiJson(await getRiderInbox(ctx.service, ctx.rider.id)));

/** POST /api/rider/inbox — "I have read everything up to now" (self-scoped, no body). */
export const POST = riderRoute(
  "inbox-read",
  async (ctx) => {
    await markRiderInboxRead(ctx.service, ctx.rider.id);
    return apiJson({ ok: true });
  },
  { limit: 30 },
);
