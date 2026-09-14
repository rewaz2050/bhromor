/**
 * POST /api/admin/warranty/[claimId] { action: "review" | "approve" |
 * "reject", note? } — the shop's decision on a warranty claim (P1 #14).
 *
 * approve/reject are terminal and take a note the customer sees
 * (what will happen, or why not). The replacement/refund itself is the
 * shop's offline handling — the claim records the decision, not the cash.
 */
import { performClaimAction } from "@/lib/db/warranty";
import { apiError, apiJson } from "@/lib/api-response";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["review", "approve", "reject"]);

export const POST = staffRoute(
  "warranty-claim-action",
  async ({ db }, request, routeContext) => {
    const id = await routeId(routeContext);
    let body: { action?: string; note?: string };
    try {
      body = (await request.json()) as { action?: string; note?: string };
    } catch {
      return apiError("Invalid request.", 400);
    }
    const action = body?.action;
    if (typeof action !== "string" || !ACTIONS.has(action)) {
      return apiError("Unknown claim action.", 422);
    }
    try {
      await performClaimAction(
        db,
        id,
        action as "review" | "approve" | "reject",
        body.note,
      );
      return apiJson({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "claim action failed";
      return apiError(message, 409);
    }
  },
);
