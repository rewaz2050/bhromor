/**
 * /api/admin/push/broadcast — the weekly "drops & offers" push (UX plan §12).
 *
 *   GET  → { configured, ready, audience, last, nextAllowedAt }
 *   POST → { title, titleBn, body, bodyBn, href } → sends to every opted-in
 *          device; { devices, accepted, sentAt }
 *
 * Staff-gated (admin+), then served through the SERVICE client because the
 * subscription table is RLS-closed on purpose (customer endpoints are never
 * readable by a staff session). The seven-day gap is enforced HERE from the
 * newest `push_broadcasts.sent_at` — reloading the admin page cannot bypass
 * it. No SMS, no email: the only channel is the one the shopper turned on.
 */

import { apiError, apiJson } from "@/lib/api-response";
import { getSupabaseService } from "@/lib/supabase-server";
import {
  broadcastAudienceCount,
  broadcastCustomerPush,
  isCustomerPushConfigured,
} from "@/lib/customer-push";
import {
  broadcastPayload,
  nextBroadcastAllowedAt,
  parseBroadcast,
} from "@/lib/push-broadcast";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

const MISSING =
  "push_broadcasts table nai — Supabase → SQL Editor e supabase/migrations/202609270001_push_broadcasts.sql run korun.";

interface BroadcastRow {
  id: string;
  title: string;
  title_bn: string;
  body: string;
  body_bn: string;
  href: string;
  devices: number;
  accepted: number;
  sent_at: string;
}

const isMissing = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || msg.includes("does not exist") || msg.includes("schema cache");
};

const lastBroadcast = async (
  db: NonNullable<ReturnType<typeof getSupabaseService>>,
): Promise<{ row: BroadcastRow | null; missing: boolean }> => {
  const { data, error } = await db
    .from("push_broadcasts")
    .select("id, title, title_bn, body, body_bn, href, devices, accepted, sent_at")
    .order("sent_at", { ascending: false })
    .limit(1);
  if (error) return { row: null, missing: isMissing(error) };
  const row = ((data ?? []) as BroadcastRow[])[0] ?? null;
  return { row, missing: false };
};

const view = (row: BroadcastRow | null) =>
  row
    ? {
        id: row.id,
        title: row.title,
        titleBn: row.title_bn,
        body: row.body,
        bodyBn: row.body_bn,
        href: row.href,
        devices: row.devices,
        accepted: row.accepted,
        sentAt: row.sent_at,
      }
    : null;

const ROLES = ["admin", "super_admin"] as const;

export const GET = staffRoute(
  "push-broadcast-status",
  async () => {
    const db = getSupabaseService();
    if (!db) return apiError("Service role is not configured.", 503);
    const { row, missing } = await lastBroadcast(db);
    const audience = missing ? 0 : await broadcastAudienceCount(db);
    const lastMs = row ? Date.parse(row.sent_at) : null;
    return apiJson({
      configured: isCustomerPushConfigured(),
      ready: !missing,
      audience,
      last: view(row),
      nextAllowedAt: nextBroadcastAllowedAt(Number.isFinite(lastMs as number) ? lastMs : null),
    });
  },
  { roles: ROLES },
);

export const POST = staffRoute(
  "push-broadcast-send",
  async ({ user }, request) => {
    if (!isCustomerPushConfigured()) return apiError("Push is not configured on the server (VAPID keys).", 503);
    const db = getSupabaseService();
    if (!db) return apiError("Service role is not configured.", 503);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("Invalid request.", 400);
    }
    const parsed = parseBroadcast(raw);
    if (!parsed.ok) return apiError(parsed.error, 400);

    const { row, missing } = await lastBroadcast(db);
    if (missing) return apiError(MISSING, 503);
    const lastMs = row ? Date.parse(row.sent_at) : null;
    const next = nextBroadcastAllowedAt(Number.isFinite(lastMs as number) ? lastMs : null);
    if (next !== null) {
      const res = apiError("One broadcast per week — the next one opens later.", 429);
      res.headers.set("Retry-After", String(Math.max(1, Math.ceil((next - Date.now()) / 1000))));
      return res;
    }

    let result: { devices: number; accepted: number; configured: boolean };
    try {
      result = await broadcastCustomerPush(db, {
        build: (lang) => broadcastPayload(parsed.draft, lang),
      });
    } catch (err) {
      if (isMissing(err as { code?: string; message?: string })) return apiError(MISSING, 503);
      return apiError("Could not send the broadcast — please try again.", 503);
    }
    if (result.devices === 0) {
      // Nothing to send to is not a send: no row, the weekly slot stays open.
      return apiError("Nobody has opted in to drops & offers yet — the slot stays open.", 409);
    }
    const sentAt = new Date().toISOString();
    const { error } = await db.from("push_broadcasts").insert({
      title: parsed.draft.title,
      title_bn: parsed.draft.titleBn,
      body: parsed.draft.body,
      body_bn: parsed.draft.bodyBn,
      href: parsed.draft.href,
      devices: result.devices,
      accepted: result.accepted,
      sent_by: user.email ?? user.id,
      sent_at: sentAt,
    });
    if (error && isMissing(error)) return apiError(MISSING, 503);
    return apiJson({ ok: true as const, devices: result.devices, accepted: result.accepted, sentAt });
  },
  { roles: ROLES, limit: 10 },
);
