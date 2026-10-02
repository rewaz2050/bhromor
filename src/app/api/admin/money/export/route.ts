/**
 * GET /api/admin/money/export?kind=&from=&to= — a ledger as a CSV file for the
 * accountant (item Y). Admin / super-admin only (managers cannot pull the
 * books), rate-limited, capped at 20,000 rows and one year per file.
 */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { buildMoneyExport } from "@/lib/db/money-export";
import { exportFilename, parseExportKind, parseExportRange } from "@/lib/money-export";
import { getSupabaseService } from "@/lib/supabase-server";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "money-export",
  async (_ctx, request) => {
    const url = new URL(request.url);
    const kind = parseExportKind(url.searchParams.get("kind"));
    if (!kind) return apiError("Choose which ledger to export.", 422);
    const parsed = parseExportRange(url.searchParams.get("from"), url.searchParams.get("to"));
    if (!parsed.ok) return apiError(parsed.error, 422);
    const service = getSupabaseService();
    if (!service) return apiError("Service role is not configured.", 503);

    const { csv, count, truncated } = await buildMoneyExport(service, kind, parsed.range);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(kind, parsed.range)}"`,
        "Cache-Control": "no-store",
        "X-Export-Rows": String(count),
        "X-Export-Truncated": truncated ? "1" : "0",
        "Access-Control-Expose-Headers": "X-Export-Rows, X-Export-Truncated, Content-Disposition",
      },
    });
  },
  { limit: 10, roles: ["admin", "super_admin"] },
);
