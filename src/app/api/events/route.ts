/**
 * POST /api/events — the storefront's own funnel sink (UX plan §0).
 *
 * The browser batches a few anonymous events (page_view, view_item,
 * add_to_cart, begin_checkout, purchase, search, scroll_depth,
 * view_item_list, select_item) and sends them here via sendBeacon. We
 * validate hard (whitelisted names, short strings, ≤ 25 per batch), rate
 * limit per IP, and insert with the service role into `storefront_events`
 * (migration 202609260004). Nothing personal is accepted or stored: the
 * session id is a random per-tab token, and there is no user id.
 *
 * Always answers 204 — a beacon has nobody to show an error to, and a
 * missing table / unconfigured backend must never break the shop.
 */

import { sanitizeWireBatch } from "@/lib/funnel-events";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

const noContent = (status = 204) => new Response(null, { status });

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const gate = checkRateLimit(`events:${ip}`, 60, 60_000);
  if (!gate.allowed) return noContent(429);

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return noContent(413);
    raw = JSON.parse(text);
  } catch {
    return noContent(400);
  }
  const batch = sanitizeWireBatch(raw);
  if (!batch) return noContent(400);

  const db = getSupabaseService();
  if (!db) return noContent();

  const now = new Date().toISOString();
  const rows = batch.events.map((e) => ({
    created_at: now,
    session_id: batch.sid,
    event: e.t,
    path: e.p ?? null,
    product_id: e.pid ?? null,
    shop_id: e.shop ?? null,
    source: e.src ?? null,
    value: e.v ?? null,
    meta: e.meta ?? {},
    lang: e.lang ?? null,
  }));
  try {
    await db.from("storefront_events").insert(rows);
  } catch {
    /* swallowed — see header comment */
  }
  return noContent();
}
