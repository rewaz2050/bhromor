/**
 * PUT /api/admin/live/sessions/[id] — edit a SCHEDULED session (P1 #9).
 * DELETE /api/admin/live/sessions/[id] — delete a scheduled session.
 *
 * Live and ended sessions keep their record — the shop's history is honest.
 */
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../../_lib";
import {
  deleteLiveSession,
  updateLiveSession,
} from "@/lib/db/live";
import { firstError, parseSessionBody } from "../../_lib";

export const dynamic = "force-dynamic";

export const PUT = staffRoute("live-update", async ({ db }, request, routeContext) => {
  const id = await routeId(routeContext);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiJson({ error: "Invalid request." }, 400);
  }
  const parsed = await parseSessionBody(db, body);
  const bad = firstError(parsed);
  if (bad) return bad;
  const session = await updateLiveSession(db, id, parsed.value!, parsed.value!.productIds);
  return apiJson({ ok: true, session });
});

export const DELETE = staffRoute("live-delete", async ({ db }, _request, routeContext) => {
  const id = await routeId(routeContext);
  await deleteLiveSession(db, id);
  return apiJson({ ok: true });
});
