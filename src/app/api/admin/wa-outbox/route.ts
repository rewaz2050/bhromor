/**
 * GET  /api/admin/wa-outbox[?order=PS-…&limit=] — the free WhatsApp drafts.
 * POST /api/admin/wa-outbox { id, action: "opened" | "dismissed" } — close one.
 *
 * `wa_outbox` is service-role only (RLS on, no policies), so this route runs
 * its reads/writes on the service client after `staffRoute` has verified the
 * session — the same shape the push routes use.
 *
 * `ready: false` means migration `202609240003_wa_outbox.sql` was never run.
 * The panel says so (naming the file) instead of drawing an empty queue that
 * would look like "nothing to send".
 */
import { apiError, apiJson } from "@/lib/api-response";
import { getSupabaseService } from "@/lib/supabase-server";
import { customerEventShort } from "@/lib/notify-messages";
import {
  WA_OUTBOX_MIGRATION,
  closeWaDraft,
  listWaDrafts,
  waDraftLink,
} from "@/lib/wa-outbox";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("wa-outbox", async (_ctx, request) => {
  const url = new URL(request.url);
  const orderNo = (url.searchParams.get("order") ?? "").trim().slice(0, 40);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const service = getSupabaseService();
  if (!service) return apiError("service not configured", 503);

  const { ready, drafts } = await listWaDrafts(service, {
    orderNo: orderNo || undefined,
    limit: Number.isFinite(limit) ? limit : 20,
  });
  return apiJson({
    ready,
    ...(ready ? {} : { migration: WA_OUTBOX_MIGRATION }),
    drafts: drafts.map((draft) => ({
      ...draft,
      // The chip label and the one-tap link are built here (server side) so the
      // panel is a dumb renderer and the copy cannot drift from the message.
      label: customerEventShort(draft.kind, draft.lang),
      link: waDraftLink(draft),
    })),
  });
});

const ACTIONS = new Set(["opened", "dismissed"]);

export const POST = staffRoute(
  "wa-outbox-close",
  async (_ctx, request) => {
    let body: { id?: string; action?: string };
    try {
      body = (await request.json()) as { id?: string; action?: string };
    } catch {
      return apiError("Invalid request.", 400);
    }
    const id = typeof body?.id === "string" ? body.id.trim().slice(0, 64) : "";
    const action = body?.action;
    if (!id || typeof action !== "string" || !ACTIONS.has(action)) {
      return apiError("id and action (opened | dismissed) required", 422);
    }
    const service = getSupabaseService();
    if (!service) return apiError("service not configured", 503);

    const ok = await closeWaDraft(service, id, action as "opened" | "dismissed");
    if (!ok) return apiError("Could not update the draft.", 422);
    return apiJson({ ok: true });
  },
  { limit: 60 },
);
