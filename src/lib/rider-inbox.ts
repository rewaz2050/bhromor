/**
 * Rider inbox — office announcements (202610020001). Pure helpers shared by
 * the API and the app: normalising rows, the unread rule, validating a post.
 */

export type AnnouncementSeverity = "info" | "important";

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  /** true = addressed to this rider only; false = broadcast to everyone. */
  personal: boolean;
  at: number;
  unread: boolean;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string | null;
  severity: string | null;
  rider_id: string | null;
  created_at: string;
  expires_at: string | null;
}

/** Without a read marker only the last 14 days count as unread (a new rider must not see 200 old notices as new). */
export const UNREAD_WINDOW_MS = 14 * 24 * 3_600_000;

export const toInboxItems = (
  rows: readonly AnnouncementRow[],
  lastReadAt: number | null,
  now: number = Date.now(),
): InboxItem[] =>
  rows
    .filter((r) => !r.expires_at || Date.parse(r.expires_at) > now)
    .map((r) => {
      const at = Date.parse(r.created_at) || 0;
      const floor = lastReadAt ?? now - UNREAD_WINDOW_MS;
      return {
        id: r.id,
        title: r.title,
        body: r.body ?? "",
        severity: (r.severity === "important" ? "important" : "info") as AnnouncementSeverity,
        personal: r.rider_id !== null,
        at,
        unread: at > floor,
      };
    })
    .sort((a, b) => b.at - a.at);

export interface AnnouncementInput {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  riderId: string | null;
  expiresHours: number | null;
}

/** Validates the admin form body; returns the clean input or an error message. */
export const parseAnnouncementInput = (raw: unknown): AnnouncementInput | { error: string } => {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (title.length < 1 || title.length > 120) return { error: "শিরোনাম ১–১২০ অক্ষরের হতে হবে।" };
  if (body.length > 1000) return { error: "বার্তা ১০০০ অক্ষরের বেশি হতে পারবে না।" };
  const riderId = typeof b.riderId === "string" && b.riderId ? b.riderId : null;
  if (riderId && !/^[0-9a-f-]{36}$/i.test(riderId)) return { error: "রাইডার আইডি সঠিক নয়।" };
  const hours = Number(b.expiresHours);
  const expiresHours = Number.isFinite(hours) && hours > 0 ? Math.min(Math.floor(hours), 24 * 90) : null;
  return { title, body, severity: b.severity === "important" ? "important" : "info", riderId, expiresHours };
};
