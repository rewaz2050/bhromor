/** GET /api/admin/money/audit?event=&limit= — the append-only money trail (audit T). */
import { listMoneyAudit } from "@/lib/db/money-audit";
import { apiJson } from "@/lib/api-response";
import { parseAuditEvent, parseAuditLimit } from "@/lib/money-audit";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("money-audit", async ({ db }, request) => {
  const url = new URL(request.url);
  const event = parseAuditEvent(url.searchParams.get("event"));
  const entries = await listMoneyAudit(db, {
    event,
    limit: parseAuditLimit(url.searchParams.get("limit")),
  });
  return apiJson({ ready: entries !== null, event, entries: entries ?? [] });
});
