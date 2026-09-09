/**
 * Engagement data-access (contact · newsletter · homepage CMS · media
 * library · staff notifications · ops settings).
 *
 * Public intakes take the service-role client (they run for anonymous
 * visitors, like the review/order intakes); staff reads/writes take the
 * RLS-bound staff client from requireStaff(), so database policies — not
 * route code — decide what staff may touch.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeSettings } from "../home-cms";
import { HOME_DEFAULTS } from "../home-cms";
import type { AdminSettings } from "../settings-store";
import { SETTINGS_DEFAULTS } from "../settings-store";
import type { Notif, NotifKind } from "../notification-store";
import {
  cleanEmail,
  HOMEPAGE_SETTING_KEY,
  isPlausibleEmail,
  OPS_SETTING_KEY,
  sanitizeHomeSettings,
  sanitizeOpsSettings,
  validateContact,
  type ContactInput,
  type ContactMessage,
  type ContactStatus,
  type LibraryMediaItem,
  type Subscriber,
} from "../engagement";
import { AdminInputError } from "./admin";
import type {
  DbContactMessage,
  DbMediaLibrary,
  DbNewsletterSubscriber,
  DbNotification,
  DbSiteSetting,
} from "./types";
import {
  mapContactMessage,
  mapLibraryMedia,
  mapNotification,
  mapSubscriber,
} from "../engagement";

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/* ------------------------------------------------------------------ */
/* Staff notifications                                                 */
/* ------------------------------------------------------------------ */

export interface StaffNotice {
  kind: NotifKind;
  title: string;
  body?: string;
  href?: string;
}

/**
 * Fan a notice out to every staff member's inbox (the notifications table
 * is per-recipient). Never throws — a bell that fails must never break a
 * checkout, an application or a moderation write.
 */
export const notifyStaff = async (
  db: SupabaseClient,
  notice: StaffNotice,
): Promise<void> => {
  try {
    const { data: staff } = await db
      .from("admin_users")
      .select("id")
      .in("role", ["manager", "admin", "super_admin"])
      .limit(50);
    const ids = ((staff ?? []) as { id: string }[])
      .map((s) => s.id)
      .filter((id) => typeof id === "string" && id !== "");
    if (ids.length === 0) return;
    const rows = ids.map((recipient) => ({
      recipient,
      kind: notice.kind,
      title: clean(notice.title, 160) || "PROSANTI update",
      body: clean(notice.body ?? "", 500),
      href: clean(notice.href ?? "", 200) || null,
      read: false,
    }));
    await db.from("notifications").insert(rows);
  } catch {
    // Notification delivery is best-effort by design.
  }
};

export const listMyNotifications = async (
  db: SupabaseClient,
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<Notif[]> => {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 50));
  let query = db
    .from("notifications")
    .select("*")
    .eq("recipient", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.unreadOnly) query = query.eq("read", false);
  const { data, error } = await query;
  if (error) throw new Error("Could not load notifications.");
  return ((data ?? []) as DbNotification[]).map(mapNotification);
};

export const markNotificationRead = async (
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> => {
  if (!id) throw new AdminInputError("Notification id is required.", 400);
  const { error } = await db
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("recipient", userId);
  if (error) throw new Error("Could not update the notification.");
};

export const markAllNotificationsRead = async (
  db: SupabaseClient,
  userId: string,
): Promise<void> => {
  const { error } = await db
    .from("notifications")
    .update({ read: true })
    .eq("recipient", userId)
    .eq("read", false);
  if (error) throw new Error("Could not update notifications.");
};

/* ------------------------------------------------------------------ */
/* Contact                                                             */
/* ------------------------------------------------------------------ */

export const createContactMessage = async (
  db: SupabaseClient,
  raw: unknown,
): Promise<ContactMessage> => {
  const checked = validateContact(raw);
  if (!checked.ok) {
    const first =
      checked.errors.name ?? checked.errors.phone ?? checked.errors.message;
    throw new AdminInputError(first ?? "Invalid message.", 422);
  }
  const value: ContactInput = checked.value;
  const { data, error } = await db
    .from("contact_messages")
    .insert({
      name: value.name,
      phone: value.phone,
      topic: value.topic,
      message: value.message,
      status: "new",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not save the message.");
  return mapContactMessage(data as DbContactMessage);
};

const CONTACT_STATUSES: readonly ContactStatus[] = ["new", "read", "replied"];

export const listContactMessages = async (
  db: SupabaseClient,
  status?: string,
): Promise<ContactMessage[]> => {
  let query = db
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (
    status &&
    (CONTACT_STATUSES as readonly string[]).includes(status)
  ) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) throw new Error("Could not load messages.");
  return ((data ?? []) as DbContactMessage[]).map(mapContactMessage);
};

export const setContactMessageStatus = async (
  db: SupabaseClient,
  id: string,
  status: string,
): Promise<ContactMessage> => {
  if (!id) throw new AdminInputError("Message id is required.", 400);
  if (!(CONTACT_STATUSES as readonly string[]).includes(status)) {
    throw new AdminInputError("Unknown status.", 400);
  }
  const { data, error } = await db
    .from("contact_messages")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new AdminInputError("Message not found.", 404);
  }
  return mapContactMessage(data as DbContactMessage);
};

/* ------------------------------------------------------------------ */
/* Newsletter                                                          */
/* ------------------------------------------------------------------ */

export const subscribeNewsletter = async (
  db: SupabaseClient,
  rawEmail: unknown,
): Promise<{ subscriber: Subscriber; created: boolean }> => {
  const email = cleanEmail(rawEmail);
  if (!isPlausibleEmail(email)) {
    throw new AdminInputError("Enter a valid email address.", 422);
  }
  const { data: existing } = await db
    .from("newsletter_subscribers")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    const row = existing as DbNewsletterSubscriber;
    if (row.status === "subscribed") {
      return { subscriber: mapSubscriber(row), created: false };
    }
    const { data, error } = await db
      .from("newsletter_subscribers")
      .update({ status: "subscribed" })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error || !data) throw new Error("Could not save the signup.");
    return { subscriber: mapSubscriber(data as DbNewsletterSubscriber), created: false };
  }
  const { data, error } = await db
    .from("newsletter_subscribers")
    .insert({ email, status: "subscribed" })
    .select("*")
    .single();
  if (error || !data) {
    // A concurrent signup wins the unique race — treat as already joined.
    if (String(error?.code) === "23505") {
      const { data: raced } = await db
        .from("newsletter_subscribers")
        .select("*")
        .eq("email", email)
        .single();
      if (raced) {
        return {
          subscriber: mapSubscriber(raced as DbNewsletterSubscriber),
          created: false,
        };
      }
    }
    throw new Error("Could not save the signup.");
  }
  return { subscriber: mapSubscriber(data as DbNewsletterSubscriber), created: true };
};

