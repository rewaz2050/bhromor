/**
 * PUT /api/bag/snapshot — the storefront tells the server what is in the
 * bag on THIS push device (UX plan §5, R10), so the scheduler can send one
 * "your bag is waiting" push ~24 h later.
 *
 *   • body: { endpoint, count, subtotal, topName?, topSlug?, lang? }
 *   • 204 for a device that never opted in to offers push — nothing is kept
 *   • 200 { stored: true } when the row was written (count 0 = bag emptied)
 *   • 503 naming the migration when the table is missing
 *
 * No phone, no name, no address: the snapshot is keyed by the push endpoint
 * the browser already holds, and a leaked endpoint lets a stranger do
 * nothing worse than change the count on their own reminder.
 */

import { apiError, apiJson } from "@/lib/api-response";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";
import { BAG_SNAPSHOTS_MIGRATION, saveBagSnapshot } from "@/lib/abandoned-bag";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 30;

export async function PUT(request: Request) {
  const bucket = checkRateLimit(`bag-snapshot:${clientIpFromHeaders(request.headers)}`, LIMIT, WINDOW_MS);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  if (!isServiceRoleConfigured()) return new Response(null, { status: 204 });
  const db = getSupabaseService();
  if (!db) return new Response(null, { status: 204 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("Invalid request.", 400);
  }
  try {
    const saved = await saveBagSnapshot(db, {
      endpoint: body.endpoint,
      count: body.count,
      subtotal: body.subtotal,
      topName: body.topName,
      topSlug: body.topSlug,
      lang: body.lang,
    });
    if (!saved.ok) {
      if (saved.reason === "invalid") return apiError("Invalid request.", 400);
      if (saved.reason === "missing_table") {
        return apiError(`bag_snapshots table nai — ${BAG_SNAPSHOTS_MIGRATION} run korun.`, 503);
      }
      return apiError("Could not save the bag.", 503);
    }
    if (!saved.stored) return new Response(null, { status: 204 });
    return apiJson({ ok: true as const, stored: true as const });
  } catch {
    return apiError("Could not save the bag.", 503);
  }
}
