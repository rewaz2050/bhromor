/**
 * Staff contact inbox.
 * GET /api/admin/messages?status=new|read|replied — newest first.
 * PATCH /api/admin/messages { id, status } — mark read / replied.
 */

import {
  listContactMessages,
  setContactMessageStatus,
} from "@/lib/db/engagement";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("messages-list", async ({ db }, request) => {
  const url = new URL(request.url);
  const messages = await listContactMessages(
    db,
    url.searchParams.get("status") ?? undefined,
  );
  return apiJson({ messages });
});

export const PATCH = staffRoute("messages-status", async ({ db }, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid update.", 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const message = await setContactMessageStatus(
    db,
    typeof b.id === "string" ? b.id : "",
    typeof b.status === "string" ? b.status : "",
  );
  return apiJson({ message });
});
