/**
 * POST /api/admin/live/sessions — schedule a live shopping session (P1 #9).
 *
 * Body: { title, description?, streamUrl?, startsAt (epoch ms),
 * productIds: string[] (ordered, unique, real catalog ids) }.
 */
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../../_lib";
import { createLiveSession } from "@/lib/db/live";
import { firstError, parseSessionBody } from "../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute("live-create", async ({ db }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiJson({ error: "Invalid request." }, 400);
  }
  const parsed = await parseSessionBody(db, body);
  const bad = firstError(parsed);
  if (bad) return bad;
  const session = await createLiveSession(db, parsed.value!, parsed.value!.productIds);
  return apiJson({ ok: true, session }, 201);
});
