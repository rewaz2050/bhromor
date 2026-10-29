/**
 * Staff riders queue (marketplace phase 3, slice 6).
 * GET → all riders, pending first, plus pending settle claims. POST → staff
 * upsert (manual create, approve/suspend/zone edits). Contact details stay
 * staff-only.
 */
import type { Rider } from "@/lib/catalog";
import { canReadAdminFinance } from "@/lib/admin-finance-access";
import { listRidersFull, upsertRider } from "@/lib/db/admin";
import { listPendingSettleClaims } from "@/lib/db/riders";
import { readDispatchSettings } from "@/lib/db/dispatch-settings";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

const staffRider = (rider: Rider, role: string): Rider => {
  if (canReadAdminFinance(role)) return rider;
  const operational = { ...rider };
  delete operational.earningsBalance;
  return operational;
};

export const dynamic = "force-dynamic";

export const GET = staffRoute("riders-list", async ({ db, role }) => {
  const fullRiders = await listRidersFull(db);
  const finance = canReadAdminFinance(role);
  // Keep operational cash custody/load; private wallet earnings are not dispatch.
  const riders = fullRiders.map((rider) => staffRider(rider, role));
  // Do not acquire the service client for a Manager roster request.
  const service = finance ? getSupabaseService() : null;
  const settleClaims = service ? await listPendingSettleClaims(service) : [];
  // J: the cash cap the board colours against (defaults when unset).
  const dispatch = await readDispatchSettings(db);
  return apiJson({ riders, settleClaims, dispatch });
});

export const POST = staffRoute(
  "riders-write",
  async ({ db, role }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const rider = await upsertRider(db, body);
    return apiJson({ rider: staffRider(rider, role) });
  },
  { limit: 30, roles: ["admin", "super_admin"] },
);
