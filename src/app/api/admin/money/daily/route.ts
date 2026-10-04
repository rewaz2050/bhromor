/** GET /api/admin/money/daily?date=YYYY-MM-DD — one Dhaka day's reconciliation (audit U). */
import { getAdminMoneyDaily } from "@/lib/db/rider-money";
import { apiJson } from "@/lib/api-response";
import { parseDay } from "@/lib/money-daily";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("money-daily", async ({ db }, request) => {
  const day = parseDay(new URL(request.url).searchParams.get("date"));
  const report = await getAdminMoneyDaily(db, day);
  return apiJson({ ready: report !== null, day, report });
});
