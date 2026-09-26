/**
 * GET /api/admin/access-requests — the password-reset request queue
 * (2026-09-26; no SMS, no e-mail). Pending first, then recent decisions.
 * Staff RLS scopes the table; any staff role may look.
 */
import { apiJson } from "@/lib/api-response";
import { listResetRequests } from "@/lib/db/password-reset";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("access-requests", async ({ db }) => {
  try {
    return apiJson(await listResetRequests(db));
  } catch {
    // Migration not applied yet → an empty queue with a flag, not a 503.
    return apiJson({ pending: [], recent: [], ready: false });
  }
});
