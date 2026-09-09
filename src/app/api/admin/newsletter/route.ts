/**
 * Staff newsletter list.
 * GET /api/admin/newsletter — every subscriber, newest first.
 * DELETE /api/admin/newsletter?id=… — remove one (GDPR-style erasure;
 * customers unsubscribe themselves via their token link).
 */

import { deleteSubscriber, listSubscribers } from "@/lib/db/engagement";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("newsletter-list", async ({ db }) => {
  const subscribers = await listSubscribers(db);
  return apiJson({ subscribers });
});

export const DELETE = staffRoute(
  "newsletter-delete",
  async ({ db }, request) => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    await deleteSubscriber(db, id);
    return apiJson({ deleted: true as const });
  },
);
