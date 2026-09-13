/**
 * POST /api/admin/live/sessions/[id]/showing { productId | null } — mark the
 * one piece on air right now (P1 #9). Live sessions only; the id must be in
 * this session's pieces.
 */
import { apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../../../_lib";
import { setShowingProduct } from "@/lib/db/live";

export const dynamic = "force-dynamic";

export const POST = staffRoute("live-showing", async ({ db }, request, routeContext) => {
  const id = await routeId(routeContext);
  let body: { productId?: string | null };
  try {
    body = (await request.json()) as { productId?: string | null };
  } catch {
    return apiJson({ error: "Invalid request." }, 400);
  }
  const productId =
    typeof body?.productId === "string" && body.productId.trim()
      ? body.productId.trim()
      : null;
  const session = await setShowingProduct(db, id, productId);
  return apiJson({ ok: true, session });
});
