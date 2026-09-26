/**
 * GET /api/admin/applications — how many shop and rider applications are
 * waiting for approval (apply = sign up, 2026-09-26).
 *
 * Feeds the badge on Admin → Shops / Riders and the dashboard banner so a
 * new application is seen without opening either queue. Two head-only
 * counts; staff RLS already covers both tables.
 */
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("applications-pending", async ({ db }) => {
  const [shops, riders] = await Promise.all([
    db.from("shops").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("riders").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return apiJson({
    shops: shops.error ? 0 : (shops.count ?? 0),
    riders: riders.error ? 0 : (riders.count ?? 0),
  });
});
