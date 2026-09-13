/**
 * GET /api/admin/live — every live shopping session for /admin/live (P1 #9).
 */
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";
import { listLiveSessions } from "@/lib/db/live";

export const dynamic = "force-dynamic";

export const GET = staffRoute("live-list", async ({ db }) => {
  const sessions = await listLiveSessions(db);
  return apiJson({ sessions });
});
