/**
 * POST /api/admin/live/sessions/[id]/end — the stream is over (or a
 * scheduled session is skipped) (P1 #9).
 */
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../../../_lib";
import { endLiveSession } from "@/lib/db/live";

export const dynamic = "force-dynamic";

export const POST = staffRoute("live-end", async ({ db }, _request, routeContext) => {
  const id = await routeId(routeContext);
  const session = await endLiveSession(db, id);
  return apiJson({ ok: true, session });
});
