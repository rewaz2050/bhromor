/**
 * POST /api/admin/access-requests/[id] — decide a password-reset request
 * (2026-09-26; no SMS, no e-mail). Body {action: "approve" | "reject",
 * note?}. Approving opens the requester's 24 h self-set window; rejecting
 * shows the note on their login page. Admin / super_admin only — this is a
 * credential decision, like the direct reset — and the caller is expected
 * to have called the number on file first (the UI insists).
 */
import { apiJson } from "@/lib/api-response";
import { AdminInputError } from "@/lib/db/admin";
import { ResetRequestError, decideResetRequest } from "@/lib/db/password-reset";
import { routeId, staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const POST = staffRoute(
  "access-request-decide",
  async ({ db, user }, request, routeContext) => {
    const id = await routeId(routeContext);
    if (!id) throw new AdminInputError("Missing request id.", 400);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminInputError("Invalid body.", 400);
    }
    const fields = (body ?? {}) as Record<string, unknown>;
    const action = fields.action;
    if (action !== "approve" && action !== "reject") {
      throw new AdminInputError("action must be approve or reject.", 400);
    }
    try {
      const request_ = await decideResetRequest(db, {
        id,
        action,
        note: typeof fields.note === "string" ? fields.note : null,
        staffId: user.id,
      });
      return apiJson({ request: request_ });
    } catch (err) {
      if (err instanceof ResetRequestError) throw new AdminInputError(err.message, err.status);
      throw err;
    }
  },
  { limit: 30, roles: ["admin", "super_admin"] },
);
