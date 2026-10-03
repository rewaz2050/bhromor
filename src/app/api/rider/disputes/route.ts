/**
 * GET  /api/rider/disputes — this rider's complaints (newest 20) with staff's answer (item W).
 * POST /api/rider/disputes — raise one: { category, message, assignmentId?, claimedTaka? }.
 * The RPC runs on the rider's own JWT (it reads auth.uid()), refuses other riders' trips,
 * a second open complaint on the same trip, and more than 5 open at once.
 */
import { apiJson } from "@/lib/api-response";
import { notifyStaff } from "@/lib/db/engagement";
import { listRiderDisputes, raiseRiderDispute } from "@/lib/db/rider-disputes";
import { RiderInputError } from "@/lib/db/riders";
import { disputeCategoryLabel, parseRaiseInput } from "@/lib/rider-disputes";
import { getSupabaseService } from "@/lib/supabase-server";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = riderRoute("disputes", async (ctx) => apiJson(await listRiderDisputes(ctx.service, ctx.rider.id)));

export const POST = riderRoute(
  "disputes-raise",
  async (ctx, request) => {
    const input = parseRaiseInput(await request.json().catch(() => null));
    if ("error" in input) throw new RiderInputError(input.error, 422);
    const dispute = await raiseRiderDispute(ctx.db, input);
    // Staff bell is best-effort — the dispute row is the source of truth.
    const service = getSupabaseService();
    if (service) {
      await notifyStaff(service, {
        kind: "system",
        title: `Rider dispute — ${ctx.rider.name}`,
        body: `${disputeCategoryLabel(input.category, "en")}: ${input.message.slice(0, 120)}`,
        href: "/admin/riders/disputes",
      });
    }
    return apiJson({ dispute }, 201);
  },
  { limit: 10 },
);
