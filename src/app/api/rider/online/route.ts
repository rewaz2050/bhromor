import { apiJson } from "@/lib/api-response";
import { setRiderOnline } from "@/lib/db/riders";
import { RiderInputError } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** PATCH /api/rider/online — rider flips only their own online switch. */
export const PATCH = riderRoute("online", async (ctx, request) => {
  const body = (await request.json().catch(() => null)) as {
    isOnline?: unknown;
  } | null;
  if (!body || typeof body.isOnline !== "boolean") {
    throw new RiderInputError("isOnline must be true or false.", 422);
  }
  await setRiderOnline(ctx.service, ctx.rider.id, body.isOnline);
  return apiJson({ online: body.isOnline });
});
