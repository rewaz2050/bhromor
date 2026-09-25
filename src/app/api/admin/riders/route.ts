/**
 * Staff riders queue (marketplace phase 3, slice 6).
 * GET → all riders, pending first, plus pending settle claims. POST → staff
 * upsert (manual create, approve/suspend/zone edits). Contact details stay
 * staff-only.
 */
import { listRidersFull, upsertRider } from "@/lib/db/admin";
import { listPendingSettleClaims } from "@/lib/db/riders";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("riders-list", async ({ db }) => {
  const riders = await listRidersFull(db);
  // Claims live in a service-only table; staffRoute already verified staff.
  const service = getSupabaseService();
  const settleClaims = service ? await listPendingSettleClaims(service) : [];
  return apiJson({ riders, settleClaims });
});

export const POST = staffRoute(
  "riders-write",
  async ({ db }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const rider = await upsertRider(db, body);
    return apiJson({ rider });
  },
  { limit: 30 },
);
