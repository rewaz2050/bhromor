import { apiJson } from "@/lib/api-response";
import { settleRiderCash } from "@/lib/db/riders";
import { RiderInputError } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * POST /api/rider/settle — the rider files a COD pay-in CLAIM (202609250004).
 * The hand balance stays untouched until staff approve it via the admin
 * settle flow; the response carries the pending claim for the app to show.
 */
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
  if (method.toLowerCase() !== "cash" && reference.length < 3) {
    throw new RiderInputError("bKash/bank-এর জন্য reference/TRXID দিন।", 422);
  }
  const claim = await settleRiderCash(ctx.db, method, reference);
  return apiJson({ claimed: true, claim });
});
