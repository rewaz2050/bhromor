import { apiJson } from "@/lib/api-response";
import { settleRiderCash } from "@/lib/db/riders";
import { RiderInputError } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** POST /api/rider/settle — rider hands in COD cash (bank/bKash/office). */
export const POST = riderRoute("settle", async (ctx, request) => {
  const body = (await request.json().catch(() => null)) as {
    method?: unknown;
    reference?: unknown;
  } | null;
  const method =
    typeof body?.method === "string" ? body.method.trim().slice(0, 40) : "cash";
  const reference =
    typeof body?.reference === "string"
      ? body.reference.trim().slice(0, 120)
      : "";
  if (!["cash", "bkash", "bank"].includes(method.toLowerCase())) {
    throw new RiderInputError("Method must be cash, bkash or bank.", 422);
  }
  await settleRiderCash(ctx.db, method, reference);
  return apiJson({ settled: true, amount: ctx.rider.cashInHand });
});
