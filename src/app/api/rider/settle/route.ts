import { apiJson } from "@/lib/api-response";
import { settleRiderCash, settleClaimsReady, RiderInputError } from "@/lib/db/riders";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/**
 * POST /api/rider/settle — the rider files a COD pay-in CLAIM (202609250004).
 * The hand balance stays untouched until staff approve it via the admin
 * settle flow; the response carries the pending claim for the app to show.
 *
 * Safety: on a database where the claims migration has not run, the OLD
 * `ps_rider_settle` zeroes the rider's cash on the spot with no approval.
 * The probe refuses that path instead (503) — after 202609250004 is applied
 * this guard is a single cheap head-count and never triggers.
 */
export const POST = riderRoute("settle", async (ctx, request) => {
  if (!(await settleClaimsReady(ctx.service))) {
    throw new RiderInputError(
      "টাকা জমার অনুরোধ সাময়িকভাবে বন্ধ — ব্যাকএন্ড আপডেট (migration 202609250004) এখনো প্রয়োগ হয়নি। সরাসরি জমা দেওয়া নিরাপদ নয়, তাই বন্ধ রাখা হয়েছে। অ্যাডমিনকে জানান।",
      503,
    );
  }
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
