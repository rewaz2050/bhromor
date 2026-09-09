/**
 * Staff inbox (§35).
 * GET /api/admin/notifications?unread=1 — my notices, newest first.
 * PATCH /api/admin/notifications { id } | { all: true } — mark read.
 */

import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/db/engagement";
import { apiError, apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute(
  "notifications-list",
  async ({ db, user }, request) => {
    const url = new URL(request.url);
    const notifications = await listMyNotifications(db, user.id, {
      unreadOnly: url.searchParams.get("unread") === "1",
    });
    return apiJson({ notifications });
  },
);

export const PATCH = staffRoute(
  "notifications-read",
  async ({ db, user }, request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid update.", 400);
    }
    const b = (body ?? {}) as Record<string, unknown>;
    if (b.all === true) {
      await markAllNotificationsRead(db, user.id);
    } else {
      await markNotificationRead(
        db,
        user.id,
        typeof b.id === "string" ? b.id : "",
      );
    }
    return apiJson({ ok: true as const });
  },
);
