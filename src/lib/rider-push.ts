import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

const clean = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
export const isRiderPushConfigured = () => Boolean(process.env.PUSH_VAPID_PUBLIC_KEY && process.env.PUSH_VAPID_PRIVATE_KEY);
export const publicRiderVapidKey = () => clean(process.env.PUSH_VAPID_PUBLIC_KEY, 500) || null;
let configured = false;
const setup = () => {
  if (configured) return true;
  if (!isRiderPushConfigured()) return false;
  try { webpush.setVapidDetails(process.env.PUSH_VAPID_SUBJECT?.trim() || "mailto:ops@prosanti.example", process.env.PUSH_VAPID_PUBLIC_KEY!, process.env.PUSH_VAPID_PRIVATE_KEY!); configured = true; return true; } catch { return false; }
};

export const saveRiderPush = async (db: SupabaseClient, riderId: string, raw: { endpoint?: unknown; p256dh?: unknown; auth?: unknown }) => {
  const endpoint = clean(raw.endpoint, 500), p256dh = clean(raw.p256dh, 200), auth = clean(raw.auth, 200);
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return { ok: false as const, reason: "invalid" as const };
  const { error } = await db.from("rider_push_subscriptions").upsert({ rider_id: riderId, endpoint, p256dh, auth, updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (!error) return { ok: true as const };
  return { ok: false as const, reason: error.code === "42P01" || error.code === "PGRST205" ? "missing_table" as const : "error" as const };
};

export const removeRiderPush = async (db: SupabaseClient, riderId: string, endpoint: unknown) => { const e = clean(endpoint, 500); if (e) await db.from("rider_push_subscriptions").delete().eq("rider_id", riderId).eq("endpoint", e); };

export const sendRiderOfferPush = async (db: SupabaseClient, riderIds: string[], payload: { title: string; body: string; href?: string }) => {
  if (!setup() || riderIds.length === 0) return;
  const { data } = await db.from("rider_push_subscriptions").select("rider_id,endpoint,p256dh,auth").in("rider_id", riderIds).limit(200);
  await Promise.allSettled((data ?? []).map(async (row) => {
    try { await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify({ title: payload.title, body: payload.body, href: payload.href ?? "/rider" })); }
    catch (error: unknown) { if ((error as { statusCode?: number }).statusCode === 404 || (error as { statusCode?: number }).statusCode === 410) await db.from("rider_push_subscriptions").delete().eq("endpoint", row.endpoint); }
  }));
};
