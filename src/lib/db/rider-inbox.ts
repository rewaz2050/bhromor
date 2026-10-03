import "server-only";

/**
 * Rider inbox data (202610020001). Riders read/mark through the service
 * client scoped to their own id; staff post and delete through SECURITY
 * DEFINER RPCs on their own JWT. A database without the migration answers
 * `ready:false` / null instead of an error.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbObject } from "./riders";
import { toInboxItems, type AnnouncementRow, type AnnouncementInput, type InboxItem } from "../rider-inbox";

export interface RiderInbox {
  ready: boolean;
  items: InboxItem[];
  unread: number;
}

export const getRiderInbox = async (service: SupabaseClient, riderId: string): Promise<RiderInbox> => {
  const [rowsRes, stateRes] = await Promise.all([
    service
      .from("rider_announcements")
      .select("id, title, body, severity, rider_id, created_at, expires_at")
      .or(`rider_id.is.null,rider_id.eq.${riderId}`)
      .order("created_at", { ascending: false })
      .limit(40),
    service.from("rider_inbox_state").select("last_read_at").eq("rider_id", riderId).maybeSingle(),
  ]);
  if (rowsRes.error) {
    if (isMissingDbObject(rowsRes.error)) return { ready: false, items: [], unread: 0 };
    throw new Error("rider inbox read failed");
  }
  const lastRead = !stateRes.error && stateRes.data
    ? Date.parse((stateRes.data as { last_read_at: string }).last_read_at) || null
    : null;
  const items = toInboxItems((rowsRes.data ?? []) as AnnouncementRow[], lastRead);
  return { ready: true, items, unread: items.filter((i) => i.unread).length };
};

export const markRiderInboxRead = async (service: SupabaseClient, riderId: string): Promise<void> => {
  const { error } = await service
    .from("rider_inbox_state")
    .upsert({ rider_id: riderId, last_read_at: new Date().toISOString() }, { onConflict: "rider_id" });
  if (error && !isMissingDbObject(error)) throw new Error("rider inbox mark-read failed");
};

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: "info" | "important";
  riderId: string | null;
  riderName: string | null;
  at: number;
  expiresAt: number | null;
}

export const listAnnouncementsForStaff = async (staffDb: SupabaseClient): Promise<AdminAnnouncement[] | null> => {
  const { data, error } = await staffDb
    .from("rider_announcements")
    .select("id, title, body, severity, rider_id, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingDbObject(error)) return null;
    throw new Error("announcements read failed");
  }
  const rows = (data ?? []) as AnnouncementRow[];
  const ids = [...new Set(rows.map((r) => r.rider_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: riders } = await staffDb.from("riders").select("id, name").in("id", ids);
    for (const r of (riders ?? []) as { id: string; name: string }[]) names.set(r.id, r.name);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body ?? "",
    severity: r.severity === "important" ? "important" : "info",
    riderId: r.rider_id,
    riderName: r.rider_id ? (names.get(r.rider_id) ?? null) : null,
    at: Date.parse(r.created_at) || 0,
    expiresAt: r.expires_at ? Date.parse(r.expires_at) || null : null,
  }));
};

export const postAnnouncement = async (staffDb: SupabaseClient, input: AnnouncementInput): Promise<string> => {
  const { data, error } = await staffDb.rpc("ps_admin_post_announcement", {
    p_title: input.title,
    p_body: input.body,
    p_severity: input.severity,
    p_rider_id: input.riderId,
    p_expires_hours: input.expiresHours,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("rider_not_found")) throw new Error("rider_not_found");
    if (msg.includes("forbidden")) throw new Error("forbidden");
    throw new Error("announcement post failed");
  }
  return String(data);
};

export const deleteAnnouncement = async (staffDb: SupabaseClient, id: string): Promise<void> => {
  const { error } = await staffDb.rpc("ps_admin_delete_announcement", { p_id: id });
  if (error) throw new Error("announcement delete failed");
};

/** Active riders a message can be addressed to (name picker). */
export const listAddressableRiders = async (staffDb: SupabaseClient): Promise<{ id: string; name: string }[]> => {
  const { data, error } = await staffDb
    .from("riders")
    .select("id, name")
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(300);
  if (error) return [];
  return ((data ?? []) as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name }));
};