export const unsubscribeNewsletter = async (
  db: SupabaseClient,
  token: string,
): Promise<boolean> => {
  const t = clean(token, 64);
  if (t === "") return false;
  const { data, error } = await db
    .from("newsletter_subscribers")
    .update({ status: "unsubscribed" })
    .eq("token", t)
    .select("id");
  if (error) throw new Error("Could not update the signup.");
  return (data ?? []).length > 0;
};

export const listSubscribers = async (
  db: SupabaseClient,
): Promise<Subscriber[]> => {
  const { data, error } = await db
    .from("newsletter_subscribers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error("Could not load subscribers.");
  return ((data ?? []) as DbNewsletterSubscriber[]).map(mapSubscriber);
};

export const deleteSubscriber = async (
  db: SupabaseClient,
  id: string,
): Promise<void> => {
  if (!id) throw new AdminInputError("Subscriber id is required.", 400);
  const { error } = await db
    .from("newsletter_subscribers")
    .delete()
    .eq("id", id);
  if (error) throw new Error("Could not remove the subscriber.");
};

/* ------------------------------------------------------------------ */
/* Homepage CMS (site_settings['homepage'])                            */
/* ------------------------------------------------------------------ */

export const readHomepageSetting = async (
  db: SupabaseClient,
): Promise<HomeSettings> => {
  const { data, error } = await db
    .from("site_settings")
    .select("value")
    .eq("key", HOMEPAGE_SETTING_KEY)
    .maybeSingle();
  if (error || !data) return HOME_DEFAULTS;
  return sanitizeHomeSettings((data as DbSiteSetting).value);
};

export const writeHomepageSetting = async (
  db: SupabaseClient,
  raw: unknown,
): Promise<HomeSettings> => {
  const settings = sanitizeHomeSettings(raw);
  const { error } = await db
    .from("site_settings")
    .upsert({ key: HOMEPAGE_SETTING_KEY, value: settings });
  if (error) throw new Error("Could not save the homepage.");
  return settings;
};

/* ------------------------------------------------------------------ */
/* Media library                                                       */
/* ------------------------------------------------------------------ */

const isHttpUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export const listMediaLibrary = async (
  db: SupabaseClient,
): Promise<LibraryMediaItem[]> => {
  const { data, error } = await db
    .from("media_library")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Could not load the media library.");
  return ((data ?? []) as DbMediaLibrary[]).map(mapLibraryMedia);
};

export const addMediaLibrary = async (
  db: SupabaseClient,
  raw: unknown,
): Promise<LibraryMediaItem> => {
  const b = (raw ?? {}) as Record<string, unknown>;
  const url = clean(b.url, 2000);
  if (!isHttpUrl(url)) {
    throw new AdminInputError("Paste a full http(s) image URL.", 422);
  }
  const alt = clean(b.alt, 200);
  const { data, error } = await db
    .from("media_library")
    .insert({ url, alt, label: clean(b.label, 200) || alt || "Library image" })
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not add the image.");
  return mapLibraryMedia(data as DbMediaLibrary);
};

export const deleteMediaLibrary = async (
  db: SupabaseClient,
  id: string,
): Promise<void> => {
  if (!id) throw new AdminInputError("Media id is required.", 400);
  const { error } = await db.from("media_library").delete().eq("id", id);
  if (error) throw new Error("Could not remove the image.");
};

/* ------------------------------------------------------------------ */
/* Ops settings (site_settings['ops'])                                 */
/* ------------------------------------------------------------------ */

export const readOpsSettings = async (
  db: SupabaseClient,
): Promise<AdminSettings> => {
  const { data, error } = await db
    .from("site_settings")
    .select("value")
    .eq("key", OPS_SETTING_KEY)
    .maybeSingle();
  if (error || !data) return SETTINGS_DEFAULTS;
  return sanitizeOpsSettings((data as DbSiteSetting).value);
};

export const writeOpsSettings = async (
  db: SupabaseClient,
  raw: unknown,
): Promise<AdminSettings> => {
  const settings = sanitizeOpsSettings(raw);
  const { error } = await db
    .from("site_settings")
    .upsert({ key: OPS_SETTING_KEY, value: settings });
  if (error) throw new Error("Could not save settings.");
  return settings;
};
