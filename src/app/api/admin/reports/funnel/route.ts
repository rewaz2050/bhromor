/**
 * GET /api/admin/reports/funnel?days=7|28 — the first-party funnel report
 * (UX plan §0) for Admin → Reports. Staff only. 503 with `missing: true`
 * when migration 202609260004 (storefront_events + ps_funnel_report) has
 * not been applied yet, so the card can say "run the migration" instead of
 * showing zeros as if the shop were empty.
 */

import { apiJson } from "@/lib/api-response";
import { funnelReport, FunnelReportMissingError } from "@/lib/db/reports";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

const parseDays = (raw: string | null): 7 | 28 => (raw === "28" ? 28 : 7);

export const GET = staffRoute("reports-funnel", async ({ db }, request) => {
  const days = parseDays(new URL(request.url).searchParams.get("days"));
  try {
    return apiJson(await funnelReport(db, days));
  } catch (error) {
    if (error instanceof FunnelReportMissingError) {
      return apiJson({ error: "Funnel report is not installed yet.", missing: true }, 503);
    }
    throw error;
  }
});
