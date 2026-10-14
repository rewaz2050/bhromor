/**
 * GET/POST /api/admin/threads/:id — staff reading and answering a thread.
 *
 * Staff are not scoped to a shop here (that is the point of the oversight
 * inbox), so there is no ownership check to run — the wrapper's staff
 * verification is the boundary, and every route in this file sits behind it.
 */

import { staffRoute, routeId } from "../../_lib";
import { appendMessage, threadMessages } from "@/lib/db/customer-threads";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = staffRoute("threads-read", async ({ db }, _request, context) => {
  const id = await routeId(context as { params?: Promise<{ id?: string }> });
  const { messages, reason } = await threadMessages(db, id);
  if (reason) return apiJson({ messages: [], reason }, reason === "missing_table" ? 501 : 503);
  return apiJson({ messages });
});

export const POST = staffRoute("threads-reply", async ({ db, user }, request, context) => {
  const id = await routeId(context as { params?: Promise<{ id?: string }> });
  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (text.length < 1) return apiError("An empty message cannot be sent.", 422);
  const outcome = await appendMessage(db, id, "platform", user.email ?? "PROSANTI", text);
  if (outcome === "missing_table") return apiJson({ sent: false, reason: outcome }, 501);
  if (outcome !== "saved") return apiError("Could not send.", 503);
  return apiJson({ sent: true });
});
