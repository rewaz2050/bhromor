/**
 * POST /api/admin/live/sessions/[id]/start — the shop's stream is live, so
 * the site goes LIVE too (P1 #9). Requires a stream URL: the page embeds
 * that real stream, so a session without one cannot honestly be "live".
 */
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../../../_lib";
import { startLiveSession } from "@/lib/db/live";

export const dynamic = "force-dynamic";

export const POST = staffRoute("live-start", async ({ db }, _request, routeContext) => {
  const id = await routeId(routeContext);
  const session = await startLiveSession(db, id);
  return apiJson({ ok: true, session });
});
