/**
 * GET /api/admin/applications — how many shop and rider applications, and
 * password-reset requests, are waiting for staff (apply = sign up, 2026-09-26).
 *
 * Feeds the badge on Admin → Shops / Riders and the dashboard banner so a
 * new application is seen without opening either queue. Two head-only
 * counts; staff RLS already covers both tables.
 */
import { apiJson } from "@/lib/api-response";
import { countPendingResetRequests } from "@/lib/db/password-reset";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("applications-pending", async ({ db }) => {
  const [shops, riders, resets] = await Promise.all([
    db.from("shops").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("riders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // Password-reset requests (no e-mail reset exists) — 0 until the
    // migration is applied; the count query simply errors before that.
    countPendingResetRequests(db),
  ]);
  return apiJson({
    shops: shops.error ? 0 : (shops.count ?? 0),
    riders: riders.error ? 0 : (riders.count ?? 0),
    resets,
  });
});
